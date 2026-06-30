import os
from dotenv import load_dotenv
import libsql_experimental as libsql

load_dotenv()
print("Connecting...")
conn = libsql.connect(os.environ["TURSO_DATABASE_URL"], auth_token=os.environ["TURSO_AUTH_TOKEN"])
print("Connected!")
try:
    print(conn.execute("SELECT count(*) FROM artists").fetchone())
except Exception as e:
    print("Error:", e)
