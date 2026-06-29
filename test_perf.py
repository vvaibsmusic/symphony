import os, sys, time
sys.path.insert(0, 'collector')
from dotenv import load_dotenv
import db

load_dotenv()
conn = db.get_connection()

q1 = """
SELECT
    a.id,
    (SELECT COUNT(*) FROM songs WHERE artist_id = a.id AND platform = 'youtube') as yt_song_count,
    (SELECT SUM(ps.play_count) FROM play_snapshots ps
     JOIN songs s ON ps.song_id = s.id
     WHERE s.artist_id = a.id AND ps.platform = 'youtube'
     AND ps.id IN (SELECT MAX(id) FROM play_snapshots GROUP BY song_id)
    ) as total_yt_views
FROM artists a
LIMIT 5
"""

q2 = """
WITH latest_snapshots AS (
    SELECT song_id, MAX(id) as max_id
    FROM play_snapshots
    GROUP BY song_id
),
song_stats AS (
    SELECT 
        s.artist_id,
        COUNT(CASE WHEN s.platform = 'youtube' THEN 1 END) as yt_song_count,
        SUM(CASE WHEN s.platform = 'youtube' THEN ps.play_count ELSE 0 END) as total_yt_views
    FROM songs s
    LEFT JOIN latest_snapshots ls ON s.id = ls.song_id
    LEFT JOIN play_snapshots ps ON ls.max_id = ps.id
    GROUP BY s.artist_id
)
SELECT 
    a.id,
    COALESCE(ss.yt_song_count, 0) as yt_song_count,
    COALESCE(ss.total_yt_views, 0) as total_yt_views
FROM artists a
LEFT JOIN song_stats ss ON a.id = ss.artist_id
LIMIT 5
"""

start = time.time()
conn.execute(q1).fetchall()
print("Q1 (Old):", time.time() - start)

start = time.time()
conn.execute(q2).fetchall()
print("Q2 (New):", time.time() - start)
