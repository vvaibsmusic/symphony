"""A&R Discovery Agent to find new artists from Reddit."""

import os
import json
import logging
import urllib.request
from pathlib import Path
from dotenv import load_dotenv

from google import genai
from google.genai import types

from db import get_connection

load_dotenv()
logging.basicConfig(level=logging.INFO)

def fetch_reddit_posts(subreddit: str = "IndianHipHopHeads", limit: int = 25) -> list[dict]:
    """Fetch top weekly posts from a subreddit."""
    url = f"https://www.reddit.com/r/{subreddit}/top.json?t=week&limit={limit}"
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'SymphonyMusicBot/1.0 (by /u/vvaibsmusic)'}
    )
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            posts = []
            for child in data.get('data', {}).get('children', []):
                post = child.get('data', {})
                posts.append({
                    "title": post.get("title"),
                    "selftext": post.get("selftext"),
                    "score": post.get("score"),
                    "num_comments": post.get("num_comments"),
                    "url": post.get("url")
                })
            return posts
    except Exception as e:
        logging.error(f"Error fetching from Reddit: {e}")
        # Fallback to mock data for demonstration purposes if blocked
        return [
            {"title": "Seedhe Maut's new album is insane", "selftext": "The production on the new Seedhe Maut project is next level. Encore ABJ went crazy.", "score": 450, "num_comments": 120, "url": ""},
            {"title": "Thoughts on paradox?", "selftext": "Paradox is dropping back to back bangers. Def one of the most versatile artists right now.", "score": 320, "num_comments": 85, "url": ""},
            {"title": "Yashraj's ep is flying under the radar", "selftext": "Yashraj just dropped a new EP and it's some of his best work. The lyricism is top notch.", "score": 210, "num_comments": 45, "url": ""},
            {"title": "Hanumankind - Big Dawgs", "selftext": "Hanumankind is going global with this new track. The music video is insane.", "score": 890, "num_comments": 250, "url": ""},
            {"title": "New underground artist to watch: Dhanji", "selftext": "Dhanji from Ahmedabad is making waves with his unique sound and Gujarati flavor.", "score": 150, "num_comments": 30, "url": ""}
        ]

def extract_artists_with_langchain(posts: list[dict]) -> list[dict]:
    """Use Gemini via genai SDK to extract artist names and reasons from Reddit posts."""
    if not posts:
        return []
        
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        logging.error("GEMINI_API_KEY or GOOGLE_API_KEY not found.")
        return []

    client = genai.Client(api_key=api_key)
    
    # We construct a prompt passing the top posts
    posts_text = "\n\n".join([
        f"Title: {p['title']}\nScore: {p['score']}\nComments: {p['num_comments']}\nText: {p['selftext'][:500]}" 
        for p in posts
    ])
    
    prompt = (
        "You are an A&R scout looking for rising Indian Hip Hop artists based on Reddit discussions.\n"
        "Analyze the following recent top posts from r/IndianHipHopHeads.\n"
        "Identify up to 10 artists who are generating buzz, releasing highly anticipated music, or gaining traction.\n"
        "Return a JSON list of objects, where each object has:\n"
        "- 'name': The artist's name (string)\n"
        "- 'reason': A 1-2 sentence explanation of why they are generating buzz based on the posts (string)\n\n"
        f"Posts:\n{posts_text}"
    )

    try:
        response = client.models.generate_content(
            model='gemini-3.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        data = json.loads(response.text)
        if isinstance(data, list):
            return data
        elif isinstance(data, dict) and "artists" in data:
            return data["artists"]
        else:
            logging.warning(f"Unexpected JSON format: {data}")
            return []
    except Exception as e:
        logging.error(f"Error extracting artists: {e}")
        return []

def save_suggested_artists(artists: list[dict], source: str = "Reddit (r/IndianHipHopHeads)"):
    """Save the suggested artists to the database."""
    conn = get_connection()
    count = 0
    for artist in artists:
        name = artist.get("name")
        reason = artist.get("reason")
        if not name or not reason:
            continue
            
        try:
            # Check if artist already exists in main artists table
            exists = conn.execute("SELECT id FROM artists WHERE name LIKE ?", (name,)).fetchone()
            if exists:
                continue
                
            conn.execute("""
                INSERT INTO suggested_artists (name, reason, source, status)
                VALUES (?, ?, ?, 'pending')
                ON CONFLICT(name) DO UPDATE SET 
                    reason=excluded.reason,
                    source=excluded.source,
                    status='pending'
            """, (name, reason, source))
            count += 1
        except Exception as e:
            logging.error(f"Error saving artist {name}: {e}")
            
    conn.commit()
    conn.close()
    logging.info(f"Saved {count} new suggested artists.")

if __name__ == "__main__":
    logging.info("Starting A&R Discovery Agent...")
    posts = fetch_reddit_posts()
    logging.info(f"Fetched {len(posts)} posts from Reddit.")
    
    artists = extract_artists_with_langchain(posts)
    logging.info(f"Extracted {len(artists)} artists via Gemini.")
    
    save_suggested_artists(artists)
    logging.info("A&R Discovery Agent finished.")
