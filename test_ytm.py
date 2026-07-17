from ytmusicapi import YTMusic

ytm = YTMusic()
search_results = ytm.search("Seedhe Maut", filter="artists", limit=5)
print("Search results:")
for r in search_results:
    print(r.get('artist', r.get('name', 'Unknown')), r.get('browseId'))

if search_results and search_results[0].get("browseId"):
    artist_data = ytm.get_artist(search_results[0]["browseId"])
    print(f"\nArtist found: {artist_data.get('name')}")
    if "songs" in artist_data and "results" in artist_data["songs"]:
        print(f"Songs count: {len(artist_data['songs']['results'])}")
    else:
        print("No songs found in artist data!")
else:
    print("No browseId found.")
