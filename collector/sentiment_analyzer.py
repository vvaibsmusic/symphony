import os
import json
import logging
from google import genai
from google.genai import types

def analyze_comments(comments: list[str]) -> dict:
    """Analyze a list of comments using Gemini and return a JSON dictionary with sentiment."""
    if not comments:
        return {"score": 0.0, "summary": "No comments available."}
        
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logging.warning("GEMINI_API_KEY is not set. Skipping sentiment analysis.")
        return {"score": 0.0, "summary": "Sentiment analysis unavailable (missing API key)."}
        
    try:
        client = genai.Client(api_key=api_key)
        
        prompt = (
            "Analyze the sentiment of the following YouTube comments for a song.\n"
            "Return a JSON object with two fields:\n"
            "- 'score': a float between -1.0 (very negative) and 1.0 (very positive)\n"
            "- 'summary': a short 1-2 sentence summary of the general audience reaction.\n\n"
            f"Comments:\n{json.dumps(comments)}"
        )
        
        response = client.models.generate_content(
            model='gemini-3.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        
        data = json.loads(response.text)
        return {
            "score": float(data.get("score", 0.0)),
            "summary": data.get("summary", "No summary provided.")
        }
    except Exception as e:
        logging.error(f"Error analyzing comments with Gemini: {e}")
        return {"score": 0.0, "summary": "Error analyzing sentiment."}
