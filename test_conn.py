import os
import sys
sys.path.insert(0, 'collector')
from dotenv import load_dotenv
load_dotenv()
os.environ["TURSO_DATABASE_URL"] = os.environ.get("TURSO_DATABASE_URL")
os.environ["TURSO_AUTH_TOKEN"] = os.environ.get("TURSO_AUTH_TOKEN")
import db

try:
    conn = db.get_connection()
    res = conn.execute("SELECT count(*) FROM artists").fetchone()
    print("Success:", res)
except Exception as e:
    import traceback
    traceback.print_exc()
