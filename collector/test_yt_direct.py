from youtube_client import YouTubeClient
import json

yt = YouTubeClient()
channel_id = "UCPIFKxnlMrmqA4uDYUaIAfA"
print(f"Testing get_channel_videos for {channel_id}")
songs = yt.get_channel_videos(channel_id, max_results=50)
print(f"Found {len(songs)} songs via get_channel_videos")

if not songs:
    print("Trying fallback ytmusicapi")
    songs = yt.get_artist_songs_ytmusic(channel_id, "Seedhe Maut", fast_mode=True)
    print(f"Found {len(songs)} songs via ytmusicapi")
    
for s in songs[:5]:
    print(s['title'])
