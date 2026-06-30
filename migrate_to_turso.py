import sqlite3
import os
import time
from dotenv import load_dotenv
import libsql_experimental as libsql

load_dotenv()

_TURSO_URL = os.environ.get("TURSO_DATABASE_URL")
_TURSO_TOKEN = os.environ.get("TURSO_AUTH_TOKEN")

local_conn = sqlite3.connect("db/music_dashboard.db")
local_conn.row_factory = sqlite3.Row

remote_conn = libsql.connect(_TURSO_URL, auth_token=_TURSO_TOKEN)

def migrate_table(table_name, batch_size=100):
    print(f"Migrating {table_name}...", flush=True)
    rows = local_conn.execute(f"SELECT * FROM {table_name}").fetchall()
    if not rows:
        return
    cols = rows[0].keys()
    placeholders = ",".join(["?"] * len(cols))
    col_names = ",".join(cols)
    sql = f"INSERT OR IGNORE INTO {table_name} ({col_names}) VALUES ({placeholders})"
    
    # Check how many are already there
    existing = remote_conn.execute(f"SELECT count(*) FROM {table_name}").fetchone()[0]
    print(f"  {existing} / {len(rows)} already in Turso.", flush=True)
    
    for i in range(existing, len(rows), batch_size):
        batch = [tuple(row) for row in rows[i:i+batch_size]]
        retries = 0
        while retries < 5:
            try:
                remote_conn.executemany(sql, batch)
                remote_conn.commit()
                break
            except Exception as e:
                retries += 1
                print(f"  Retry {retries}/5 at row {i}: {e}", flush=True)
                time.sleep(2 * retries)  # exponential backoff
                if retries >= 5:
                    raise
        print(f"  Inserted {min(i+batch_size, len(rows))} / {len(rows)}", flush=True)
        time.sleep(0.2)  # breathing room between batches

# artists are small, already done
migrate_table("songs", batch_size=100)
migrate_table("viral_alerts", batch_size=100)
migrate_table("play_snapshots", batch_size=100)
print("Migration complete!", flush=True)
