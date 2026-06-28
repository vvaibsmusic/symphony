"""Enrich ALL artists with real YouTube API stats (views, likes, comments).
Uses key rotation between multiple API keys."""

import sys
import os
import time

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from db import get_connection, init_db, generate_cycle_id

# Load all API keys
API_KEYS = []
for var in ["YOUTUBE_API_KEY", "YOUTUBE_API_KEY_2", "YOUTUBE_API_KEY_3", "YOUTUBE_API_KEY_4"]:
    k = os.getenv(var)
    if k:
        API_KEYS.append(k)

if not API_KEYS:
    print("ERROR: No YOUTUBE_API_KEY set in .env")
    sys.exit(1)

try:
    from googleapiclient.discovery import build
except ImportError:
    print("ERROR: pip install google-api-python-client")
    sys.exit(1)

current_key_idx = 0
youtube = None
total_units_used = 0


def get_youtube():
    global youtube, current_key_idx
    youtube = build("youtube", "v3", developerKey=API_KEYS[current_key_idx])
    return youtube


def rotate_key():
    global current_key_idx
    if len(API_KEYS) <= 1:
        return None
    current_key_idx = (current_key_idx + 1) % len(API_KEYS)
    print(f"    ↻ Rotating to API key #{current_key_idx + 1}")
    return get_youtube()


def get_video_stats(video_ids):
    """Get stats for video IDs. Returns dict of {vid: {views, likes, comments}}."""
    global youtube, total_units_used
    if not video_ids:
        return {}

    results = {}
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i:i+50]
        try:
            response = youtube.videos().list(
                part="statistics",
                id=",".join(batch),
            ).execute()
            total_units_used += 1

            for item in response.get("items", []):
                vid = item["id"]
                stats = item.get("statistics", {})
                results[vid] = {
                    "views": int(stats.get("viewCount", 0)),
                    "likes": int(stats.get("likeCount", 0)),
                    "comments": int(stats.get("commentCount", 0)),
                }
        except Exception as e:
            if "quotaExceeded" in str(e):
                if rotate_key():
                    try:
                        response = youtube.videos().list(part="statistics", id=",".join(batch)).execute()
                        total_units_used += 1
                        for item in response.get("items", []):
                            vid = item["id"]
                            stats = item.get("statistics", {})
                            results[vid] = {
                                "views": int(stats.get("viewCount", 0)),
                                "likes": int(stats.get("likeCount", 0)),
                                "comments": int(stats.get("commentCount", 0)),
                            }
                    except Exception as e2:
                        print(f"    ✗ Error after rotation: {e2}")
                        return results
                else:
                    print(f"    ✗ Quota exceeded, no more keys!")
                    return results
            else:
                print(f"    ✗ Error: {e}")

    return results


def main():
    init_db()
    conn = get_connection()
    get_youtube()
    cycle_id = generate_cycle_id("youtube")
    print(f"Cycle ID: {cycle_id}")

    # Get ALL artists with songs
    all_artists = conn.execute("""
        SELECT a.id, a.name, COUNT(s.id) as song_count
        FROM artists a
        LEFT JOIN songs s ON s.artist_id = a.id AND s.platform = 'youtube'
        GROUP BY a.id
        HAVING song_count > 0
        ORDER BY a.name
    """).fetchall()

    print(f"\n{'='*70}")
    print(f"Enriching {len(all_artists)} artists with YouTube API stats")
    print(f"API keys: {len(API_KEYS)} | Estimated units: ~{len(all_artists) * 2}")
    print(f"{'='*70}\n")

    total_songs = 0
    total_likes = 0
    total_views = 0

    for idx, artist in enumerate(all_artists):
        artist_id = artist["id"]
        name = artist["name"]
        song_count = artist["song_count"]

        # Get songs with video IDs
        songs = conn.execute("""
            SELECT id, platform_id FROM songs
            WHERE artist_id = ? AND platform = 'youtube' AND platform_id IS NOT NULL
        """, (artist_id,)).fetchall()

        video_ids = [s["platform_id"] for s in songs if s["platform_id"]]
        song_map = {s["platform_id"]: s["id"] for s in songs if s["platform_id"]}

        if not video_ids:
            continue

        stats = get_video_stats(video_ids)

        if not stats:
            print(f"[{idx+1}/{len(all_artists)}] {name:30s} | ❌ no stats")
            continue

        a_views = 0
        a_likes = 0
        updated = 0
        for vid, data in stats.items():
            if vid in song_map:
                conn.execute("""
                    INSERT INTO play_snapshots (song_id, play_count, like_count, comment_count, platform, collected_at, cycle_id)
                    VALUES (?, ?, ?, ?, 'youtube', datetime('now'), ?)
                """, (song_map[vid], data["views"], data["likes"], data["comments"], cycle_id))
                a_views += data["views"]
                a_likes += data["likes"]
                updated += 1

        conn.commit()
        total_songs += updated
        total_likes += a_likes
        total_views += a_views

        vl = f"{a_views // a_likes}:1" if a_likes > 0 else "—"
        print(f"[{idx+1}/{len(all_artists)}] {name:30s} | {updated:3d} songs | {a_views:>14,} views | {a_likes:>8,} likes | V/L {vl}")

        time.sleep(0.1)

    # Log quota
    conn.execute(
        "INSERT INTO api_quota_log (operation, units_used, details) VALUES (?, ?, ?)",
        ("videos.list", total_units_used, f"enrich_all: {total_songs} songs across {len(all_artists)} artists")
    )
    conn.commit()
    conn.close()

    print(f"\n{'='*70}")
    print(f"Done!")
    print(f"  Artists: {len(all_artists)}")
    print(f"  Songs updated: {total_songs:,}")
    print(f"  Total views: {total_views:,}")
    print(f"  Total likes: {total_likes:,}")
    print(f"  API units: {total_units_used}")
    print(f"{'='*70}")


if __name__ == "__main__":
    main()
