import os, sys
sys.path.insert(0, 'collector')
from dotenv import load_dotenv
import db

load_dotenv()
conn = db.get_connection()
res = conn.execute("SELECT release_date, title, platform FROM songs ORDER BY release_date DESC LIMIT 5").fetchall()
for r in res:
    print(r)
