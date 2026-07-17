"""FastAPI backend for the Music Intelligence Dashboard."""

import sys
import os
import subprocess
import asyncio
import threading
import time
import urllib.request
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Any

# Ensure we can import from collector directory and current dir
project_dir = Path(__file__).parent.parent
sys.path.insert(0, str(project_dir / "collector"))
sys.path.insert(0, str(project_dir / "api"))

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from db import get_connection, init_db
from cache import ttl_cache, invalidate_cache
from sync import download_db, upload_db
from metrics import (
    compute_artist_metrics,
    compute_artist_metrics_from_history,
    compute_track_metrics,
    enrich_viral_alerts_batch,
    fetch_snapshots_by_song,
)

app = FastAPI(title="Music Intelligence Dashboard API", version="1.0.0")

# Allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Track background collector process
_collector_state: dict[str, Any] = {"running": False, "started_at": None, "pid": None, "type": None}

# Track per-artist collection status: {artist_id: {"status": "collecting"|"done"|"error", "songs": int, "error": str}}
_collect_state: dict[str, dict[str, Any]] = {}

# ─── Daily Scheduler (8 AM IST) ─────────────────────────────

_scheduler_state: dict[str, Any] = {"next_run": None, "last_run": None, "active": False}

# IST is UTC+5:30
_IST_OFFSET = timedelta(hours=5, minutes=30)


def _now_ist():
    """Get current time in IST (as naive datetime for simplicity)."""
    from datetime import timezone
    return datetime.now(timezone.utc).replace(tzinfo=None) + _IST_OFFSET


def _seconds_until_next_10am():
    """Calculate seconds until next 10:00 AM IST."""
    now = _now_ist()
    target = now.replace(hour=10, minute=0, second=0, microsecond=0)
    if now >= target:
        target += timedelta(days=1)  # next day
    _scheduler_state["next_run"] = (target - _IST_OFFSET).isoformat() + " UTC"
    return (target - now).total_seconds()


async def _daily_refresh_loop():
    """Background loop: sleep until 10 AM IST, then run collectors."""
    _scheduler_state["active"] = True
    print(f"[scheduler] Daily refresh scheduler started. Next run in {_seconds_until_next_10am():.0f}s")

    while True:
        wait = _seconds_until_next_10am()
        print(f"[scheduler] Sleeping {wait:.0f}s until 10:00 AM IST")
        await asyncio.sleep(wait)

        print(f"[scheduler] 🔄 10 AM IST — starting daily refresh")
        _scheduler_state["last_run"] = _now_ist().isoformat()

        # Run YouTube stats refresh using Python collector (local SQLite)
        start_collector_process("enrich_all.py", "scheduled_yt_stats")

        # Wait for it to finish (poll every 10s, max 10 min)
        for _ in range(60):
            if not _collector_state["running"]:
                break
            await asyncio.sleep(10)


        print(f"[scheduler] ✅ Daily refresh complete")
        # Sleep a bit to avoid re-triggering
        await asyncio.sleep(120)


# URLs the frontend hits on page load — kept warm so every request is a cache hit.
_WARM_URLS = [
    "/api/stats",
    "/api/spotify/stats",
    "/api/filters",
    "/api/quota",
    "/api/youtube/viral?limit=12",
    "/api/spotify/viral?limit=12",
    "/api/watchlist/releases?days=7",
    "/api/spotify/releases?days=7",
    "/api/artists?page=1&limit=50&sort_by=views&sort_dir=desc",
    "/api/spotify/artists?page=1&limit=50&sort_by=popularity&sort_dir=desc",
]


def warm_cache_async(delay: float = 0.5):
    """Prefetch hot endpoints over loopback HTTP so cache keys match real requests."""
    def worker():
        time.sleep(delay)
        base = f"http://127.0.0.1:{os.environ.get('API_PORT', '8000')}"
        # Wait for the server to accept connections (fresh boot)
        for _ in range(30):
            try:
                urllib.request.urlopen(base + "/api/scheduler/status", timeout=5).read()
                break
            except Exception:
                time.sleep(1)
        for path in _WARM_URLS:
            try:
                urllib.request.urlopen(base + path, timeout=120).read()
            except Exception as e:
                print(f"[warm] {path} failed: {e}")
        print("[warm] cache warm-up complete")

    threading.Thread(target=worker, daemon=True).start()


def refresh_cache():
    """Drop cached responses and re-warm in the background after data changes."""
    invalidate_cache()
    warm_cache_async()


@app.on_event("startup")
async def startup():
    download_db()
    init_db()
    # Start the daily scheduler in background
    asyncio.create_task(_daily_refresh_loop())
    warm_cache_async(delay=1.0)


@app.get("/api/scheduler/status")
def get_scheduler_status():
    """Check daily auto-refresh scheduler status."""
    return {
        "active": _scheduler_state["active"],
        "next_run": _scheduler_state.get("next_run"),
        "last_run": _scheduler_state.get("last_run"),
        "schedule": "Daily at 10:00 AM IST",
    }


def row_to_dict(row):
    """Convert sqlite3.Row to dict."""
    if row is None:
        return None
    return dict(row)


def rows_to_list(rows):
    """Convert list of sqlite3.Row to list of dicts."""
    return [dict(r) for r in rows]


def slugify_name(name: str) -> str:
    """Convert artist name into a stable slug."""
    return (
        name.lower()
        .replace(" ", "-")
        .replace(".", "")
        .replace("'", "")
        .replace("&", "and")
    )


def start_collector_process(script_name: str, run_type: str):
    """Run collector script in background and track status."""
    global _collector_state
    if _collector_state["running"]:
        return {
            "status": "already_running",
            "type": _collector_state.get("type"),
            "started_at": _collector_state.get("started_at"),
        }

    project_dir = str(Path(__file__).parent.parent)
    parts = script_name.split()
    script_path = os.path.normpath(os.path.join(project_dir, "collector", parts[0]))
    extra_args = parts[1:]
    # Python scripts run through the interpreter; compiled binaries (Go) run directly
    if script_path.endswith(".py"):
        cmd = [sys.executable, script_path] + extra_args
    else:
        cmd = [script_path] + extra_args
    started_at = datetime.now().isoformat()

    _collector_state["running"] = True
    _collector_state["started_at"] = started_at
    _collector_state["type"] = run_type
    _collector_state["pid"] = None

    def run_script():
        global _collector_state
        try:
            log_path = os.path.join(project_dir, "collector.log")
            with open(log_path, "w", encoding="utf-8") as f:
                proc = subprocess.Popen(
                    cmd,
                    cwd=project_dir,
                    stdout=f,
                    stderr=subprocess.STDOUT,
                )
            _collector_state["pid"] = proc.pid
            proc.wait()
        except Exception as e:
            print(f"[refresh:{run_type}] Error: {e}")
        finally:
            if run_type != "simulation":
                try:
                    upload_db()
                except Exception as e:
                    print(f"[refresh:{run_type}] Failed to upload DB: {e}")
            _collector_state["running"] = False
            _collector_state["pid"] = None
            _collector_state["type"] = None
            refresh_cache()  # collector may have written new snapshots

    thread = threading.Thread(target=run_script, daemon=True)
    thread.start()
    return {"status": "started", "type": run_type, "started_at": started_at}


# ─── Refresh / Collector ────────────────────────────────────

@app.post("/api/refresh")
def trigger_refresh():
    """Legacy — redirect to stats refresh."""
    return trigger_refresh_stats()


@app.post("/api/refresh/stats")
def trigger_refresh_stats():
    """Refresh view/like counts for all existing songs via YouTube API."""
    return start_collector_process("enrich_all.py", "stats")


@app.post("/api/simulate")
def trigger_simulation():
    """Run a 7-day simulation on the database."""
    return start_collector_process("simulate_7_days.py", "simulation")


@app.post("/api/refresh/discover")
def trigger_refresh_discover():
    """Discover new songs for all artists via ytmusicapi."""
    return start_collector_process("collector.py --fast", "discover")


@app.post("/api/refresh/spotify/stats")
def trigger_refresh_spotify_stats():
    """Refresh Spotify popularity stats for existing Spotify songs."""
    return start_collector_process("enrich_spotify.py", "spotify_stats")


@app.post("/api/refresh/spotify/discover")
def trigger_refresh_spotify_discover():
    """Discover Spotify songs for all artists with spotify_id."""
    return start_collector_process("collect_spotify.py", "spotify_discover")


@app.get("/api/refresh/status")
def refresh_status():
    """Check if a refresh is currently running."""
    progress = 0
    total = 0
    message = ""
    if _collector_state["running"]:
        try:
            log_path = os.path.join(project_dir, "collector.log")
            with open(log_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
                for line in reversed(lines):
                    line = line.strip()
                    if line.startswith("[") and "/" in line and "]" in line:
                        try:
                            parts = line.split("]", 1)[0].strip("[")
                            cur, tot = parts.split("/")
                            progress = int(cur)
                            total = int(tot)
                            message = line.split("]", 1)[1].strip()
                            break
                        except Exception:
                            continue
        except Exception:
            pass

    return {
        "running": _collector_state["running"],
        "type": _collector_state.get("type"),
        "started_at": _collector_state.get("started_at"),
        "progress": progress,
        "total": total,
        "message": message,
    }


@app.get("/api/refresh/logs")
def get_refresh_logs(limit: int = 100):
    """Get the last N lines of collector.log."""
    try:
        log_path = os.path.join(project_dir, "collector.log")
        if not os.path.exists(log_path):
            return {"logs": ["Log file does not exist yet."]}
        with open(log_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
            return {"logs": [line.strip() for line in lines[-limit:]]}
    except Exception as e:
        return {"error": str(e)}


# ─── Add Artist ─────────────────────────────────────────────

class AddArtistRequest(BaseModel):
    name: str
    genre: str = "Unknown"
    region: str = "India"


class SpotifyAddArtistRequest(BaseModel):
    name: str
    genre: str = "Unknown"
    region: str = "India"


class AddByUrlRequest(BaseModel):
    url: str
    genre: str = "Unknown"
    region: str = "India"


import re as _re


@app.post("/api/artist/add-by-url")
def add_artist_by_url(req: AddByUrlRequest):
    """Add an artist by pasting a YouTube or Spotify URL.

    Supported formats:
      - YouTube: https://www.youtube.com/@handle
      - Spotify: https://open.spotify.com/artist/<id>
    """
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    # ── Detect URL type ──────────────────────────────────
    yt_handle_match = _re.search(r"youtube\.com/@([A-Za-z0-9_\-\.]+)", url)
    sp_id_match = _re.search(r"open\.spotify\.com/artist/([A-Za-z0-9]+)", url)

    if yt_handle_match:
        return _add_from_youtube_handle(yt_handle_match.group(1), req.genre, req.region)
    elif sp_id_match:
        return _add_from_spotify_id(sp_id_match.group(1), req.genre, req.region)
    else:
        raise HTTPException(
            status_code=400,
            detail="Unrecognised URL. Please paste a YouTube channel URL (youtube.com/@handle) or Spotify artist URL (open.spotify.com/artist/...).",
        )


def _add_from_youtube_handle(handle: str, genre: str, region: str):
    """Resolve a YouTube @handle and add the artist."""
    try:
        from youtube_client import YouTubeClient
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"YouTube client unavailable: {e}")

    yt = YouTubeClient()
    try:
        info = yt.resolve_channel_by_handle(handle)
        if not info:
            raise HTTPException(status_code=404, detail=f"No YouTube channel found for @{handle}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    name = info["name"]
    channel_id = info.get("channel_id")
    thumbnail = info.get("thumbnail")
    slug = slugify_name(name)

    conn = get_connection()
    existing = conn.execute(
        "SELECT * FROM artists WHERE id = ? OR LOWER(name) = LOWER(?)", (slug, name)
    ).fetchone()

    if existing:
        artist_id = existing["id"]
        conn.execute(
            """UPDATE artists
               SET youtube_channel_id = COALESCE(youtube_channel_id, ?),
                   image_url = COALESCE(image_url, ?),
                   genre = CASE WHEN genre IS NULL OR genre = '' OR genre = 'Unknown' THEN ? ELSE genre END,
                   region = CASE WHEN region IS NULL OR region = '' THEN ? ELSE region END
               WHERE id = ?""",
            (channel_id, thumbnail, genre, region, artist_id),
        )
        conn.commit()
        artist = conn.execute("SELECT * FROM artists WHERE id = ?", (artist_id,)).fetchone()
        conn.close()
        # Trigger song collection in background
        _collect_yt_background(artist_id, name)
        return {
            "status": "exists",
            "platform": "youtube",
            "artist": row_to_dict(artist),
            "resolved": {"name": name, "thumbnail": thumbnail, "channel_id": channel_id},
            "message": f"'{name}' already exists. Songs are being refreshed.",
        }

    conn.execute(
        """INSERT INTO artists (id, name, youtube_channel_id, genre, region, image_url, is_watched, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))""",
        (slug, name, channel_id, genre or "Unknown", region or "India", thumbnail),
    )
    conn.commit()
    artist = conn.execute("SELECT * FROM artists WHERE id = ?", (slug,)).fetchone()
    conn.close()

    _collect_yt_background(slug, name)
    return {
        "status": "added",
        "platform": "youtube",
        "artist": row_to_dict(artist),
        "resolved": {"name": name, "thumbnail": thumbnail, "channel_id": channel_id},
        "message": f"Added '{name}' from YouTube. Songs are loading in the background.",
    }


def _add_from_spotify_id(spotify_id: str, genre: str, region: str):
    """Add artist directly by Spotify ID (no search ambiguity)."""
    try:
        from spotify_client import SpotifyClient
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Spotify client unavailable: {e}")

    try:
        client = SpotifyClient()
        sp = client.get_artist(spotify_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Spotify artist not found: {e}")

    name = sp.get("name", "")
    images = sp.get("images") or []
    image_url = images[0].get("url") if images else None
    sp_genres = sp.get("genres") or []
    slug = slugify_name(name)
    resolved_genre = genre if genre != "Unknown" else (sp_genres[0].title() if sp_genres else "Unknown")

    conn = get_connection()
    existing = conn.execute(
        "SELECT * FROM artists WHERE id = ? OR LOWER(name) = LOWER(?) OR spotify_id = ?",
        (slug, name, spotify_id),
    ).fetchone()

    if existing:
        artist_id = existing["id"]
        conn.execute(
            """UPDATE artists
               SET spotify_id = COALESCE(spotify_id, ?),
                   image_url = COALESCE(image_url, ?),
                   genre = CASE WHEN genre IS NULL OR genre = '' OR genre = 'Unknown' THEN ? ELSE genre END,
                   region = CASE WHEN region IS NULL OR region = '' THEN ? ELSE region END
               WHERE id = ?""",
            (spotify_id, image_url, resolved_genre, region, artist_id),
        )
        conn.commit()
        artist = conn.execute("SELECT * FROM artists WHERE id = ?", (artist_id,)).fetchone()
        conn.close()
        collect_spotify_for_artist_background(artist_id)
        return {
            "status": "exists",
            "platform": "spotify",
            "artist": row_to_dict(artist),
            "resolved": {"name": name, "image_url": image_url, "genres": sp_genres},
            "message": f"'{name}' already exists. Spotify songs are being refreshed.",
        }

    conn.execute(
        """INSERT INTO artists (id, name, spotify_id, genre, region, image_url, is_watched, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))""",
        (slug, name, spotify_id, resolved_genre, region or "India", image_url),
    )
    conn.commit()
    artist = conn.execute("SELECT * FROM artists WHERE id = ?", (slug,)).fetchone()
    conn.close()

    collect_spotify_for_artist_background(slug)
    return {
        "status": "added",
        "platform": "spotify",
        "artist": row_to_dict(artist),
        "resolved": {"name": name, "image_url": image_url, "genres": sp_genres},
        "message": f"Added '{name}' from Spotify. Songs are loading in the background.",
    }


def _collect_yt_background(artist_id: str, artist_name: str):
    """Collect YouTube songs for an artist in a background thread."""
    def worker():
        try:
            from youtube_client import YouTubeClient
            from db import get_connection as get_conn, init_db as db_init
            from collector import generate_song_id
            db_init()
            c = get_conn()
            yt = YouTubeClient()
            songs = yt.get_artist_songs_ytmusic(None, artist_name)
            if songs:
                # Get accurate stats from YouTube Data API
                video_ids = [s["video_id"] for s in songs if s.get("video_id")]
                video_stats = yt.get_video_stats(video_ids) if video_ids else {}

                for song in songs:
                    vid = song.get("video_id")
                    if not vid:
                        continue
                    song_id = generate_song_id("youtube", vid)
                    stats: dict[str, Any] = dict(video_stats.get(vid, {}))
                    ytmusic_views = song.get("views", 0) or 0
                    views = stats.get("views", ytmusic_views) or 0
                    likes = stats.get("likes", 0)
                    comments = stats.get("comments", 0)
                    title = stats.get("title") or song.get("title", "Unknown")
                    thumbnail = stats.get("thumbnail") or song.get("thumbnail", "")
                    release_date = stats.get("published_at", "")
                    if release_date and "T" in release_date:
                        release_date = release_date.split("T")[0]
                    elif song.get("release_year"):
                        release_date = str(song["release_year"])
                    c.execute(
                        """INSERT OR REPLACE INTO songs
                           (id, artist_id, title, platform, platform_id, album_name, release_date, thumbnail_url, created_at)
                           VALUES (?, ?, ?, 'youtube', ?, ?, ?, ?, datetime('now'))""",
                        (song_id, artist_id, title, vid,
                         song.get("album"), release_date, thumbnail),
                    )
                    c.execute(
                        """INSERT INTO play_snapshots
                           (song_id, play_count, like_count, comment_count, ytmusic_play_count, platform, collected_at)
                           VALUES (?, ?, ?, ?, ?, 'youtube', datetime('now'))""",
                        (song_id, views, likes, comments, ytmusic_views),
                    )
                c.commit()
                print(f"[add-by-url] Collected {len(songs)} YT songs for '{artist_name}' (API stats for {len(video_stats)})")
            c.close()
        except Exception as e:
            print(f"[add-by-url] Error collecting YT for '{artist_name}': {e}")
        finally:
            refresh_cache()

    refresh_cache()  # make the newly added/updated artist visible immediately
    thread = threading.Thread(target=worker, daemon=True)
    thread.start()

@app.post("/api/artist/add")
def add_artist(req: AddArtistRequest):
    """Add a new artist by name. Triggers song collection in the background."""
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Artist name is required")

    slug = slugify_name(name)
    conn = get_connection()

    # Check if already exists
    existing = conn.execute("SELECT id, name FROM artists WHERE id = ? OR LOWER(name) = LOWER(?)", (slug, name)).fetchone()
    if existing:
        conn.close()
        return {"status": "exists", "artist": row_to_dict(existing)}

    # Insert new artist
    conn.execute("""
        INSERT INTO artists (id, name, genre, region, is_watched, created_at)
        VALUES (?, ?, ?, ?, 0, datetime('now'))
    """, (slug, name, req.genre, req.region))
    conn.commit()

    artist = conn.execute("SELECT * FROM artists WHERE id = ?", (slug,)).fetchone()
    conn.close()

    # Collect songs in background
    try:
        collect_for_single_artist(slug)
    except Exception as e:
        print(f"Failed to start background collection for {slug}: {e}")

    refresh_cache()  # make the newly added artist visible immediately

    return {"status": "added", "artist": row_to_dict(artist), "message": f"Added '{name}'. Songs are being collected in the background."}


def collect_spotify_for_artist_background(artist_id: str):
    """Run Spotify collection for one artist in background."""

    def collect_worker():
        try:
            from collect_spotify import collect_artist_by_id

            result = collect_artist_by_id(artist_id)
            print(
                f"[spotify:collect] artist={artist_id} songs={result.get('songs_processed', 0)} viral={result.get('viral_alerts', 0)}"
            )
        except Exception as e:
            print(f"[spotify:collect] artist={artist_id} error={e}")
        finally:
            refresh_cache()

    refresh_cache()  # make the newly added/updated artist visible immediately
    thread = threading.Thread(target=collect_worker, daemon=True)
    thread.start()


@app.post("/api/spotify/artist/add")
def add_spotify_artist(req: SpotifyAddArtistRequest):
    """Add artist to Spotify tracking and trigger background collection."""
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Artist name is required")

    try:
        from spotify_client import SpotifyClient
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Spotify client unavailable: {e}")

    try:
        client = SpotifyClient()
        matches = client.search_artist(name, limit=5)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Spotify lookup failed: {e}")

    if not matches:
        raise HTTPException(status_code=404, detail=f"No Spotify artist found for '{name}'")

    best = matches[0]
    spotify_id = best.get("id")
    spotify_name = best.get("name") or name
    images = best.get("images") or []
    image_url = images[0].get("url") if images else None
    slug = slugify_name(spotify_name)

    conn = get_connection()
    existing = conn.execute(
        """
        SELECT * FROM artists
        WHERE id = ? OR LOWER(name) = LOWER(?) OR spotify_id = ?
        """,
        (slug, spotify_name, spotify_id),
    ).fetchone()

    if existing:
        artist_id = existing["id"]
        conn.execute(
            """
            UPDATE artists
            SET spotify_id = COALESCE(spotify_id, ?),
                image_url = COALESCE(image_url, ?),
                genre = CASE WHEN genre IS NULL OR genre = '' THEN ? ELSE genre END,
                region = CASE WHEN region IS NULL OR region = '' THEN ? ELSE region END
            WHERE id = ?
            """,
            (spotify_id, image_url, req.genre, req.region, artist_id),
        )
        conn.commit()
        artist = conn.execute("SELECT * FROM artists WHERE id = ?", (artist_id,)).fetchone()
        conn.close()
        collect_spotify_for_artist_background(artist_id)
        return {
            "status": "exists",
            "artist": row_to_dict(artist),
            "message": f"'{artist['name']}' is now being collected from Spotify in the background.",
        }

    conn.execute(
        """
        INSERT INTO artists (id, name, spotify_id, genre, region, image_url, is_watched, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))
        """,
        (
            slug,
            spotify_name,
            spotify_id,
            req.genre or "Unknown",
            req.region or "India",
            image_url,
        ),
    )
    conn.commit()
    artist = conn.execute("SELECT * FROM artists WHERE id = ?", (slug,)).fetchone()
    conn.close()

    collect_spotify_for_artist_background(slug)
    return {
        "status": "added",
        "artist": row_to_dict(artist),
        "message": f"Added '{spotify_name}'. Spotify songs are being collected in the background.",
    }


@app.post("/api/spotify/artist/{artist_id}/collect")
def collect_spotify_single_artist(artist_id: str):
    """Trigger Spotify collection for a single artist."""
    conn = get_connection()
    artist = conn.execute(
        "SELECT id, name, spotify_id FROM artists WHERE id = ?",
        (artist_id,),
    ).fetchone()
    conn.close()
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    if not artist["spotify_id"]:
        raise HTTPException(status_code=400, detail="Artist does not have spotify_id")

    collect_spotify_for_artist_background(artist_id)
    return {"status": "collecting", "artist_id": artist_id, "name": artist["name"]}


@app.get("/api/youtube/viral")
@ttl_cache(600)
def get_youtube_viral(limit: int = Query(100, ge=1, le=1000)):
    """Get songs that are going viral on YouTube (biggest view count spikes)."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT
            va.id as alert_id,
            va.song_id,
            va.previous_count,
            va.current_count,
            va.growth_factor,
            va.detected_at,
            va.status,
            va.platform,
            s.title,
            s.platform_id as video_id,
            s.album_name,
            s.release_date,
            s.thumbnail_url,
            a.name as artist_name,
            a.id as artist_id,
            a.image_url as artist_image
        FROM viral_alerts va
        JOIN songs s ON va.song_id = s.id
        JOIN artists a ON s.artist_id = a.id
        WHERE va.platform = 'youtube' AND va.detected_at >= datetime('now', '-30 days')
        ORDER BY va.growth_factor DESC, va.detected_at DESC
        LIMIT ?
    """, (limit,)).fetchall()
    result = enrich_viral_alerts_batch(conn, [dict(r) for r in rows], "youtube")
    conn.close()
    return {"viral": result}


@app.get("/api/youtube/growth")
@ttl_cache(600)
def get_youtube_growth(limit: int = Query(100, ge=1, le=1000)):
    """Get songs sorted by absolute volume growth over 24h and 30d."""
    conn = get_connection()
    rows = conn.execute("""
        WITH RankedSnapshots AS (
            SELECT song_id, play_count, collected_at,
                   ROW_NUMBER() OVER(PARTITION BY song_id ORDER BY collected_at DESC) as rn
            FROM play_snapshots
            WHERE platform = 'youtube'
        ),
        GrowthData AS (
            SELECT 
                r1.song_id,
                r1.play_count as current_views,
                r2.play_count as previous_views,
                r1.collected_at as current_time,
                r2.collected_at as previous_time,
                (julianday(r1.collected_at) - julianday(r2.collected_at)) as diff_days
            FROM RankedSnapshots r1
            LEFT JOIN RankedSnapshots r2 ON r1.song_id = r2.song_id AND r2.rn = 2
            WHERE r1.rn = 1
        )
        SELECT 
            s.id as song_id,
            s.title,
            s.platform_id as video_id,
            s.album_name,
            s.release_date,
            s.thumbnail_url,
            a.name as artist_name,
            a.id as artist_id,
            a.image_url as artist_image,
            g.current_views as current_views,
            CASE 
                WHEN g.previous_views IS NOT NULL AND g.diff_days > 0 
                THEN CAST(ROUND((g.current_views - g.previous_views) / g.diff_days) AS INTEGER)
                ELSE 0 
            END as daily_growth,
            CASE 
                WHEN g.previous_views IS NOT NULL AND g.diff_days > 0 
                THEN CAST(ROUND(((g.current_views - g.previous_views) / g.diff_days) * 30) AS INTEGER)
                ELSE 0 
            END as monthly_growth
        FROM songs s
        JOIN GrowthData g ON s.id = g.song_id
        JOIN artists a ON s.artist_id = a.id
        WHERE s.platform = 'youtube'
        ORDER BY daily_growth DESC
        LIMIT ?
    """, (limit,)).fetchall()
    conn.close()
    return {"growth": [dict(r) for r in rows]}


@app.get("/api/spotify/viral")
@ttl_cache(600)
def get_spotify_viral(limit: int = Query(20, ge=1, le=100)):
    """Get songs with biggest Spotify popularity jumps."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT
            va.id as alert_id,
            va.song_id,
            va.previous_count,
            va.current_count,
            va.growth_factor,
            (va.current_count - va.previous_count) as popularity_delta,
            va.detected_at,
            va.status,
            va.platform,
            s.title,
            s.platform_id as track_id,
            s.album_name,
            s.release_date,
            s.thumbnail_url,
            a.name as artist_name,
            a.id as artist_id,
            a.image_url as artist_image
        FROM viral_alerts va
        JOIN songs s ON va.song_id = s.id
        JOIN artists a ON s.artist_id = a.id
        WHERE va.platform = 'spotify' AND va.detected_at >= datetime('now', '-30 days')
        ORDER BY popularity_delta DESC, va.detected_at DESC
        LIMIT ?
    """, (limit,)).fetchall()
    result = enrich_viral_alerts_batch(conn, [dict(r) for r in rows], "spotify")
    conn.close()
    return {"viral": result}


# ─── Watchlist New Releases ─────────────────────────────────

@app.get("/api/watchlist/releases")
@ttl_cache(600)
def get_watchlist_releases(days: int = Query(7, ge=1, le=30)):
    """Get new releases grouped by watched vs all other artists in the past N days."""
    conn = get_connection()
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    # Watched Artists
    watched_rows = conn.execute("""
        SELECT
            s.id as song_id, s.title, s.platform, s.platform_id, s.album_name,
            s.release_date, s.thumbnail_url, a.name as artist_name, a.id as artist_id,
            a.image_url as artist_image,
            (SELECT play_count FROM play_snapshots WHERE song_id = s.id ORDER BY collected_at DESC LIMIT 1) as latest_play_count
        FROM songs s
        JOIN artists a ON s.artist_id = a.id
        WHERE a.is_watched = 1 AND s.release_date >= ?
        ORDER BY s.release_date DESC
    """, (cutoff,)).fetchall()

    # Other Artists
    other_rows = conn.execute("""
        SELECT
            s.id as song_id, s.title, s.platform, s.platform_id, s.album_name,
            s.release_date, s.thumbnail_url, a.name as artist_name, a.id as artist_id,
            a.image_url as artist_image,
            (SELECT play_count FROM play_snapshots WHERE song_id = s.id ORDER BY collected_at DESC LIMIT 1) as latest_play_count
        FROM songs s
        JOIN artists a ON s.artist_id = a.id
        WHERE a.is_watched = 0 AND s.release_date >= ?
        ORDER BY s.release_date DESC
    """, (cutoff,)).fetchall()

    conn.close()
    return {
        "watched": rows_to_list(watched_rows),
        "other": rows_to_list(other_rows),
        "since": cutoff
    }


@app.get("/api/spotify/releases")
@ttl_cache(600)
def get_spotify_releases(days: int = Query(7, ge=1, le=30)):
    """Get Spotify releases grouped by watched vs all other artists in past N days."""
    conn = get_connection()
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    # Watched Artists
    watched_rows = conn.execute("""
        SELECT
            s.id as song_id, s.title, s.platform, s.platform_id, s.album_name,
            s.release_date, s.thumbnail_url, a.name as artist_name, a.id as artist_id,
            a.image_url as artist_image,
            (SELECT play_count FROM play_snapshots WHERE song_id = s.id AND platform = 'spotify' ORDER BY collected_at DESC LIMIT 1) as latest_play_count
        FROM songs s
        JOIN artists a ON s.artist_id = a.id
        WHERE a.is_watched = 1 AND s.platform = 'spotify' AND s.release_date >= ?
        ORDER BY s.release_date DESC
    """, (cutoff,)).fetchall()

    # Other Artists
    other_rows = conn.execute("""
        SELECT
            s.id as song_id, s.title, s.platform, s.platform_id, s.album_name,
            s.release_date, s.thumbnail_url, a.name as artist_name, a.id as artist_id,
            a.image_url as artist_image,
            (SELECT play_count FROM play_snapshots WHERE song_id = s.id AND platform = 'spotify' ORDER BY collected_at DESC LIMIT 1) as latest_play_count
        FROM songs s
        JOIN artists a ON s.artist_id = a.id
        WHERE a.is_watched = 0 AND s.platform = 'spotify' AND s.release_date >= ?
        ORDER BY s.release_date DESC
    """, (cutoff,)).fetchall()

    conn.close()
    return {
        "watched": rows_to_list(watched_rows),
        "other": rows_to_list(other_rows),
        "since": cutoff
    }


# ─── Artists ────────────────────────────────────────────────

@app.get("/api/artists")
@ttl_cache(300)
def get_artists(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
    search: Optional[str] = None,
    genre: Optional[str] = None,
    region: Optional[str] = None,
    watched_only: bool = False,
    sort_by: str = Query("name", pattern="^(name|songs|views|views_per_like|genre|region|recency)$"),
    sort_dir: str = Query("asc", pattern="^(asc|desc)$"),
):
    """Get paginated list of artists with their song counts, sortable and filterable."""
    conn = get_connection()
    offset = (page - 1) * limit

    where_clauses = []
    params = []

    if search:
        where_clauses.append("a.name LIKE ?")
        params.append(f"%{search}%")
    if genre:
        genres = [g.strip() for g in genre.split(",") if g.strip()]
        if genres:
            placeholders = " OR ".join(["a.genre LIKE ?" for _ in genres])
            where_clauses.append(f"({placeholders})")
            params.extend([f"%{g}%" for g in genres])
    if region:
        regions = [r.strip() for r in region.split(",") if r.strip()]
        if regions:
            placeholders = " OR ".join(["a.region LIKE ?" for _ in regions])
            where_clauses.append(f"({placeholders})")
            params.extend([f"%{r}%" for r in regions])
    if watched_only:
        where_clauses.append("a.is_watched = 1")

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    # Get total count
    total = conn.execute(
        f"SELECT COUNT(*) FROM artists a {where_sql}", params
    ).fetchone()[0]

    # Map sort fields to SQL
    sort_map = {
        "name": "a.name",
        "songs": "yt_song_count",
        "views": "total_yt_views",
        "views_per_like": "views_per_like",
        "genre": "a.genre",
        "region": "a.region",
        "recency": "latest_release",
    }
    order_col = sort_map.get(sort_by, "a.name")
    order_dir = "DESC" if sort_dir == "desc" else "ASC"

    # For numeric sorts, put NULLs last
    nulls_last = ""
    if sort_by in ("songs", "views", "views_per_like", "recency"):
        nulls_last = "NULLS LAST"
        if sort_dir == "asc":
            nulls_last = "NULLS LAST"

    # Get artists with computed columns
    rows = conn.execute(f"""
        WITH latest_snaps AS (
            SELECT song_id, MAX(id) as max_id
            FROM play_snapshots
            WHERE platform = 'youtube'
            GROUP BY song_id
        ),
        artist_stats AS (
            SELECT 
                s.artist_id,
                COUNT(s.id) as yt_song_count,
                SUM(ps.play_count) as total_views,
                SUM(ps.like_count) as total_likes,
                SUM(ps.comment_count) as total_comments,
                MAX(s.release_date) as latest_release
            FROM songs s
            LEFT JOIN latest_snaps ls ON ls.song_id = s.id
            LEFT JOIN play_snapshots ps ON ps.id = ls.max_id
            WHERE s.platform = 'youtube'
            GROUP BY s.artist_id
        )
        SELECT
            a.*,
            COALESCE(ast.yt_song_count, 0) as yt_song_count,
            (SELECT COUNT(*) FROM songs WHERE artist_id = a.id AND platform = 'spotify') as spotify_song_count,
            ast.total_views as total_yt_views,
            ast.total_likes as total_yt_likes,
            ast.total_comments as total_yt_comments,
            CASE WHEN ast.total_views > 0 
                 THEN ROUND(CAST((ast.total_likes + ast.total_comments) AS REAL) * 100.0 / ast.total_views, 2)
                 ELSE NULL END as engagement_rate,
            CASE WHEN ast.total_likes > 0 
                 THEN CAST(ast.total_views AS REAL) / ast.total_likes
                 ELSE NULL END as views_per_like,
            ast.latest_release
        FROM artists a
        LEFT JOIN artist_stats ast ON ast.artist_id = a.id
        {where_sql}
        ORDER BY {order_col} {order_dir} {nulls_last}
        LIMIT ? OFFSET ?
    """, params + [limit, offset]).fetchall()

    conn.close()
    return {
        "artists": rows_to_list(rows),
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }


@app.get("/api/spotify/artists")
@ttl_cache(300)
def get_spotify_artists(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
    search: Optional[str] = None,
    genre: Optional[str] = None,
    region: Optional[str] = None,
    watched_only: bool = False,
    sort_by: str = Query("name", pattern="^(name|songs|popularity|genre|region|recency)$"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
):
    """Get paginated Spotify artist leaderboard."""
    conn = get_connection()
    offset = (page - 1) * limit

    where_clauses = ["a.spotify_id IS NOT NULL"]
    params = []

    if search:
        where_clauses.append("a.name LIKE ?")
        params.append(f"%{search}%")
    if genre:
        genres = [g.strip() for g in genre.split(",") if g.strip()]
        if genres:
            placeholders = " OR ".join(["a.genre LIKE ?" for _ in genres])
            where_clauses.append(f"({placeholders})")
            params.extend([f"%{g}%" for g in genres])
    if region:
        regions = [r.strip() for r in region.split(",") if r.strip()]
        if regions:
            placeholders = " OR ".join(["a.region LIKE ?" for _ in regions])
            where_clauses.append(f"({placeholders})")
            params.extend([f"%{r}%" for r in regions])
    if watched_only:
        where_clauses.append("a.is_watched = 1")

    where_sql = f"WHERE {' AND '.join(where_clauses)}"

    total = conn.execute(
        f"SELECT COUNT(*) FROM artists a {where_sql}",
        params,
    ).fetchone()[0]

    sort_map = {
        "name": "a.name",
        "songs": "spotify_song_count",
        "popularity": "total_sp_popularity",
        "genre": "a.genre",
        "region": "a.region",
        "recency": "latest_release",
    }
    order_col = sort_map.get(sort_by, "a.name")
    order_dir = "DESC" if sort_dir == "desc" else "ASC"
    nulls_last = "NULLS LAST" if sort_by in ("songs", "popularity", "recency") else ""

    rows = conn.execute(f"""
        WITH latest_snaps AS (
            SELECT song_id, MAX(id) as max_id
            FROM play_snapshots
            WHERE platform = 'spotify'
            GROUP BY song_id
        ),
        artist_stats AS (
            SELECT 
                s.artist_id,
                COUNT(s.id) as spotify_song_count,
                SUM(ps.play_count) as total_sp_popularity,
                AVG(ps.play_count) as avg_sp_popularity,
                MAX(s.release_date) as latest_release
            FROM songs s
            LEFT JOIN latest_snaps ls ON ls.song_id = s.id
            LEFT JOIN play_snapshots ps ON ps.id = ls.max_id
            WHERE s.platform = 'spotify'
            GROUP BY s.artist_id
        )
        SELECT
            a.*,
            COALESCE(ast.spotify_song_count, 0) as spotify_song_count,
            ast.total_sp_popularity,
            ast.avg_sp_popularity,
            ast.latest_release
        FROM artists a
        LEFT JOIN artist_stats ast ON ast.artist_id = a.id
        {where_sql}
        ORDER BY {order_col} {order_dir} {nulls_last}
        LIMIT ? OFFSET ?
    """, params + [limit, offset]).fetchall()

    conn.close()
    return {
        "artists": rows_to_list(rows),
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }


@app.get("/api/filters")
@ttl_cache(3600)
def get_filter_options():
    """Get available genre and region options for filter dropdowns."""
    conn = get_connection()
    genres = [r[0] for r in conn.execute(
        "SELECT DISTINCT genre FROM artists WHERE genre IS NOT NULL ORDER BY genre"
    ).fetchall()]
    regions = [r[0] for r in conn.execute(
        "SELECT DISTINCT region FROM artists WHERE region IS NOT NULL ORDER BY region"
    ).fetchall()]
    conn.close()
    return {"genres": genres, "regions": regions}


# ─── Artist Detail ──────────────────────────────────────────

@app.get("/api/artist/{artist_id}")
@ttl_cache(300)
def get_artist_detail(artist_id: str, platform: str = Query("youtube")):
    """Get an artist's details, songs, and play count history.

    All snapshot history is pulled in one batched query; per-song stats,
    track metrics, and artist metrics are computed in Python. This keeps
    the endpoint at 4 DB round trips regardless of how many songs exist.
    """
    conn = get_connection()

    artist = conn.execute("SELECT * FROM artists WHERE id = ?", (artist_id,)).fetchone()
    if not artist:
        conn.close()
        raise HTTPException(status_code=404, detail="Artist not found")

    songs = conn.execute("""
        SELECT s.*,
            (SELECT play_count FROM play_snapshots
             WHERE song_id = s.id ORDER BY collected_at ASC LIMIT 1) as first_play_count
        FROM songs s
        WHERE s.artist_id = ? AND s.platform = ?
    """, (artist_id, platform)).fetchall()

    song_dicts = [dict(s) for s in songs]
    snaps_by_song = fetch_snapshots_by_song(
        conn, [s["id"] for s in song_dicts], platform, per_song_limit=30
    )

    alerts = conn.execute("""
        SELECT va.*, s.title, s.platform_id
        FROM viral_alerts va
        JOIN songs s ON va.song_id = s.id
        WHERE s.artist_id = ? AND va.platform = ?
        ORDER BY va.detected_at DESC
        LIMIT 10
    """, (artist_id, platform)).fetchall()

    conn.close()

    for song in song_dicts:
        snaps = snaps_by_song.get(song["id"], [])
        latest = snaps[0] if snaps else None
        song["latest_play_count"] = latest["play_count"] if latest else None
        song["latest_like_count"] = latest["like_count"] if latest else None
        song["latest_comment_count"] = latest["comment_count"] if latest else None
        song["ytmusic_play_count"] = next(
            (s["ytmusic_play_count"] for s in snaps if s.get("ytmusic_play_count") is not None), None
        )
        if latest and (latest["play_count"] or 0) > 0:
            song["engagement_rate"] = round(
                ((latest["like_count"] or 0) + (latest["comment_count"] or 0))
                * 100.0 / latest["play_count"], 2
            )
        else:
            song["engagement_rate"] = 0
        song["metrics"] = compute_track_metrics(snaps)

    song_dicts.sort(key=lambda s: (s["latest_play_count"] is None, -(s["latest_play_count"] or 0)))

    return {
        "artist": row_to_dict(artist),
        "metrics": compute_artist_metrics_from_history(snaps_by_song),
        "songs": song_dicts,
        "viral_alerts": rows_to_list(alerts),
    }


@app.get("/api/spotify/artist/{artist_id}")
@ttl_cache(300)
def get_spotify_artist_detail(artist_id: str):
    """Get Spotify artist details, songs, and popularity alerts."""
    conn = get_connection()

    artist = conn.execute(
        "SELECT * FROM artists WHERE id = ? AND spotify_id IS NOT NULL",
        (artist_id,),
    ).fetchone()
    if not artist:
        conn.close()
        raise HTTPException(status_code=404, detail="Spotify artist not found")

    songs = conn.execute("""
        SELECT
            s.*,
            (SELECT play_count FROM play_snapshots
             WHERE song_id = s.id AND platform = 'spotify'
             ORDER BY collected_at DESC LIMIT 1) as latest_play_count,
            (SELECT play_count FROM play_snapshots
             WHERE song_id = s.id AND platform = 'spotify'
             ORDER BY collected_at ASC LIMIT 1) as first_play_count,
            0 as latest_like_count
        FROM songs s
        WHERE s.artist_id = ? AND s.platform = 'spotify'
        ORDER BY latest_play_count DESC NULLS LAST
    """, (artist_id,)).fetchall()

    alerts = conn.execute("""
        SELECT
            va.*,
            s.title,
            s.platform_id,
            (va.current_count - va.previous_count) as popularity_delta
        FROM viral_alerts va
        JOIN songs s ON va.song_id = s.id
        WHERE s.artist_id = ? AND va.platform = 'spotify'
        ORDER BY va.detected_at DESC
        LIMIT 10
    """, (artist_id,)).fetchall()

    conn.close()
    return {
        "artist": row_to_dict(artist),
        "songs": rows_to_list(songs),
        "viral_alerts": rows_to_list(alerts),
    }


# ─── Song Play History ──────────────────────────────────────

@app.get("/api/song/{song_id}/history")
@ttl_cache(300)
def get_song_history(song_id: str):
    """Get play count history for a specific song."""
    conn = get_connection()
    snapshots = conn.execute("""
        SELECT play_count, like_count, comment_count, collected_at, platform
        FROM play_snapshots
        WHERE song_id = ?
        ORDER BY collected_at ASC
    """, (song_id,)).fetchall()
    conn.close()
    return {"history": rows_to_list(snapshots)}


# ─── Toggle Watchlist ────────────────────────────────────────

@app.post("/api/artist/{artist_id}/watch")
def toggle_watchlist(artist_id: str):
    """Toggle an artist's watched status."""
    conn = get_connection()
    artist = conn.execute("SELECT is_watched FROM artists WHERE id = ?", (artist_id,)).fetchone()
    if not artist:
        conn.close()
        raise HTTPException(status_code=404, detail="Artist not found")

    new_status = 0 if artist["is_watched"] else 1
    conn.execute("UPDATE artists SET is_watched = ? WHERE id = ?", (new_status, artist_id))
    conn.commit()
    conn.close()
    refresh_cache()
    return {"artist_id": artist_id, "is_watched": bool(new_status)}


@app.delete("/api/artist/{artist_id}")
def delete_artist(artist_id: str):
    """Remove an artist and all their songs, snapshots, and viral alerts."""
    conn = get_connection()
    artist = conn.execute("SELECT id, name FROM artists WHERE id = ?", (artist_id,)).fetchone()
    if not artist:
        conn.close()
        raise HTTPException(status_code=404, detail="Artist not found")

    name = artist["name"]

    # Delete snapshots for all songs of this artist
    conn.execute("""
        DELETE FROM play_snapshots WHERE song_id IN (
            SELECT id FROM songs WHERE artist_id = ?
        )
    """, (artist_id,))

    # Delete viral alerts for songs of this artist
    conn.execute("""
        DELETE FROM viral_alerts WHERE song_id IN (
            SELECT id FROM songs WHERE artist_id = ?
        )
    """, (artist_id,))

    # Delete songs
    songs_deleted = conn.execute("DELETE FROM songs WHERE artist_id = ?", (artist_id,)).rowcount

    # Delete artist
    conn.execute("DELETE FROM artists WHERE id = ?", (artist_id,))
    conn.commit()
    conn.close()
    refresh_cache()

    return {
        "status": "deleted",
        "artist_id": artist_id,
        "name": name,
        "songs_deleted": songs_deleted,
    }

# ─── Dashboard Stats ────────────────────────────────────────

@app.get("/api/stats")
@ttl_cache(600)
def get_stats():
    """Get overall dashboard statistics (single round trip to the DB)."""
    conn = get_connection()
    row = conn.execute("""
        SELECT
            (SELECT COUNT(*) FROM artists) as total_artists,
            (SELECT COUNT(*) FROM songs) as total_songs,
            (SELECT COUNT(*) FROM songs WHERE platform = 'youtube') as yt_songs,
            (SELECT COUNT(*) FROM songs WHERE platform = 'spotify') as spotify_songs,
            (SELECT COUNT(*) FROM viral_alerts WHERE status = 'new') as viral_alerts,
            (SELECT COUNT(*) FROM artists WHERE is_watched = 1) as watched_artists,
            (SELECT MAX(collected_at) FROM play_snapshots) as last_run
    """).fetchone()
    conn.close()
    return {
        "total_artists": row["total_artists"],
        "total_songs": row["total_songs"],
        "yt_songs": row["yt_songs"],
        "spotify_songs": row["spotify_songs"],
        "viral_alerts": row["viral_alerts"],
        "watched_artists": row["watched_artists"],
        "last_collection": {"last_run": row["last_run"]},
    }


@app.get("/api/spotify/stats")
@ttl_cache(600)
def get_spotify_stats():
    """Get Spotify dashboard statistics (single round trip to the DB)."""
    conn = get_connection()
    row = conn.execute("""
        SELECT
            (SELECT COUNT(*) FROM artists WHERE spotify_id IS NOT NULL) as total_artists,
            (SELECT COUNT(*) FROM songs WHERE platform = 'spotify') as spotify_songs,
            (SELECT COUNT(*) FROM artists WHERE spotify_id IS NOT NULL AND is_watched = 1) as watched_artists,
            (SELECT COUNT(*) FROM viral_alerts WHERE platform = 'spotify' AND status = 'new') as viral_alerts,
            (SELECT MAX(collected_at) FROM play_snapshots WHERE platform = 'spotify') as last_run
    """).fetchone()
    conn.close()
    return {
        "total_artists": row["total_artists"],
        "spotify_songs": row["spotify_songs"],
        "watched_artists": row["watched_artists"],
        "viral_alerts": row["viral_alerts"],
        "last_collection": {"last_run": row["last_run"]},
    }


# ─── API Quota Tracking ────────────────────────────────────

@app.get("/api/quota")
@ttl_cache(60)
def get_quota():
    """Get today's YouTube API quota usage."""
    conn = get_connection()
    # 2 API keys from different projects = 20K total
    DAILY_LIMIT = 20000

    # Breakdown by operation today; total usage is derived from it
    breakdown = conn.execute("""
        SELECT operation, SUM(units_used) as total,  COUNT(*) as calls
        FROM api_quota_log
        WHERE date(created_at) = date('now')
        GROUP BY operation
    """).fetchall()

    used = sum(r["total"] or 0 for r in breakdown)

    # Estimate cost of a full refresh
    artist_count = conn.execute("SELECT COUNT(*) FROM artists").fetchone()[0]
    # We no longer do the 100-unit fallback searches by default during refresh
    # So we only spend ~1 unit per 50 songs using get_video_stats.
    # Let's estimate conservatively around 1 unit per artist.
    estimated_refresh_cost = artist_count * 1

    conn.close()
    return {
        "daily_limit": DAILY_LIMIT,
        "used_today": used,
        "remaining": max(DAILY_LIMIT - used, 0),
        "pct_used": round(used / DAILY_LIMIT * 100, 1),
        "breakdown": rows_to_list(breakdown),
        "estimated_refresh_cost": estimated_refresh_cost,
        "reset_info": "Resets at midnight Pacific Time (1:30 PM IST)",
    }


# ─── Log Quota Usage Helper ─────────────────────────────────

def log_quota(operation: str, units: int, details: str = ""):
    """Log API quota usage to the database."""
    try:
        conn = get_connection()
        conn.execute(
            "INSERT INTO api_quota_log (operation, units_used, details) VALUES (?, ?, ?)",
            (operation, units, details)
        )
        conn.commit()
        conn.close()
    except Exception:
        pass


# ─── Global Search ──────────────────────────────────────────

@app.get("/api/search/global")
@ttl_cache(60)
def global_search(q: str = Query(..., min_length=1)):
    """Search across artists and songs."""
    conn = get_connection()
    term = f"%{q}%"

    artists = conn.execute("""
        SELECT a.id, a.name, a.genre, a.region, a.is_watched,
            (SELECT COUNT(*) FROM songs WHERE artist_id = a.id AND platform = 'youtube') as yt_song_count,
            (SELECT SUM(ps.play_count) FROM play_snapshots ps
             JOIN songs s ON ps.song_id = s.id
             WHERE s.artist_id = a.id AND ps.platform = 'youtube'
             AND ps.id IN (SELECT MAX(id) FROM play_snapshots GROUP BY song_id)
            ) as total_yt_views
        FROM artists a
        WHERE a.name LIKE ?
        ORDER BY total_yt_views DESC NULLS LAST
        LIMIT 10
    """, (term,)).fetchall()

    songs = conn.execute("""
        SELECT s.id, s.title, s.album_name, s.release_date, s.platform_id, s.thumbnail_url,
            a.name as artist_name, a.id as artist_id,
            (SELECT play_count FROM play_snapshots WHERE song_id = s.id ORDER BY collected_at DESC LIMIT 1) as latest_play_count
        FROM songs s
        JOIN artists a ON s.artist_id = a.id
        WHERE s.title LIKE ?
        ORDER BY latest_play_count DESC NULLS LAST
        LIMIT 15
    """, (term,)).fetchall()

    conn.close()
    return {"artists": rows_to_list(artists), "songs": rows_to_list(songs)}


@app.get("/api/spotify/search/global")
@ttl_cache(60)
def spotify_global_search(q: str = Query(..., min_length=1)):
    """Search across Spotify artists and songs."""
    conn = get_connection()
    term = f"%{q}%"

    artists = conn.execute("""
        SELECT a.id, a.name, a.genre, a.region, a.is_watched,
            (SELECT COUNT(*) FROM songs WHERE artist_id = a.id AND platform = 'spotify') as spotify_song_count,
            (SELECT SUM(ps.play_count) FROM play_snapshots ps
             JOIN songs s ON ps.song_id = s.id
             WHERE s.artist_id = a.id
               AND s.platform = 'spotify'
               AND ps.platform = 'spotify'
               AND ps.id IN (SELECT MAX(id) FROM play_snapshots WHERE platform = 'spotify' GROUP BY song_id)
            ) as total_sp_popularity
        FROM artists a
        WHERE a.spotify_id IS NOT NULL
          AND a.name LIKE ?
        ORDER BY total_sp_popularity DESC NULLS LAST
        LIMIT 10
    """, (term,)).fetchall()

    songs = conn.execute("""
        SELECT s.id, s.title, s.album_name, s.release_date, s.platform_id, s.thumbnail_url,
            a.name as artist_name, a.id as artist_id,
            (SELECT play_count
             FROM play_snapshots
             WHERE song_id = s.id AND platform = 'spotify'
             ORDER BY collected_at DESC LIMIT 1) as latest_play_count
        FROM songs s
        JOIN artists a ON s.artist_id = a.id
        WHERE s.platform = 'spotify'
          AND s.title LIKE ?
        ORDER BY latest_play_count DESC NULLS LAST
        LIMIT 15
    """, (term,)).fetchall()

    conn.close()
    return {"artists": rows_to_list(artists), "songs": rows_to_list(songs)}


# ─── Collect for Individual Artist ──────────────────────────

@app.post("/api/artist/{artist_id}/collect")
def collect_for_single_artist(artist_id: str):
    """Trigger song collection for a single artist."""
    conn = get_connection()
    artist = conn.execute("SELECT * FROM artists WHERE id = ?", (artist_id,)).fetchone()
    if not artist:
        conn.close()
        raise HTTPException(status_code=404, detail="Artist not found")

    name = artist["name"]
    conn.close()

    _collect_state[artist_id] = {"status": "collecting", "songs": 0, "error": None, "log": []}

    def do_collect():
        log = []
        def _log(msg):
            log.append(msg)
            print(f"[collect:{artist_id}] {msg}", flush=True)

        try:
            from youtube_client import YouTubeClient
            from db import get_connection as get_conn
            from collector import generate_song_id

            c = get_conn()
            _log("DB connection OK")

            yt = YouTubeClient()
            _log(f"YouTubeClient init: yt_api={'yes' if yt.youtube else 'no'}, ytmusic={'yes' if yt.ytmusic else 'no'}")

            songs = []
            channel_id = None
            
            # Step 1: Default to official YouTube Data API
            if yt.youtube:
                artist_row = c.execute("SELECT youtube_channel_id FROM artists WHERE id = ?", (artist_id,)).fetchone()
                if artist_row:
                    channel_id = artist_row["youtube_channel_id"]
                    
                if not channel_id:
                    _log(f"No channel ID in DB, searching YouTube Data API for '{name}'")
                    try:
                        from googleapiclient.discovery import Resource
                        from typing import cast, Any as _Any
                        yt_api = cast(_Any, yt.youtube)
                        chan_search = yt_api.search().list(
                            q=name, part="id,snippet", type="channel", maxResults=1
                        ).execute()
                        chan_items = chan_search.get("items", [])
                        if chan_items:
                            channel_id = chan_items[0].get("id", {}).get("channelId")
                            if channel_id:
                                _log(f"Found channel ID {channel_id}, saving to DB")
                                c.execute("UPDATE artists SET youtube_channel_id = ? WHERE id = ?", (channel_id, artist_id))
                                c.commit()
                    except Exception as e:
                        _log(f"Data API Channel search error: {e}")

                if channel_id:
                    _log(f"Trying YouTube Data API search for channel {channel_id}")
                    try:
                        songs = yt.get_channel_videos(channel_id, max_results=50)
                        if songs:
                            _log(f"Data API Fetched {len(songs)} videos via channel search")
                    except Exception as e:
                        _log(f"Data API Channel videos error: {e}")

            # Step 2: Fallback to ytmusicapi
            if not songs:
                _log("Falling back to ytmusicapi")
                try:
                    songs = yt.get_artist_songs_ytmusic(channel_id, name)
                    if songs:
                        _log(f"get_artist_songs_ytmusic returned {len(songs)} songs")
                except Exception as e:
                    _log(f"ytmusicapi Error: {e}")

            if songs:
                # Get accurate stats from YouTube Data API
                video_ids = [s["video_id"] for s in songs if s.get("video_id")]
                video_stats = yt.get_video_stats(video_ids) if video_ids else {}
                _log(f"Got video stats for {len(video_stats)}/{len(video_ids)} videos")

                for song in songs:
                    vid = song.get("video_id")
                    if not vid:
                        continue
                    song_id = generate_song_id("youtube", vid)
                    stats: dict[str, Any] = dict(video_stats.get(vid, {}))
                    ytmusic_views = song.get("views", 0) or 0
                    views = int(stats.get("views", ytmusic_views) or 0)
                    likes = int(stats.get("likes", 0) or 0)
                    comments = int(stats.get("comments", 0) or 0)
                    title = stats.get("title") or song.get("title", "Unknown")
                    thumbnail = str(stats.get("thumbnail") or song.get("thumbnail", ""))
                    release_date: Any = stats.get("published_at", "")
                    if release_date and "T" in release_date:
                        release_date = release_date.split("T")[0]
                    elif song.get("release_year"):
                        release_date = str(song["release_year"])

                    c.execute("""
                        INSERT OR REPLACE INTO songs (id, artist_id, title, platform, platform_id, album_name, release_date, thumbnail_url, created_at)
                        VALUES (?, ?, ?, 'youtube', ?, ?, ?, ?, datetime('now'))
                    """, (song_id, artist_id, title, vid, song.get("album"), release_date, thumbnail))

                    c.execute("""
                        INSERT INTO play_snapshots (song_id, play_count, like_count, comment_count, ytmusic_play_count, platform, collected_at)
                        VALUES (?, ?, ?, ?, ?, 'youtube', datetime('now'))
                    """, (song_id, views, likes, comments, ytmusic_views))

                c.commit()
                _log(f"Committed {len(songs)} songs to DB")
            else:
                _log("No songs found from any source")

            c.close()
            _collect_state[artist_id] = {"status": "done", "songs": len(songs), "error": None, "log": log}
        except Exception as e:
            import traceback
            err_msg = str(e)
            _log(f"EXCEPTION: {err_msg}\n{traceback.format_exc()}")
            _collect_state[artist_id] = {"status": "error", "songs": 0, "error": err_msg, "log": log}
        finally:
            refresh_cache()

    thread = threading.Thread(target=do_collect, daemon=True)
    thread.start()
    return {"status": "collecting", "artist_id": artist_id, "name": name}


@app.get("/api/artist/{artist_id}/collect/status")
def collect_status(artist_id: str):
    """Check the status of a per-artist collection."""
    state = _collect_state.get(artist_id, {"status": "idle", "songs": 0, "error": None})
    return state


@app.get("/api/songs/{song_id}/history")
@ttl_cache(60)
def get_song_history(song_id: str):
    """Get the full history and details of a song."""
    conn = get_connection()
    
    song = conn.execute(
        "SELECT s.*, a.name as artist_name, a.image_url as artist_image FROM songs s JOIN artists a ON s.artist_id = a.id WHERE s.id = ?",
        (song_id,)
    ).fetchone()
    
    if not song:
        conn.close()
        raise HTTPException(status_code=404, detail="Song not found")
        
    snapshots = conn.execute("""
        SELECT collected_at, play_count, like_count, dislike_count, comment_count, platform 
        FROM play_snapshots 
        WHERE song_id = ? 
        ORDER BY collected_at ASC
    """, (song_id,)).fetchall()
    
    alerts = conn.execute("""
        SELECT detected_at, previous_count, current_count, growth_factor, platform
        FROM viral_alerts
        WHERE song_id = ?
        ORDER BY detected_at DESC
    """, (song_id,)).fetchall()
    
    conn.close()
    
    return {
        "song": dict(song),
        "history": [dict(s) for s in snapshots],
        "alerts": [dict(a) for a in alerts]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
