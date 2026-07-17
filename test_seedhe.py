import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "api"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "collector"))

from api.main import _collect_yt_background, _collect_state
import time

_collect_yt_background("seedhe-maut", "Seedhe Maut")
time.sleep(5)
print(_collect_state["seedhe-maut"]["log"])
