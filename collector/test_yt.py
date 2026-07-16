from ytmusicapi import YTMusic
yt = YTMusic()
results = yt.search("Karan Aujla", filter="artists")
print(results[0]['thumbnails'][-1]['url'] if results else "none")
