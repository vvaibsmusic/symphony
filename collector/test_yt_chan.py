from youtube_client import YouTubeClient
import json

yt = YouTubeClient()
channel_id = "UCPIFKxnlMrmqA4uDYUaIAfA"
channel_response = yt.youtube.channels().list(
    part="contentDetails",
    id=channel_id
).execute()
print(json.dumps(channel_response, indent=2))
