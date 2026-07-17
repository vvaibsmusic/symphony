import os
import json
import sqlite3
from pathlib import Path
from datetime import datetime, timedelta
from dotenv import load_dotenv

# LangChain imports
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field

load_dotenv()

DB_PATH = Path(__file__).parent.parent / "db" / "music_dashboard.db"

class PredictionResult(BaseModel):
    is_viral_candidate: bool = Field(description="True if the song is highly likely to go viral soon.")
    confidence_score: float = Field(description="Confidence score between 0.0 and 1.0")
    reasoning: str = Field(description="Short explanation of why this trajectory indicates a viral breakout or not.")

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def run_predictions():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("GEMINI_API_KEY is not set. Cannot run predictions.")
        return

    conn = get_db()
    
    # 1. Find the top 20 fastest growing songs in the last 7 days
    seven_days_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")
    
    query = """
    SELECT 
        s.id, s.title, a.name as artist, s.release_date,
        MAX(p.play_count) as current_views,
        MIN(p.play_count) as past_views,
        (MAX(p.play_count) - MIN(p.play_count)) as growth_7d
    FROM songs s
    JOIN artists a ON s.artist_id = a.id
    JOIN play_snapshots p ON s.id = p.song_id
    WHERE p.collected_at >= ?
    GROUP BY s.id
    HAVING current_views > past_views AND growth_7d > 10
    ORDER BY growth_7d DESC
    LIMIT 10
    """
    
    candidates = conn.execute(query, (seven_days_ago,)).fetchall()
    
    if not candidates:
        print("No fast-growing candidates found.")
        return
        
    print(f"Analyzing {len(candidates)} fast-growing songs with LangChain...")

    # Initialize LangChain LLM
    llm = ChatGoogleGenerativeAI(
        model="gemini-3.5-flash",
        google_api_key=api_key,
        temperature=0.2,
    )
    
    parser = JsonOutputParser(pydantic_object=PredictionResult)
    
    prompt = PromptTemplate(
        template="You are a Music Industry A&R and Data Analyst.\n"
                 "Analyze the following song's recent growth trajectory.\n"
                 "Determine if it has the momentum to go truly viral (a massive breakout hit).\n\n"
                 "Song: {title} by {artist}\n"
                 "Release Date: {release_date}\n"
                 "Views 7 days ago: {past_views}\n"
                 "Views today: {current_views}\n"
                 "Net Growth in 7 days: {growth_7d}\n\n"
                 "{format_instructions}\n",
        input_variables=["title", "artist", "release_date", "past_views", "current_views", "growth_7d"],
        partial_variables={"format_instructions": parser.get_format_instructions()},
    )
    
    chain = prompt | llm | parser
    
    # Analyze each candidate
    for cand in candidates:
        print(f"Predicting for: {cand['title']} by {cand['artist']}")
        try:
            result = chain.invoke({
                "title": cand["title"],
                "artist": cand["artist"],
                "release_date": cand["release_date"] or "Unknown",
                "past_views": cand["past_views"],
                "current_views": cand["current_views"],
                "growth_7d": cand["growth_7d"]
            })
            
            # Upsert prediction into DB
            conn.execute("""
                INSERT INTO viral_predictions (song_id, prediction_date, is_viral_candidate, confidence_score, reasoning)
                VALUES (?, datetime('now'), ?, ?, ?)
            """, (
                cand["id"], 
                result.get("is_viral_candidate", False),
                result.get("confidence_score", 0.0),
                result.get("reasoning", "")
            ))
            print(f"  -> Viral: {result.get('is_viral_candidate')}, Confidence: {result.get('confidence_score')}")
        except Exception as e:
            print(f"  -> Error predicting: {e}")
            
    conn.commit()
    conn.close()
    print("Predictions completed and saved to database.")

if __name__ == "__main__":
    run_predictions()
