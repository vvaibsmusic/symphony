"""Main data collector — fetches YouTube data for all artists, takes snapshots, detects viral spikes."""

import sys
import os
import time
import hashlib
from datetime import datetime
from typing import Any, Dict

# Setup paths so we can import from the collector module
project_dir = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, os.path.join(project_dir, "collector"))

from db import get_connection, init_db, upsert_song, insert_snapshot, get_previous_snapshot, insert_viral_alert, generate_cycle_id
from youtube_client import YouTubeClient
from dotenv import load_dotenv

load_dotenv(os.path.join(project_dir, ".env"))

# Viral detection threshold - YouTube views must grow by this factor
# Constants
YT_VIRAL_GROWTH_FACTOR = float(os.getenv("YT_VIRAL_GROWTH_FACTOR", "2.0"))


def generate_song_id(platform: str, platform_id: str) -> str:
    """Generate a deterministic song ID from platform + platform_id."""
    hash_str: str = str(hashlib.sha256(f"{platform}:{platform_id}".encode()).hexdigest())
    return hash_str[:16]


def collect_youtube_data(fast_mode: bool = False):
    """Main collection loop for YouTube data."""
    print(f"\n{'='*60}")
    mode_str = "FAST " if fast_mode else "DEEP "
    print(f"YouTube Data Collection ({mode_str}mode) — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}")

    init_db()
    conn = get_connection()
    yt = YouTubeClient()
    cycle_id = generate_cycle_id("youtube")
    print(f"Cycle ID: {cycle_id}")

    # Get all artists
    artists = conn.execute(
        "SELECT * FROM artists"
    ).fetchall()

    print(f"\nProcessing {len(artists)} artists...\n")

    total_viral: int = 0
    total_songs: int = 0

    for i, artist in enumerate(artists):
        artist_name = artist["name"]
        channel_id = artist["youtube_channel_id"]
        is_watched = bool(artist["is_watched"])
        print(f"\n[{i+1}/{len(artists)}] {artist_name} (Watched: {is_watched})", flush=True)

        try:
            # Step 1: Get songs based on watch status
            if is_watched:
                print(f"  [Search API] Fetching channel videos for watched artist")
                songs = yt.get_channel_videos(channel_id, max_results=50)
            else:
                print(f"  [ytmusicapi] Fetching songs via unofficial library")
                songs = yt.get_artist_songs_ytmusic(channel_id, artist_name, fast_mode=fast_mode)

            if not songs:
                print(f"  No songs found, skipping")
                continue

            # Collect video IDs for batch stats lookup
            video_ids = [s["video_id"] for s in songs if s.get("video_id")]

            # Step 2: Get exact view counts via YouTube Data API v3
            video_stats = {}
            if video_ids:
                video_stats = yt.get_video_stats(video_ids)

            # Step 3: Upsert songs and take snapshots
            for song in songs:
                vid = song.get("video_id")
                if not vid:
                    continue

                song_id = generate_song_id("youtube", vid)
                stats: Dict[str, Any] = dict(video_stats).get(vid, {})

                # Determine release date
                release_date = stats.get("published_at", "")
                if release_date and "T" in release_date:
                    release_date = release_date.split("T")[0]
                elif song.get("release_year"):
                    release_date = str(song["release_year"])

                # Determine view count — prefer API stats, fall back to ytmusic
                ytmusic_views = song.get("views", 0) or 0
                views = stats.get("views", ytmusic_views) or 0
                likes = stats.get("likes", 0)
                comments = stats.get("comments", 0)
                thumbnail = stats.get("thumbnail") or song.get("thumbnail", "")
                title = stats.get("title") or song.get("title", "Unknown")

                # Upsert the song
                upsert_song(conn, {
                    "id": song_id,
                    "artist_id": artist["id"],
                    "title": title,
                    "platform": "youtube",
                    "platform_id": vid,
                    "album_name": song.get("album"),
                    "release_date": release_date,
                    "thumbnail_url": thumbnail,
                })

                # Get previous snapshot for viral detection
                prev = get_previous_snapshot(conn, song_id, "youtube")

                # Insert new snapshot
                insert_snapshot(conn, song_id, views, likes, comments, "youtube", cycle_id, ytmusic_play_count=ytmusic_views)
                total_songs += 1

                # Viral detection
                if prev and prev["play_count"] and prev["play_count"] > 0 and views > 0:
                    growth = views / prev["play_count"]
                    if growth >= YT_VIRAL_GROWTH_FACTOR:
                        insert_viral_alert(conn, {
                            "song_id": song_id,
                            "previous_count": int(prev["play_count"]),
                            "current_count": views,
                            "growth_factor": float(f"{growth:.2f}"),
                            "platform": "youtube",
                        })
                        total_viral += 1
                        print(f"  🔥 VIRAL: '{title}' — {int(prev['play_count']):,} → {views:,} ({growth:.1f}x)")

            conn.commit()

            # Rate limit between artists
            time.sleep(1)

        except Exception as e:
            print(f"  ❌ Error: {e}")
            conn.commit()
            continue

    conn.close()

    print(f"\n{'='*60}")
    print(f"Collection complete!")
    print(f"  Songs processed: {total_songs}")
    print(f"  Viral alerts: {total_viral}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    fast_arg = "--fast" in sys.argv
    collect_youtube_data(fast_mode=fast_arg)
