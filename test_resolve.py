import sys, os
sys.path.append(os.path.join(os.getcwd(), 'collector'))
from youtube_client import YouTubeClient
yt = YouTubeClient()
songs = yt.get_channel_videos("UCV9Mdim99sdyd56EqKJ52fg", 50)
print(len(songs))
if songs: print(songs[0])
