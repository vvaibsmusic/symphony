import os
import requests
import base64
import librosa
import numpy as np

# 1. Load Spotify credentials
with open('.env') as f:
    for line in f:
        if '=' in line and not line.strip().startswith('#'):
            k, v = line.strip().split('=', 1)
            os.environ[k] = v

spotify_id = os.environ.get('SPOTIFY_CLIENT_ID')
spotify_secret = os.environ.get('SPOTIFY_CLIENT_SECRET')

# 2. Get Access Token
auth_str = f"{spotify_id}:{spotify_secret}"
b64_auth_str = base64.b64encode(auth_str.encode()).decode()
headers = {'Authorization': f'Basic {b64_auth_str}', 'Content-Type': 'application/x-www-form-urlencoded'}
token = requests.post('https://accounts.spotify.com/api/token', headers=headers, data={'grant_type': 'client_credentials'}).json().get('access_token')

# 3. Fetch Track Data (Example: "Blinding Lights" by The Weeknd)
track_id = "0VjIjW4GlUZAMYd2vXMi3b"
auth_header = {'Authorization': f'Bearer {token}'}
track_res = requests.get(f'https://api.spotify.com/v1/tracks/{track_id}', headers=auth_header).json()

preview_url = track_res.get('preview_url')
print(f"Track: {track_res['name']} by {track_res['artists'][0]['name']}")

if not preview_url:
    print("No preview URL available for this track.")
    exit()

# 4. Download the 30-second preview audio
print("Downloading 30-second preview...")
audio_data = requests.get(preview_url).content
with open('preview.mp3', 'wb') as f:
    f.write(audio_data)

# 5. Analyze the audio using librosa (NO KAGGLE DATASET NEEDED!)
print("Analyzing audio features with librosa...")
y, sr = librosa.load('preview.mp3', sr=None)

# Calculate Tempo (BPM)
tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
# Extract numeric tempo safely from librosa output
tempo_val = float(tempo[0]) if isinstance(tempo, np.ndarray) else float(tempo)
print(f"✅ Calculated Tempo: {tempo_val:.2f} BPM")

# Calculate Energy (using RMS as a proxy)
rms = librosa.feature.rms(y=y)
energy = float(np.mean(rms))
# Normalize energy to a 0-1 scale roughly based on typical pop RMS values
normalized_energy = min(1.0, energy / 0.3)
print(f"✅ Calculated Energy: {normalized_energy:.2f} (0-1 scale)")

# Clean up
os.remove('preview.mp3')
print("\nSuccess! We analyzed the track purely from the audio waveform without Spotify's audio-features API or the Kaggle dataset.")
