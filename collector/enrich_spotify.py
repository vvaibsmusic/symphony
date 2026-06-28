"""Refresh Spotify popularity snapshots for existing Spotify tracks."""

import os
import sys
from datetime import datetime

from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(__file__))

from db import (  # noqa: E402
    get_connection,
    generate_cycle_id,
    get_previous_snapshot,
    init_db,
    insert_snapshot,
    insert_viral_alert,
)
from collect_spotify import (  # noqa: E402
    SPOTIFY_VIRAL_POPULARITY_JUMP,
    normalize_release_date,
)
from spotify_client import SpotifyClient  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


def enrich_spotify_data():
    """Refresh Spotify track popularity and insert new snapshots."""
    print(f"\n{'='*64}")
    print(f"Spotify Enrichment — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Viral jump threshold: +{SPOTIFY_VIRAL_POPULARITY_JUMP}")
    print(f"{'='*64}")

    init_db()
    conn = get_connection()
    client = SpotifyClient()
    cycle_id = generate_cycle_id("spotify")
    print(f"Cycle ID: {cycle_id}")

    songs = conn.execute(
        """
        SELECT s.id, s.platform_id, s.artist_id, a.name AS artist_name
        FROM songs s
        JOIN artists a ON s.artist_id = a.id
        WHERE s.platform = 'spotify'
          AND s.platform_id IS NOT NULL
        ORDER BY a.name, s.title
        """
    ).fetchall()

    if not songs:
        conn.close()
        print("\nNo Spotify songs found to enrich.\n")
        return {"songs_updated": 0, "viral_alerts": 0}

    total_updated = 0
    total_viral = 0

    for i in range(0, len(songs), 50):
        batch = songs[i : i + 50]
        track_ids = [row["platform_id"] for row in batch if row["platform_id"]]
        try:
            tracks = client.get_tracks(track_ids)
        except Exception as exc:
            print(f"  ❌ failed batch {i // 50 + 1}: {exc}")
            continue

        tracks_by_id = {track.get("id"): track for track in tracks if track and track.get("id")}
        for row in batch:
            track = tracks_by_id.get(row["platform_id"])
            if not track:
                continue

            popularity = int(track.get("popularity") or 0)
            prev = get_previous_snapshot(conn, row["id"], "spotify")
            insert_snapshot(conn, row["id"], popularity, 0, 0, "spotify", cycle_id)

            album = track.get("album") or {}
            images = album.get("images") or []
            conn.execute(
                """
                UPDATE songs
                SET title = ?,
                    album_name = ?,
                    release_date = ?,
                    thumbnail_url = ?
                WHERE id = ?
                """,
                (
                    track.get("name", "Unknown"),
                    album.get("name"),
                    normalize_release_date(album.get("release_date", "")),
                    images[0].get("url", "") if images else "",
                    row["id"],
                ),
            )

            total_updated += 1

            if prev and prev.get("play_count") is not None:
                delta = popularity - int(prev["play_count"])
                if delta >= SPOTIFY_VIRAL_POPULARITY_JUMP:
                    insert_viral_alert(
                        conn,
                        {
                            "song_id": row["id"],
                            "previous_count": int(prev["play_count"]),
                            "current_count": popularity,
                            "growth_factor": float(delta),
                            "platform": "spotify",
                        },
                    )
                    total_viral += 1

        conn.commit()
        print(
            f"  ✅ batch {i // 50 + 1}: {len(batch)} tracks processed "
            f"(running total: {total_updated})"
        )

    conn.close()
    print(f"\n{'='*64}")
    print("Spotify enrichment complete")
    print(f"  Songs updated: {total_updated}")
    print(f"  Viral alerts: {total_viral}")
    print(f"{'='*64}\n")
    return {"songs_updated": total_updated, "viral_alerts": total_viral}


if __name__ == "__main__":
    try:
        enrich_spotify_data()
    except Exception as exc:
        print(f"Spotify enrichment failed: {exc}")
        sys.exit(1)
