import os
import random
import requests
import base64
import pandas as pd
import json

# 1. Load 10 random tracks from dataset.csv
df = pd.read_csv('/Users/vaibhavchandra/vvaibsmusic/dataset.csv')
# drop duplicates by track_id to ensure unique songs
df = df.drop_duplicates(subset=['track_id']).dropna(subset=['track_id'])
sample_df = df.sample(n=10)
track_ids = sample_df['track_id'].tolist()
track_ids_str = ','.join(track_ids)

# 2. Load env vars
with open('.env') as f:
    for line in f:
        if '=' in line and not line.strip().startswith('#'):
            k, v = line.strip().split('=', 1)
            os.environ[k] = v

spotify_id = os.environ.get('SPOTIFY_CLIENT_ID')
spotify_secret = os.environ.get('SPOTIFY_CLIENT_SECRET')

auth_str = f"{spotify_id}:{spotify_secret}"
b64_auth_str = base64.b64encode(auth_str.encode()).decode()

headers = {
    'Authorization': f'Basic {b64_auth_str}',
    'Content-Type': 'application/x-www-form-urlencoded'
}
data = {'grant_type': 'client_credentials'}

response = requests.post('https://accounts.spotify.com/api/token', headers=headers, data=data)
token = response.json().get('access_token')

auth_header = {'Authorization': f'Bearer {token}'}

# 3. Fetch Track Data
tracks_res = requests.get(f'https://api.spotify.com/v1/tracks?ids={track_ids_str}', headers=auth_header).json()
# 4. Fetch Audio Features
features_res = requests.get(f'https://api.spotify.com/v1/audio-features?ids={track_ids_str}', headers=auth_header).json()

results = []
for t, f in zip(tracks_res.get('tracks', []), features_res.get('audio_features', [])):
    if not t or not f:
        continue
    results.append({
        'name': t.get('name'),
        'artist': t['artists'][0]['name'] if t.get('artists') else 'Unknown',
        'popularity': t.get('popularity'),
        'explicit': t.get('explicit'),
        'danceability': f.get('danceability'),
        'energy': f.get('energy'),
        'valence': f.get('valence'),
        'tempo': f.get('tempo'),
        'key': f.get('key'),
        'mode': f.get('mode')
    })

# Output as JSON
with open('results.json', 'w') as out:
    json.dump(results, out, indent=2)

print("SUCCESS")
