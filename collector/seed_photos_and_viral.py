import sqlite3
import time
import random
from concurrent.futures import ThreadPoolExecutor
from ytmusicapi import YTMusic
import uuid

def fetch_image(yt, artist_id, artist_name):
    try:
        results = yt.search(artist_name, filter="artists")
        if results and 'thumbnails' in results[0] and results[0]['thumbnails']:
            url = results[0]['thumbnails'][-1]['url']
            return artist_id, url
    except Exception as e:
        print(f"Failed {artist_name}: {e}")
    return artist_id, None

def main():
    print("Connecting to local database...")
    conn = sqlite3.connect('../db/music_dashboard.db')
    c = conn.cursor()

    # 1. Fetch artists without images
    c.execute("SELECT id, name FROM artists WHERE image_url IS NULL OR image_url = ''")
    artists = c.fetchall()
    
    if artists:
        print(f"Fetching images for {len(artists)} artists...")
        yt = YTMusic()
        updates = []
        
        # We can speed this up with threads
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(fetch_image, yt, a[0], a[1]) for a in artists]
            for i, f in enumerate(futures):
                aid, url = f.result()
                if url:
                    # High quality image fix: strip w120-h120 params
                    url = url.split("=")[0] + "=w500-h500-l90-rj"
                    updates.append((url, aid))
                if (i+1) % 20 == 0:
                    print(f"Processed {i+1}/{len(artists)}...")
                    
        # Update database
        c.executemany("UPDATE artists SET image_url = ? WHERE id = ?", updates)
        conn.commit()
        print(f"Updated {len(updates)} artist images!")
    else:
        print("All artists already have images.")

    # 2. Seed some fake viral songs if viral_alerts is empty
    c.execute("SELECT COUNT(*) FROM viral_alerts")
    if c.fetchone()[0] == 0:
        print("Seeding fake viral songs...")
        
        # Pick 10 random artists
        c.execute("SELECT id FROM artists ORDER BY RANDOM() LIMIT 10")
        random_artists = [r[0] for r in c.fetchall()]
        
        for i, aid in enumerate(random_artists):
            song_id = str(uuid.uuid4())
            c.execute("""
                INSERT INTO songs (id, artist_id, platform_id, title, album_name, release_date, thumbnail_url, collected_at)
                VALUES (?, ?, ?, ?, ?, date('now', '-7 days'), ?, datetime('now'))
            """, (song_id, aid, f"yt_vid_{i}", f"Viral Hit Song {i+1}", f"Album {i}", f"https://picsum.photos/seed/{song_id}/300/300"))
            
            # Create a viral alert
            alert_id = str(uuid.uuid4())
            c.execute("""
                INSERT INTO viral_alerts (id, song_id, previous_count, current_count, growth_factor, detected_at, status, platform)
                VALUES (?, ?, ?, ?, ?, datetime('now', '-1 hours'), 'active', 'youtube')
            """, (alert_id, song_id, 100000, 450000, 4.5, ))
            
            # Create current stats
            c.execute("""
                INSERT INTO youtube_song_stats (song_id, views, likes, comments, collected_at)
                VALUES (?, 450000, 50000, 2000, datetime('now'))
            """, (song_id, ))
            
        conn.commit()
        print("Seeded 10 fake viral songs.")

    conn.close()
    print("Done!")

if __name__ == "__main__":
    main()
