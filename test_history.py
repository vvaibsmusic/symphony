from api.main import get_song_history

try:
    print(get_song_history("c4b76cf9c3db20cc"))
except Exception as e:
    import traceback
    traceback.print_exc()
