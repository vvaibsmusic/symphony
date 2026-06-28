import os
import requests
import base64

def load_env():
    try:
        with open('.env') as f:
            for line in f:
                if '=' in line and not line.strip().startswith('#'):
                    k, v = line.strip().split('=', 1)
                    os.environ[k] = v
    except FileNotFoundError:
        print("No .env file found in the current directory.")

load_env()

print("--- Testing Spotify API ---")
spotify_id = os.environ.get('SPOTIFY_CLIENT_ID')
spotify_secret = os.environ.get('SPOTIFY_CLIENT_SECRET')

if not spotify_id or not spotify_secret:
    print("❌ Spotify credentials missing in .env")
else:
    auth_str = f"{spotify_id}:{spotify_secret}"
    b64_auth_str = base64.b64encode(auth_str.encode()).decode()
    
    headers = {
        'Authorization': f'Basic {b64_auth_str}',
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    data = {'grant_type': 'client_credentials'}
    
    response = requests.post('https://accounts.spotify.com/api/token', headers=headers, data=data)
    if response.status_code == 200:
        token = response.json().get('access_token')
        print("✅ Spotify Authentication Successful! (Token retrieved)")
        
        # Test a basic endpoint (Get Track: "Never Gonna Give You Up" by Rick Astley)
        track_headers = {'Authorization': f'Bearer {token}'}
        track_res = requests.get('https://api.spotify.com/v1/tracks/4cOdK2wGLETKBW3PvgPWqT', headers=track_headers)
        if track_res.status_code == 200:
            track_name = track_res.json().get('name')
            print(f"✅ Spotify API Call Successful! (Retrieved track: '{track_name}')")
        else:
            print(f"❌ Spotify API Call Failed: {track_res.text}")
    else:
        print(f"❌ Spotify Authentication Failed: {response.text}")


print("\n--- Testing YouTube API ---")
youtube_key = os.environ.get('YOUTUBE_API_KEY')

if not youtube_key:
    print("❌ YouTube API Key missing in .env")
else:
    # Test YouTube API by fetching a video's snippet
    # Using a generic public video ID (Never Gonna Give You Up)
    yt_url = f"https://www.googleapis.com/youtube/v3/videos?part=snippet&id=dQw4w9WgXcQ&key={youtube_key}"
    yt_res = requests.get(yt_url)
    if yt_res.status_code == 200:
        items = yt_res.json().get('items', [])
        if items:
            title = items[0]['snippet']['title']
            print(f"✅ YouTube API Call Successful! (Retrieved video: '{title}')")
        else:
            print("✅ YouTube API Call Successful but no items found.")
    else:
        print(f"❌ YouTube API Call Failed: HTTP {yt_res.status_code}")
        print(f"   Details: {yt_res.json().get('error', {}).get('message', yt_res.text)}")
