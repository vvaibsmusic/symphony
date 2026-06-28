"""Bulk-resolve Spotify IDs and collect tracks for all artists missing Spotify data.

Two-phase approach:
  Phase 1: Link — resolve spotify_id for all unlinked artists (1 API call each)
  Phase 2: Collect — get albums + tracks (3-7 API calls per artist)

Uses a JSON cache file to skip already-processed artists on re-runs.
"""

import hashlib
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from db import get_connection, init_db, upsert_song, get_previous_snapshot, insert_snapshot, insert_viral_alert
from spotify_client import SpotifyClient

SPOTIFY_MARKET = os.getenv("SPOTIFY_MARKET", "IN")
SPOTIFY_VIRAL_POPULARITY_JUMP = int(os.getenv("SPOTIFY_VIRAL_POPULARITY_JUMP", "20"))
CACHE_FILE = os.path.join(os.path.dirname(__file__), ".bulk_spotify_cache.json")


def generate_song_id(platform: str, platform_id: str) -> str:
    return hashlib.sha256(f"{platform}:{platform_id}".encode()).hexdigest()[:16]


def load_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, "r") as f:
            data = json.load(f)
            return set(data.get("linked", [])), set(data.get("collected", []))
    return set(), set()


def save_cache(linked, collected):
    with open(CACHE_FILE, "w") as f:
        json.dump({"linked": list(linked), "collected": list(collected)}, f)


def collect_via_albums(conn, client, artist):
    """Collect tracks via albums endpoint (works with Client Credentials).
    
    API calls per artist:
      1x get_artist_albums (limit=50, single page)
      ~5x get_album_tracks (one per album, limit=50)
      ~1x get_tracks (batch enrich up to 50 tracks)
    Total: ~7 calls per artist
    """
    spotify_id = artist["spotify_id"]
    artist_id = artist["id"]

    # 1 API call: get up to 50 albums+singles in one request
    albums = client.get_artist_albums(
        spotify_id, include_groups="album,single", limit=50, market=SPOTIFY_MARKET
    )

    if not albums:
        return {"songs_processed": 0, "viral_alerts": 0}

    # Sort by release date descending, take top 5 albums to keep API usage low
    albums = sorted(albums, key=lambda a: (a.get("release_date") or ""), reverse=True)[:5]

    # Collect track IDs from albums (~5 API calls)
    track_ids = []
    album_meta = {}  # track_id -> album metadata
    seen = set()
    for album in albums:
        album_id = album.get("id")
        if not album_id:
            continue
        try:
            album_tracks = client.get_album_tracks(album_id, limit=50)
            for track in album_tracks:
                tid = track.get("id")
                if tid and tid not in seen:
                    seen.add(tid)
                    track_ids.append(tid)
                    album_meta[tid] = {
                        "name": album.get("name"),
                        "release_date": album.get("release_date", ""),
                        "images": album.get("images") or [],
                    }
        except Exception as e:
            if "403" in str(e):
                continue  # skip forbidden albums
            raise

    if not track_ids:
        return {"songs_processed": 0, "viral_alerts": 0}

    # 1 API call per 50 tracks: batch get full track details with popularity
    full_tracks = client.get_tracks(track_ids[:100])  # cap at 100 tracks
    tracks_by_id = {t.get("id"): t for t in full_tracks if t}

    processed = 0
    viral = 0
    for track_id in track_ids[:100]:
        track = tracks_by_id.get(track_id)
        if not track:
            continue

        album_info = album_meta.get(track_id, {})
        album = track.get("album") or {}
        images = album.get("images") or album_info.get("images") or []
        release_date = album.get("release_date") or album_info.get("release_date", "")
        if release_date and len(release_date) == 4:
            release_date = f"{release_date}-01-01"
        elif release_date and len(release_date) == 7:
            release_date = f"{release_date}-01"

        song_id = generate_song_id("spotify", track_id)
        upsert_song(conn, {
            "id": song_id,
            "artist_id": artist_id,
            "title": track.get("name", "Unknown"),
            "platform": "spotify",
            "platform_id": track_id,
            "album_name": album.get("name") or album_info.get("name"),
            "release_date": release_date[:10] if release_date else "",
            "thumbnail_url": images[0].get("url", "") if images else "",
        })

        popularity = int(track.get("popularity") or 0)
        prev = get_previous_snapshot(conn, song_id, "spotify")
        insert_snapshot(conn, song_id, popularity, 0, 0, "spotify")
        processed += 1

        if prev and prev.get("play_count") is not None:
            delta = popularity - int(prev["play_count"])
            if delta >= SPOTIFY_VIRAL_POPULARITY_JUMP:
                insert_viral_alert(conn, {
                    "song_id": song_id,
                    "previous_count": int(prev["play_count"]),
                    "current_count": popularity,
                    "growth_factor": float(delta),
                    "platform": "spotify",
                })
                viral += 1

    return {"songs_processed": processed, "viral_alerts": viral}


def phase1_link(conn, client):
    """Phase 1: Resolve Spotify IDs for artists missing them."""
    linked_cache, collected_cache = load_cache()

    missing = conn.execute("""
        SELECT id, name FROM artists WHERE spotify_id IS NULL ORDER BY name
    """).fetchall()

    todo = [a for a in missing if a["id"] not in linked_cache]

    if not todo:
        print(f"Phase 1: All artists already linked ✅ ({len(linked_cache)} cached)")
        return 0

    print(f"\n{'='*70}")
    print(f"Phase 1: Linking {len(todo)} artists ({len(linked_cache)} cached/skipped)")
    print(f"{'='*70}\n")

    resolved = 0
    skipped_no_match = 0
    for i, artist in enumerate(todo, start=1):
        name = artist["name"]
        artist_id = artist["id"]
        print(f"[{i}/{len(todo)}] {name:35s}", end=" ", flush=True)

        try:
            matches = client.search_artist(name, limit=5)
            if not matches:
                print("— not found")
                linked_cache.add(artist_id)
                save_cache(linked_cache, collected_cache)
                time.sleep(0.3)
                continue

            # STRICT matching: require exact case-insensitive name match
            # Never fall back to a different artist name
            best = None
            name_lower = name.strip().lower()
            for m in matches:
                m_name = (m.get("name") or "").strip().lower()
                if m_name == name_lower:
                    best = m
                    break
                # Also accept minor punctuation diffs (e.g. KR$NA vs KRSNA)
                m_cleaned = ''.join(c for c in m_name if c.isalnum() or c == ' ')
                n_cleaned = ''.join(c for c in name_lower if c.isalnum() or c == ' ')
                if m_cleaned == n_cleaned and len(n_cleaned) > 2:
                    best = m
                    break

            if not best:
                # No exact match — do NOT blindly take first result
                top_name = (matches[0].get("name") or "???")
                print(f"⚠️  skipped (top result: {top_name})")
                skipped_no_match += 1
                linked_cache.add(artist_id)
                save_cache(linked_cache, collected_cache)
                time.sleep(0.3)
                continue

            spotify_id = best.get("id")
            spotify_name = best.get("name", name)
            images = best.get("images") or []
            image_url = images[0].get("url") if images else None

            conn.execute("""
                UPDATE artists SET spotify_id = ?, image_url = COALESCE(image_url, ?) WHERE id = ?
            """, (spotify_id, image_url, artist_id))
            conn.commit()

            resolved += 1
            linked_cache.add(artist_id)
            save_cache(linked_cache, collected_cache)

            match_note = "" if spotify_name.lower() == name.lower() else f" (→ {spotify_name})"
            print(f"✅{match_note}")
            time.sleep(0.3)

        except Exception as e:
            err = str(e)
            if "429" in err:
                print(f"⏳ rate limited, waiting 30s...")
                time.sleep(30)
            else:
                print(f"❌ {e}")

    print(f"\nPhase 1 done: linked {resolved}/{len(todo)}\n")
    return resolved


def phase2_collect(conn, client):
    """Phase 2: Collect tracks for artists without Spotify songs."""
    linked_cache, collected_cache = load_cache()

    need_collection = conn.execute("""
        SELECT a.id, a.name, a.spotify_id
        FROM artists a
        WHERE a.spotify_id IS NOT NULL
          AND (SELECT COUNT(*) FROM songs WHERE artist_id = a.id AND platform = 'spotify') = 0
        ORDER BY a.name
    """).fetchall()

    todo = [a for a in need_collection if a["id"] not in collected_cache]

    if not todo:
        print(f"Phase 2: All artists collected ✅ ({len(collected_cache)} cached)")
        return

    print(f"\n{'='*70}")
    print(f"Phase 2: Collecting tracks for {len(todo)} artists ({len(collected_cache)} cached/skipped)")
    print(f"{'='*70}\n")

    total_songs = 0
    for i, artist in enumerate(todo, start=1):
        name = artist["name"]
        print(f"[{i}/{len(todo)}] {name:35s}", end=" ", flush=True)

        try:
            result = collect_via_albums(conn, client, artist)
            conn.commit()
            songs = result.get("songs_processed", 0)
            total_songs += songs
            collected_cache.add(artist["id"])
            save_cache(linked_cache, collected_cache)
            print(f"✅ {songs} tracks")
            time.sleep(1)  # gentle rate limiting

        except Exception as e:
            conn.rollback()
            err = str(e)
            if "429" in err:
                print(f"⏳ rate limited, waiting 60s...")
                time.sleep(60)
                try:
                    result = collect_via_albums(conn, client, artist)
                    conn.commit()
                    songs = result.get("songs_processed", 0)
                    total_songs += songs
                    collected_cache.add(artist["id"])
                    save_cache(linked_cache, collected_cache)
                    print(f"  ✅ retry: {songs} tracks")
                except Exception as e2:
                    conn.rollback()
                    print(f"  ❌ retry failed: {e2}")
            elif "403" in err:
                print(f"⛔ forbidden (skipping)")
                collected_cache.add(artist["id"])
                save_cache(linked_cache, collected_cache)
            else:
                print(f"❌ {e}")

    print(f"\nPhase 2 done: collected {total_songs} total tracks\n")


def main():
    init_db()
    conn = get_connection()
    client = SpotifyClient()

    phase1_link(conn, client)
    phase2_collect(conn, client)

    stats = conn.execute("""
        SELECT
            (SELECT COUNT(*) FROM artists) as total,
            (SELECT COUNT(*) FROM artists WHERE spotify_id IS NOT NULL) as linked,
            (SELECT COUNT(*) FROM songs WHERE platform = 'spotify') as tracks
    """).fetchone()

    print(f"\n{'='*70}")
    print(f"Final: {stats['linked']}/{stats['total']} artists linked, {stats['tracks']} Spotify tracks")
    print(f"{'='*70}")

    conn.close()

    if os.path.exists(CACHE_FILE):
        os.remove(CACHE_FILE)
        print("(session cache cleared)")


if __name__ == "__main__":
    main()
