"""Collect Spotify tracks and popularity snapshots for artists."""

import argparse
import hashlib
import os
import sys
from datetime import datetime
from typing import Dict, List

from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(__file__))

from db import (  # noqa: E402
    get_connection,
    generate_cycle_id,
    get_previous_snapshot,
    init_db,
    insert_snapshot,
    insert_viral_alert,
    upsert_song,
)
from spotify_client import SpotifyClient  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

SPOTIFY_MARKET = os.getenv("SPOTIFY_MARKET", "IN")
SPOTIFY_VIRAL_POPULARITY_JUMP = int(os.getenv("SPOTIFY_VIRAL_POPULARITY_JUMP", "20"))
MAX_ALBUMS = int(os.getenv("SPOTIFY_DISCOVER_MAX_ALBUMS", "10"))
MAX_RECENT_TRACKS = int(os.getenv("SPOTIFY_DISCOVER_MAX_TRACKS", "120"))


def generate_song_id(platform: str, platform_id: str) -> str:
    """Generate deterministic song ID from platform and platform ID."""
    return hashlib.sha256(f"{platform}:{platform_id}".encode()).hexdigest()[:16]


def normalize_release_date(value: str) -> str:
    """Normalize Spotify release_date to YYYY-MM-DD when possible."""
    if not value:
        return ""
    value = value.strip()
    if len(value) == 4:
        return f"{value}-01-01"
    if len(value) == 7:
        return f"{value}-01"
    if len(value) >= 10:
        return value[:10]
    return value


def get_track_thumbnail(track: Dict) -> str:
    """Select best thumbnail URL from track payload."""
    images = (track.get("album") or {}).get("images") or []
    if images:
        return images[0].get("url", "")
    return ""


def build_song_payload(artist_id: str, track: Dict) -> Dict:
    """Map Spotify track payload to internal song representation."""
    track_id = track.get("id")
    album = track.get("album") or {}
    return {
        "id": generate_song_id("spotify", track_id),
        "artist_id": artist_id,
        "title": track.get("name", "Unknown"),
        "platform": "spotify",
        "platform_id": track_id,
        "album_name": album.get("name"),
        "release_date": normalize_release_date(album.get("release_date", "")),
        "thumbnail_url": get_track_thumbnail(track),
    }


def fetch_recent_album_tracks(client: SpotifyClient, spotify_artist_id: str) -> List[Dict]:
    """Fetch recent album/single tracks for an artist with album metadata."""
    albums = client.get_artist_albums(
        spotify_artist_id,
        include_groups="album,single",
        limit=50,
        market=SPOTIFY_MARKET,
    )
    albums = sorted(albums, key=lambda a: (a.get("release_date") or ""), reverse=True)[:MAX_ALBUMS]

    tracks: List[Dict] = []
    seen = set()
    rank = 0
    for album in albums:
        album_id = album.get("id")
        if not album_id:
            continue
        album_tracks = client.get_album_tracks(album_id, limit=20)
        for track in album_tracks:
            track_id = track.get("id")
            if not track_id or track_id in seen:
                continue
            seen.add(track_id)
            rank += 1
            enriched = dict(track)
            enriched["album"] = {
                "name": album.get("name"),
                "release_date": album.get("release_date"),
                "images": album.get("images") or [],
            }
            enriched["_fallback_rank"] = rank
            tracks.append(enriched)
            if len(tracks) >= MAX_RECENT_TRACKS:
                return tracks
    return tracks


def collect_tracks_for_artist(conn, client: SpotifyClient, artist, market: str = SPOTIFY_MARKET) -> Dict:
    """Collect top + recent Spotify tracks for a single artist."""
    spotify_artist_id = artist["spotify_id"]
    if not spotify_artist_id:
        return {"songs_processed": 0, "viral_alerts": 0}

    popularity_jump = SPOTIFY_VIRAL_POPULARITY_JUMP

    top_tracks: List[Dict] = []
    try:
        top_tracks = client.get_artist_top_tracks(spotify_artist_id, market=market)
    except Exception:
        top_tracks = []

    recent_album_tracks = fetch_recent_album_tracks(client, spotify_artist_id)
    recent_track_ids = [track.get("id") for track in recent_album_tracks if track.get("id")]

    recent_tracks: List[Dict] = []
    if recent_track_ids:
        try:
            recent_tracks = client.get_tracks(recent_track_ids)
        except Exception:
            recent_tracks = []

    full_tracks_by_id = {}
    for track in top_tracks + recent_tracks:
        track_id = track.get("id")
        if track_id:
            full_tracks_by_id[track_id] = track

    all_tracks = []
    seen = set()
    for track in top_tracks + recent_album_tracks:
        track_id = track.get("id")
        if not track_id or track_id in seen:
            continue
        seen.add(track_id)
        all_tracks.append(full_tracks_by_id.get(track_id, track))

    processed = 0
    viral = 0
    for idx, track in enumerate(all_tracks, start=1):
        track_id = track.get("id")
        if not track_id:
            continue

        song = build_song_payload(artist["id"], track)
        upsert_song(conn, song)

        popularity_raw = track.get("popularity")
        if popularity_raw is None:
            fallback_rank = int(track.get("_fallback_rank") or idx)
            popularity = max(1, 101 - min(fallback_rank, 100))
        else:
            popularity = int(popularity_raw or 0)

        prev = get_previous_snapshot(conn, song["id"], "spotify")
        insert_snapshot(conn, song["id"], popularity, 0, 0, "spotify")
        processed += 1

        if prev and prev.get("play_count") is not None:
            delta = popularity - int(prev["play_count"])
            if delta >= popularity_jump:
                insert_viral_alert(
                    conn,
                    {
                        "song_id": song["id"],
                        "previous_count": int(prev["play_count"]),
                        "current_count": popularity,
                        "growth_factor": float(delta),
                        "platform": "spotify",
                    },
                )
                viral += 1

    return {"songs_processed": processed, "viral_alerts": viral}


def resolve_artist_spotify_id(client: SpotifyClient, artist_name: str) -> Dict:
    """Resolve Spotify artist metadata by name."""
    matches = client.search_artist(artist_name, limit=5)
    if not matches:
        return {}

    exact = None
    for item in matches:
        if (item.get("name") or "").strip().lower() == artist_name.strip().lower():
            exact = item
            break
    best = exact or matches[0]
    images = best.get("images") or []
    return {
        "spotify_id": best.get("id"),
        "name": best.get("name"),
        "image_url": images[0].get("url") if images else None,
    }


def collect_artist_by_id(artist_id: str, market: str = SPOTIFY_MARKET) -> Dict:
    """Collect Spotify data for one artist ID."""
    init_db()
    conn = get_connection()
    artist = conn.execute(
        "SELECT id, name, spotify_id FROM artists WHERE id = ?",
        (artist_id,),
    ).fetchone()
    if not artist:
        conn.close()
        raise ValueError(f"Artist '{artist_id}' not found")
    if not artist["spotify_id"]:
        conn.close()
        raise ValueError(f"Artist '{artist['name']}' has no spotify_id")

    result = collect_tracks_for_artist(conn, SpotifyClient(), artist, market=market)
    conn.commit()
    conn.close()
    return result


def collect_all_spotify_data(market: str = SPOTIFY_MARKET) -> Dict:
    """Collect Spotify data for all artists with spotify_id."""
    print(f"\n{'='*64}")
    print(f"Spotify Discover Collection — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Market: {market} | Viral jump threshold: +{SPOTIFY_VIRAL_POPULARITY_JUMP}")
    print(f"{'='*64}")

    init_db()
    conn = get_connection()
    client = SpotifyClient()

    artists = conn.execute(
        "SELECT id, name, spotify_id FROM artists WHERE spotify_id IS NOT NULL ORDER BY name"
    ).fetchall()
    print(f"\nProcessing {len(artists)} artists...\n")

    total_songs = 0
    total_viral = 0
    for i, artist in enumerate(artists, start=1):
        print(f"[{i}/{len(artists)}] {artist['name']}", flush=True)
        try:
            result = collect_tracks_for_artist(conn, client, artist, market=market)
            conn.commit()
            total_songs += result["songs_processed"]
            total_viral += result["viral_alerts"]
            print(
                f"  ✅ songs: {result['songs_processed']} | viral: {result['viral_alerts']}"
            )
        except Exception as exc:
            err = str(exc)
            conn.rollback()

            # If spotify_id is stale/invalid, try resolving by artist name and retry once.
            if "404" in err and "Resource not found" in err:
                try:
                    resolved = resolve_artist_spotify_id(client, artist["name"])
                    new_id = resolved.get("spotify_id")
                    if new_id and new_id != artist["spotify_id"]:
                        conn.execute(
                            "UPDATE artists SET spotify_id = ?, image_url = COALESCE(image_url, ?) WHERE id = ?",
                            (new_id, resolved.get("image_url"), artist["id"]),
                        )
                        conn.commit()

                        retry_artist = dict(artist)
                        retry_artist["spotify_id"] = new_id
                        retry_result = collect_tracks_for_artist(conn, client, retry_artist, market=market)
                        conn.commit()
                        total_songs += retry_result["songs_processed"]
                        total_viral += retry_result["viral_alerts"]
                        print(
                            f"  ↻ resolved spotify_id and retried: songs={retry_result['songs_processed']} "
                            f"viral={retry_result['viral_alerts']}"
                        )
                        continue
                except Exception as retry_exc:
                    conn.rollback()
                    print(f"  ❌ retry error: {retry_exc}")
                    continue

            print(f"  ❌ error: {exc}")

    conn.close()
    print(f"\n{'='*64}")
    print("Spotify discover collection complete")
    print(f"  Songs processed: {total_songs}")
    print(f"  Viral alerts: {total_viral}")
    print(f"{'='*64}\n")
    return {"songs_processed": total_songs, "viral_alerts": total_viral}


def main():
    parser = argparse.ArgumentParser(description="Collect Spotify data")
    parser.add_argument("--artist-id", help="Collect for a single artist ID")
    parser.add_argument("--market", default=SPOTIFY_MARKET, help="Spotify market (default: IN)")
    args = parser.parse_args()

    try:
        if args.artist_id:
            result = collect_artist_by_id(args.artist_id, market=args.market)
            print(f"Collected {result['songs_processed']} songs for artist '{args.artist_id}'")
            return
        collect_all_spotify_data(market=args.market)
    except Exception as exc:
        print(f"Spotify collection failed: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
