import os
import json
import logging
from google import genai
from google.genai import types

def analyze_comments(comments: list[str]) -> dict:
    """Analyze a list of comments using Gemini and return a JSON dictionary with sentiment."""
    if not comments:
        return {"score": 0.0, "summary": "No comments available.", "themes": []}
        
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        logging.warning("GEMINI_API_KEY or GOOGLE_API_KEY is not set. Skipping sentiment analysis.")
        return {"score": 0.0, "summary": "Sentiment analysis unavailable (missing API key).", "themes": []}
        
    try:
        client = genai.Client(api_key=api_key)
        
        prompt = (
            "Analyze the sentiment and themes of the following YouTube comments for a song.\n"
            "Return a JSON object with three fields:\n"
            "- 'score': a float between -1.0 (very negative) and 1.0 (very positive)\n"
            "- 'summary': a short 1-2 sentence summary of the general audience reaction.\n"
            "- 'themes': a list of objects, each containing 'theme' (string, e.g. 'beat production', 'music video') and 'percentage' (integer, approximate percentage of comments discussing this theme).\n\n"
            f"Comments:\n{json.dumps(comments)}"
        )
        
        response = client.models.generate_content(
            model='gemini-3.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        
        text = response.text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
        
        data = json.loads(text)
        return {
            "score": float(data.get("score", 0.0)),
            "summary": data.get("summary", "No summary provided."),
            "themes": data.get("themes", [])
        }
    except Exception as e:
        logging.error(f"Error analyzing comments with Gemini: {e}")
        return {"score": 0.0, "summary": "Error analyzing sentiment.", "themes": []}
