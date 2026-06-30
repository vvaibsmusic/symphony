"""Fill artists with 0 songs using YouTube Data API v3 search + ytmusicapi fallback."""

import sys
import os
import time
import hashlib

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from db import get_connection, init_db

# YouTube Data API
API_KEY = os.getenv("YOUTUBE_API_KEY")
if not API_KEY:
    print("ERROR: YOUTUBE_API_KEY not set in .env")
    sys.exit(1)

try:
    from googleapiclient.discovery import build
    youtube = build("youtube", "v3", developerKey=API_KEY)
    print(f"✅ YouTube Data API v3 initialized")
except ImportError:
    print("ERROR: google-api-python-client not installed. Run: pip install google-api-python-client")
    sys.exit(1)

# ytmusicapi as second attempt
try:
    from ytmusicapi import YTMusic
    ytmusic = YTMusic()
    print("✅ ytmusicapi initialized")
except:
    ytmusic = None
    print("⚠️  ytmusicapi not available, using YouTube API only")


def generate_song_id(platform, platform_id):
    return hashlib.md5(f"{platform}:{platform_id}".encode()).hexdigest()


def search_youtube_api(artist_name, max_results=30):
    """Search YouTube Data API for an artist's music videos."""
    songs = []
    try:
        # Search for music videos by artist
        request = youtube.search().list(
            q=f"{artist_name} official music video",
            part="snippet",
            type="video",
            videoCategoryId="10",  # Music category
            maxResults=min(max_results, 50),
            order="viewCount",
        )
        response = request.execute()

        video_ids = []
        video_map = {}

        for item in response.get("items", []):
            vid = item["id"]["videoId"]
            snippet = item["snippet"]
            title = snippet.get("title", "Unknown")

            # Filter: title should contain something related to the artist
            if artist_name.lower().split()[0] not in title.lower() and artist_name.lower() not in snippet.get("channelTitle", "").lower():
                continue

            video_ids.append(vid)
            video_map[vid] = {
                "title": title,
                "video_id": vid,
                "thumbnail": snippet.get("thumbnails", {}).get("high", {}).get("url", ""),
                "release_date": snippet.get("publishedAt", "")[:10],
                "album": None,
            }

        # Get stats for matching videos
        if video_ids:
            stats_request = youtube.videos().list(
                part="statistics",
                id=",".join(video_ids[:50]),
            )
            stats_response = stats_request.execute()

            for item in stats_response.get("items", []):
                vid = item["id"]
                if vid in video_map:
                    stats = item.get("statistics", {})
                    video_map[vid]["views"] = int(stats.get("viewCount", 0))
                    video_map[vid]["likes"] = int(stats.get("likeCount", 0))
                    video_map[vid]["comments"] = int(stats.get("commentCount", 0))

        songs = list(video_map.values())

    except Exception as e:
        print(f"    [yt-api] Error: {e}")

    return songs


def search_ytmusic(artist_name):
    """Fallback: search ytmusicapi for songs."""
    if not ytmusic:
        return []
    songs = []
    try:
        results = ytmusic.search(artist_name, filter="songs", limit=30)
        for item in results:
            vid = item.get("videoId")
            if not vid:
                continue
            artists = [a.get("name", "") for a in item.get("artists", [])]
            if artist_name.lower() not in " ".join(artists).lower():
                continue
            album = item.get("album", {})
            songs.append({
                "title": item.get("title", "Unknown"),
                "video_id": vid,
                "album": album.get("name") if album else None,
                "views": 0,
                "likes": 0,
                "comments": 0,
                "thumbnail": (item.get("thumbnails", [{}])[-1].get("url", "") if item.get("thumbnails") else ""),
                "release_date": "",
            })
    except Exception as e:
        print(f"    [ytmusic-search] Error: {e}")
    return songs


def main():
    init_db()
    conn = get_connection()

    # Get all artists with 0 songs
    zero_artists = conn.execute("""
        SELECT a.id, a.name FROM artists a
        WHERE (SELECT COUNT(*) FROM songs WHERE artist_id = a.id) = 0
        ORDER BY a.name
    """).fetchall()

    print(f"\n{'='*60}")
    print(f"Populating {len(zero_artists)} artists with 0 songs")
    print(f"Using YouTube Data API v3 + ytmusicapi search fallback")
    print(f"{'='*60}\n")

    total_songs = 0
    filled = 0

    for idx, artist in enumerate(zero_artists):
        artist_id = artist["id"]
        name = artist["name"]
        print(f"[{idx+1}/{len(zero_artists)}] {name}")

        # Try YouTube Data API first
        songs = search_youtube_api(name)
        source = "yt-api"

        # Fallback to ytmusic search if nothing found
        if not songs:
            songs = search_ytmusic(name)
            source = "ytmusic-search"

        if songs:
            for song in songs:
                vid = song.get("video_id")
                if not vid:
                    continue
                song_id = generate_song_id("youtube", vid)
                views = song.get("views", 0) or 0
                likes = song.get("likes", 0) or 0
                comments = song.get("comments", 0) or 0

                conn.execute("""
                    INSERT OR IGNORE INTO songs (id, artist_id, title, platform, platform_id, album_name, release_date, thumbnail_url, created_at)
                    VALUES (?, ?, ?, 'youtube', ?, ?, ?, ?, datetime('now'))
                """, (song_id, artist_id, song.get("title", "Unknown"), vid, song.get("album") or "", song.get("release_date") or "", song.get("thumbnail") or ""))

                # Only add snapshot if the song actually belongs to this artist
                exists = conn.execute("SELECT 1 FROM songs WHERE id = ? AND artist_id = ?", (song_id, artist_id)).fetchone()
                if exists:
                    conn.execute("""
                        INSERT INTO play_snapshots (song_id, play_count, like_count, comment_count, platform, collected_at)
                        VALUES (?, ?, ?, ?, 'youtube', datetime('now'))
                    """, (song_id, views, likes, comments))

            conn.commit()
            total_songs += len(songs)
            filled += 1
            print(f"  ✅ [{source}] {len(songs)} songs (views: {sum(s.get('views', 0) or 0 for s in songs):,})")
        else:
            print(f"  ❌ No songs found")

        # Rate limit: YouTube API has 10K daily quota
        time.sleep(0.5)

    conn.close()
    print(f"\n{'='*60}")
    print(f"Done! Filled {filled}/{len(zero_artists)} artists with {total_songs} total songs")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
