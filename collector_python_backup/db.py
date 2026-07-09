"""SQLite database helpers for the music dashboard."""

import sqlite3
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

DB_PATH = Path(__file__).parent.parent / "db" / "music_dashboard.db"
SCHEMA_PATH = Path(__file__).parent.parent / "db" / "schema.sql"


def get_connection():
    """Get a SQLite connection with WAL mode for better concurrency."""
    os.makedirs(DB_PATH.parent, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Initialize the database from schema.sql and run migrations."""
    os.makedirs(DB_PATH.parent, exist_ok=True)
    conn = get_connection()
    with open(SCHEMA_PATH, "r") as f:
        conn.executescript(f.read())

    # Migration: add cycle_id if missing
    cols = [row["name"] for row in conn.execute("PRAGMA table_info(play_snapshots)").fetchall()]
    if "cycle_id" not in cols:
        conn.execute("ALTER TABLE play_snapshots ADD COLUMN cycle_id TEXT")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_cycle ON play_snapshots(cycle_id)")
        conn.commit()
        print("[migration] Added cycle_id to play_snapshots")

    # Migration: add ytmusic_play_count if missing
    cols = [row["name"] for row in conn.execute("PRAGMA table_info(play_snapshots)").fetchall()]
    if "ytmusic_play_count" not in cols:
        conn.execute("ALTER TABLE play_snapshots ADD COLUMN ytmusic_play_count INTEGER")
        conn.commit()
        print("[migration] Added ytmusic_play_count to play_snapshots")

    # Composite indexes for the dashboard's hot queries (latest snapshot per
    # song by platform, songs by artist+platform, alerts by platform)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_platform_song ON play_snapshots(platform, song_id, id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_song_platform_time ON play_snapshots(song_id, platform, collected_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_songs_artist_platform ON songs(artist_id, platform)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_alerts_platform ON viral_alerts(platform)")
    conn.commit()

    conn.close()
    print(f"Database initialized at {DB_PATH}")


def upsert_artist(conn, artist: dict):
    """Insert or update an artist."""
    conn.execute(
        """INSERT INTO artists (id, name, spotify_id, youtube_channel_id, genre, image_url, is_watched)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name=excluded.name,
             spotify_id=excluded.spotify_id,
             youtube_channel_id=excluded.youtube_channel_id,
             genre=excluded.genre,
             image_url=excluded.image_url""",
        (
            artist["id"],
            artist["name"],
            artist.get("spotify_id"),
            artist.get("youtube_channel_id"),
            artist.get("genre"),
            artist.get("image_url"),
            artist.get("is_watched", 0),
        ),
    )


def upsert_song(conn, song: dict):
    """Insert or update a song."""
    conn.execute(
        """INSERT INTO songs (id, artist_id, title, platform, platform_id, album_name, release_date, thumbnail_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(platform, platform_id) DO UPDATE SET
             title=excluded.title,
             album_name=excluded.album_name,
             release_date=excluded.release_date,
             thumbnail_url=excluded.thumbnail_url""",
        (
            song["id"],
            song["artist_id"],
            song["title"],
            song["platform"],
            song["platform_id"],
            song.get("album_name"),
            song.get("release_date"),
            song.get("thumbnail_url"),
        ),
    )


def generate_cycle_id(platform: str = "youtube") -> str:
    """Generate a cycle_id for the current collection run.

    Format: {platform}_{YYYYMMDD_HHMM_IST}
    All snapshots in the same run share this ID.
    """
    ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    return f"{platform}_{ist.strftime('%Y%m%d_%H%M')}"


def insert_snapshot(conn, song_id: str, play_count: int, like_count: int, comment_count: int, platform: str, cycle_id: str = None, ytmusic_play_count: int = None):
    """Record a play count snapshot with optional cycle_id and ytmusic_play_count."""
    conn.execute(
        """INSERT INTO play_snapshots (song_id, play_count, like_count, comment_count, platform, cycle_id, ytmusic_play_count)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (song_id, play_count, like_count, comment_count, platform, cycle_id, ytmusic_play_count),
    )


def get_previous_snapshot(conn, song_id: str, platform: str):
    """Get the most recent snapshot for a song (before the current one)."""
    row = conn.execute(
        """SELECT play_count, collected_at FROM play_snapshots
           WHERE song_id = ? AND platform = ?
           ORDER BY collected_at DESC LIMIT 1""",
        (song_id, platform),
    ).fetchone()
    return dict(row) if row else None


def insert_viral_alert(conn, alert: dict):
    """Insert a viral alert."""
    conn.execute(
        """INSERT INTO viral_alerts (song_id, previous_count, current_count, growth_factor, platform)
           VALUES (?, ?, ?, ?, ?)""",
        (
            alert["song_id"],
            alert["previous_count"],
            alert["current_count"],
            alert["growth_factor"],
            alert["platform"],
        ),
    )


def get_all_artists(conn, platform_filter=None):
    """Get all artists, optionally filtered by platform availability."""
    if platform_filter == "youtube":
        return conn.execute(
            "SELECT * FROM artists WHERE youtube_channel_id IS NOT NULL ORDER BY name"
        ).fetchall()
    elif platform_filter == "spotify":
        return conn.execute(
            "SELECT * FROM artists WHERE spotify_id IS NOT NULL ORDER BY name"
        ).fetchall()
    return conn.execute("SELECT * FROM artists ORDER BY name").fetchall()


def get_watched_artists(conn):
    """Get all watched artists."""
    return conn.execute(
        "SELECT * FROM artists WHERE is_watched = 1 ORDER BY name"
    ).fetchall()


if __name__ == "__main__":
    init_db()
