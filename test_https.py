import os, sys
sys.path.insert(0, 'collector')
from dotenv import load_dotenv
load_dotenv()
# Simulate db.py doing the replace
url = os.environ.get("TURSO_DATABASE_URL")
url = url.replace("libsql://", "https://")
import libsql_experimental as libsql
print(f"Connecting to: {url}")
try:
    conn = libsql.connect(url, auth_token=os.environ.get("TURSO_AUTH_TOKEN"))
    print("Success")
except Exception as e:
    import traceback
    traceback.print_exc()
