"""Enrich bottom 50 artists with real YouTube API stats (views, likes, comments)."""

import sys
import os
import time

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from db import get_connection, init_db

# Load both API keys for rotation
API_KEYS = [
    os.getenv("YOUTUBE_API_KEY"),
    os.getenv("YOUTUBE_API_KEY_2"),
]
API_KEYS = [k for k in API_KEYS if k]

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
    print(f"  Using API key #{current_key_idx + 1}")
    return youtube


def rotate_key():
    global current_key_idx
    current_key_idx = (current_key_idx + 1) % len(API_KEYS)
    print(f"  ⚠ Rotating to API key #{current_key_idx + 1}")
    return get_youtube()


def get_video_stats(video_ids):
    """Get stats for a batch of video IDs (max 50). Returns dict of {vid: {views, likes, comments}}."""
    global youtube, total_units_used
    if not video_ids:
        return {}
    
    results = {}
    # Process in batches of 50
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i:i+50]
        try:
            response = youtube.videos().list(
                part="statistics",
                id=",".join(batch),
            ).execute()
            total_units_used += 1  # videos.list = 1 unit

            for item in response.get("items", []):
                vid = item["id"]
                stats = item.get("statistics", {})
                results[vid] = {
                    "views": int(stats.get("viewCount", 0)),
                    "likes": int(stats.get("likeCount", 0)),
                    "comments": int(stats.get("commentCount", 0)),
                }
        except Exception as e:
            err = str(e)
            if "quotaExceeded" in err and len(API_KEYS) > 1:
                rotate_key()
                # Retry this batch
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
                    print(f"    Error after rotation: {e2}")
            else:
                print(f"    Error fetching stats: {e}")
    
    return results


def main():
    init_db()
    conn = get_connection()
    get_youtube()

    # Get bottom 50 artists by total views
    bottom_artists = conn.execute("""
        SELECT a.id, a.name,
            COUNT(s.id) as song_count,
            COALESCE(SUM(
                (SELECT play_count FROM play_snapshots
                 WHERE song_id = s.id ORDER BY collected_at DESC LIMIT 1)
            ), 0) as total_views
        FROM artists a
        LEFT JOIN songs s ON s.artist_id = a.id AND s.platform = 'youtube'
        GROUP BY a.id
        HAVING song_count > 0
        ORDER BY total_views ASC
        LIMIT 50
    """).fetchall()

    print(f"\n{'='*70}")
    print(f"Enriching bottom {len(bottom_artists)} artists with YouTube API stats")
    print(f"API keys available: {len(API_KEYS)}")
    print(f"{'='*70}\n")

    total_songs_updated = 0
    total_likes_found = 0

    for idx, artist in enumerate(bottom_artists):
        artist_id = artist["id"]
        name = artist["name"]
        current_views = artist["total_views"]
        song_count = artist["song_count"]

        print(f"[{idx+1}/{len(bottom_artists)}] {name} ({song_count} songs, {current_views:,} views)")

        # Get all YouTube songs for this artist
        songs = conn.execute("""
            SELECT id, platform_id, title FROM songs
            WHERE artist_id = ? AND platform = 'youtube' AND platform_id IS NOT NULL
        """, (artist_id,)).fetchall()

        if not songs:
            print(f"  ⏭ No songs with video IDs")
            continue

        video_ids = [s["platform_id"] for s in songs if s["platform_id"]]
        song_map = {s["platform_id"]: s for s in songs if s["platform_id"]}

        # Fetch real stats from YouTube API
        stats = get_video_stats(video_ids)

        if not stats:
            print(f"  ❌ No stats returned")
            continue

        updated = 0
        artist_likes = 0
        artist_views = 0
        for vid, data in stats.items():
            if vid in song_map:
                song_id = song_map[vid]["id"]
                views = data["views"]
                likes = data["likes"]
                comments = data["comments"]
                artist_views += views
                artist_likes += likes

                # Insert a fresh snapshot with real data
                conn.execute("""
                    INSERT INTO play_snapshots (song_id, play_count, like_count, comment_count, platform, collected_at)
                    VALUES (?, ?, ?, ?, 'youtube', datetime('now'))
                """, (song_id, views, likes, comments))
                updated += 1

        conn.commit()
        total_songs_updated += updated
        total_likes_found += artist_likes

        vl_ratio = f"{artist_views / artist_likes:.0f}:1" if artist_likes > 0 else "N/A"
        print(f"  ✅ {updated} songs | Views: {artist_views:,} | Likes: {artist_likes:,} | V/L: {vl_ratio}")

        time.sleep(0.2)

    # Log quota usage
    conn.execute(
        "INSERT INTO api_quota_log (operation, units_used, details) VALUES (?, ?, ?)",
        ("videos.list", total_units_used, f"enrich_bottom50: {total_songs_updated} songs")
    )
    conn.commit()
    conn.close()

    print(f"\n{'='*70}")
    print(f"Done! Updated {total_songs_updated} songs across {len(bottom_artists)} artists")
    print(f"Total likes found: {total_likes_found:,}")
    print(f"API units used: {total_units_used}")
    print(f"{'='*70}")


if __name__ == "__main__":
    main()
