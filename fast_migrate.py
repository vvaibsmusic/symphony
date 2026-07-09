import sqlite3
import os
import asyncio
from dotenv import load_dotenv
import libsql_client

load_dotenv()

_TURSO_URL = os.environ.get("TURSO_DATABASE_URL")
_TURSO_TOKEN = os.environ.get("TURSO_AUTH_TOKEN")

local_conn = sqlite3.connect("db/music_dashboard.db")
local_conn.row_factory = sqlite3.Row

async def migrate():
    async with libsql_client.create_client(url=_TURSO_URL.replace("libsql://", "https://"), auth_token=_TURSO_TOKEN) as client:
        
        async def process_table(table_name, batch_size=1000):
            print(f"Migrating {table_name}...", flush=True)
            rows = local_conn.execute(f"SELECT * FROM {table_name}").fetchall()
            if not rows: return
            
            existing = (await client.execute(f"SELECT count(*) FROM {table_name}")).rows[0][0]
            print(f"  {existing} / {len(rows)} already in Turso for {table_name}.", flush=True)
            
            cols = rows[0].keys()
            placeholders = ",".join(["?"] * len(cols))
            col_names = ",".join(cols)
            sql = f"INSERT OR IGNORE INTO {table_name} ({col_names}) VALUES ({placeholders})"
            
            for i in range(existing, len(rows), batch_size):
                batch = rows[i:i+batch_size]
                # Map to correct Python types for libsql_client (it requires primitive types)
                statements = []
                for row in batch:
                    args = []
                    for val in tuple(row):
                        if val is None:
                            args.append(None)
                        elif isinstance(val, (int, float, str, bytes)):
                            args.append(val)
                        else:
                            args.append(str(val))
                    statements.append(libsql_client.Statement(sql, args))
                
                await client.batch(statements)
                print(f"  Inserted {min(i+batch_size, len(rows))} / {len(rows)} for {table_name}", flush=True)
                
        await process_table("artists", 1000)
        await process_table("songs", 1000)
        await process_table("viral_alerts", 1000)
        
        # for play_snapshots we can do concurrently
        print(f"Migrating play_snapshots...", flush=True)
        table_name = "play_snapshots"
        rows = local_conn.execute(f"SELECT * FROM {table_name}").fetchall()
        existing = (await client.execute(f"SELECT count(*) FROM {table_name}")).rows[0][0]
        print(f"  {existing} / {len(rows)} already in Turso for {table_name}.", flush=True)
        
        cols = rows[0].keys()
        placeholders = ",".join(["?"] * len(cols))
        col_names = ",".join(cols)
        sql = f"INSERT OR IGNORE INTO {table_name} ({col_names}) VALUES ({placeholders})"
        
        batch_size = 2000
        
        async def send_batch(start_idx):
            batch = rows[start_idx:start_idx+batch_size]
            statements = []
            for row in batch:
                args = []
                for val in tuple(row):
                    if val is None: args.append(None)
                    elif isinstance(val, (int, float, str, bytes)): args.append(val)
                    else: args.append(str(val))
                statements.append(libsql_client.Statement(sql, args))
            await client.batch(statements)
            print(f"  Batch {start_idx} - {start_idx+len(batch)} done.", flush=True)

        # Run 5 concurrent batches of 2000 (10,000 rows at a time)
        for i in range(existing, len(rows), batch_size * 5):
            tasks = []
            for j in range(5):
                start_idx = i + (j * batch_size)
                if start_idx < len(rows):
                    tasks.append(asyncio.create_task(send_batch(start_idx)))
            await asyncio.gather(*tasks)
            print(f"  Total Inserted {min(i + (batch_size*5), len(rows))} / {len(rows)} for {table_name}", flush=True)

asyncio.run(migrate())
