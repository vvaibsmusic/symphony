import os, sys, time
sys.path.insert(0, 'collector')
from dotenv import load_dotenv
import db

load_dotenv()
conn = db.get_connection()

artist_id = "arooh"
platform = "youtube"

q1 = """
        SELECT
            s.*,
            (SELECT play_count FROM play_snapshots
             WHERE song_id = s.id ORDER BY collected_at DESC LIMIT 1) as latest_play_count,
            (SELECT play_count FROM play_snapshots
             WHERE song_id = s.id ORDER BY collected_at ASC LIMIT 1) as first_play_count,
            (SELECT like_count FROM play_snapshots
             WHERE song_id = s.id ORDER BY collected_at DESC LIMIT 1) as latest_like_count,
            (SELECT comment_count FROM play_snapshots
             WHERE song_id = s.id ORDER BY collected_at DESC LIMIT 1) as latest_comment_count,
            (SELECT ytmusic_play_count FROM play_snapshots
             WHERE song_id = s.id AND ytmusic_play_count IS NOT NULL ORDER BY collected_at DESC LIMIT 1) as ytmusic_play_count
        FROM songs s
        WHERE s.artist_id = ? AND s.platform = ?
        ORDER BY latest_play_count DESC NULLS LAST
"""

q2 = """
        WITH latest_snaps AS (
            SELECT song_id, MAX(id) as max_id
            FROM play_snapshots
            WHERE platform = ?
            GROUP BY song_id
        ),
        first_snaps AS (
            SELECT song_id, MIN(id) as min_id
            FROM play_snapshots
            WHERE platform = ?
            GROUP BY song_id
        )
        SELECT
            s.*,
            ls_data.play_count as latest_play_count,
            fs_data.play_count as first_play_count,
            ls_data.like_count as latest_like_count,
            ls_data.comment_count as latest_comment_count,
            ls_data.ytmusic_play_count as ytmusic_play_count
        FROM songs s
        LEFT JOIN latest_snaps ls ON s.id = ls.song_id
        LEFT JOIN play_snapshots ls_data ON ls.max_id = ls_data.id
        LEFT JOIN first_snaps fs ON s.id = fs.song_id
        LEFT JOIN play_snapshots fs_data ON fs.min_id = fs_data.id
        WHERE s.artist_id = ? AND s.platform = ?
        ORDER BY latest_play_count DESC NULLS LAST
"""

start = time.time()
conn.execute(q1, (artist_id, platform)).fetchall()
print("Q1 (Old):", time.time() - start)

start = time.time()
conn.execute(q2, (platform, platform, artist_id, platform)).fetchall()
print("Q2 (New):", time.time() - start)
