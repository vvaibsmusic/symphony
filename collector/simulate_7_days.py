import sqlite3
import random
from datetime import datetime, timezone, timedelta
from db import get_connection, generate_cycle_id, insert_snapshot, insert_viral_alert

def simulate():
    conn = get_connection()
    
    # Get the latest snapshot for each song
    songs = conn.execute("""
        SELECT s.id, s.title, s.platform, s.artist_id,
            (SELECT play_count FROM play_snapshots ps WHERE ps.song_id = s.id AND ps.platform = s.platform ORDER BY collected_at DESC LIMIT 1) as latest_count,
            (SELECT like_count FROM play_snapshots ps WHERE ps.song_id = s.id AND ps.platform = s.platform ORDER BY collected_at DESC LIMIT 1) as latest_like
        FROM songs s
    """).fetchall()
    
    if not songs:
        print("No songs found to simulate.")
        return
        
    print(f"Simulating 7 days of growth for {len(songs)} songs...")
    
    now = datetime.now(timezone.utc)
    
    for day in range(1, 8):
        sim_time = now + timedelta(days=day)
        cycle_id = f"sim_{day}"
        print(f"Day {day}...")
        
        # Pick 2 random songs to go viral today
        viral_candidates = [s for s in songs if s["latest_count"] and s["latest_count"] > 1000]
        viral_songs = random.sample(viral_candidates, min(2, len(viral_candidates))) if viral_candidates else []
        viral_ids = {s["id"] for s in viral_songs}
        
        for s in songs:
            if not s["latest_count"]:
                continue
                
            is_viral = s["id"] in viral_ids
            
            # Normal growth: 0.1% to 1.5%
            # Viral growth: 15% to 45%
            growth_pct = random.uniform(0.15, 0.45) if is_viral else random.uniform(0.001, 0.015)
            
            new_count = int(s["latest_count"] * (1 + growth_pct))
            new_like = int((s["latest_like"] or 0) * (1 + growth_pct)) if s["latest_like"] else 0
            
            # Insert simulated snapshot
            conn.execute(
                """INSERT INTO play_snapshots (song_id, play_count, like_count, comment_count, platform, cycle_id, collected_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (s["id"], new_count, new_like, 0, s["platform"], cycle_id, sim_time.strftime("%Y-%m-%d %H:%M:%S"))
            )
            
            if is_viral:
                conn.execute(
                    """INSERT INTO viral_alerts (song_id, previous_count, current_count, growth_factor, platform, detected_at)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (s["id"], s["latest_count"], new_count, growth_pct, s["platform"], sim_time.strftime("%Y-%m-%d %H:%M:%S"))
                )
            
            # Update the latest_count for the next iteration (day)
            s_dict = dict(s)
            s_dict["latest_count"] = new_count
            s_dict["latest_like"] = new_like
            s = s_dict
            
    conn.commit()
    conn.close()
    print("Simulation complete.")

if __name__ == "__main__":
    simulate()
