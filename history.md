# Symphony Project - Knowledge Transfer (KT)

Welcome, Claude Fable! This document serves as a complete Knowledge Transfer for the "Symphony" music intelligence dashboard. The user is transitioning the project to you to resolve ongoing bugs and stabilize the application.

## Development Log

### **Bug Fixes, UI Polish & API Fallbacks (July 09, 2026)**
- Fixed Turso DB quota exceeded error by moving to a local SQLite database that bypasses quotas completely (`hf-symphony/api/db.py`, `.env`).
- Implemented GitHub Actions Keep-Alive cron job to ping the dashboard and prevent 30s cold starts.
- Reduced `logo.png` file size to 4.6KB and restored the missing navbar logo.
- Overhauled "What's Hot?" section into a "🏆 Viral Leaderboard" with absolute positioned rank badges.
- Debugged and fixed missing `googleapiclient` dependency in backend for adding artists.
- Identified API issues with YouTube handle resolution; correctly bubbled up the official API errors to the user UI instead of silently falling back to scrapers.

**Known Issues:**
- The `YOUTUBE_API_KEY` on Hugging Face is either missing or invalid, causing "No YouTube channel found" errors.

| File | Change |
|------|--------|
| `api/db.py` | Switched to standard local sqlite3 over libsql to bypass Turso quotas |
| `.env` | Cleared Turso URL/token |
| `.github/workflows/keep-alive.yml` | Created keep-alive cron job for HF space |
| `frontend/public/logo_small.png` | Added optimized logo |
| `frontend/src/app/youtube/client.js` | Updated What's Hot to Leaderboard UI |
| `frontend/src/app/spotify/page.js` | Updated What's Hot to Leaderboard UI |
| `api/requirements.txt` | Added `google-api-python-client` and `ytmusicapi` |
| `api/main.py` | Added try/except to surface YouTube API errors correctly |
| `collector/youtube_client.py` | Bubbled up ValueError on missing API keys |


## 1. Architecture Overview

Symphony is a full-stack dashboard deployed on **Hugging Face Spaces (Docker)**. It tracks viral songs, new releases, and artist analytics across YouTube and Spotify.

- **Frontend**: Next.js 14 (App Router). Located in `frontend/`. 
  - Originally used standard `<table>`, but was recently migrated to `TableVirtuoso` (`react-virtuoso`) for fast rendering of large artist lists.
  - Client-side data fetching calls `/api/...`.
- **Backend**: FastAPI (Python). Located in `api/main.py`.
  - Serves JSON stats to the frontend.
  - Runs a background asyncio scheduler (`_daily_refresh_loop`) that triggers the data collectors every day at 10 AM IST.
- **Data Collectors**: 
  - Originally written in Python, but the **YouTube Collector was recently migrated to Go (Golang)** for speed. Located in `collector_go/`. 
  - The Go binary (`youtube_enricher`) is compiled during the Docker build and executed by the Python backend via `subprocess`.
- **Database**: Turso (Edge SQLite). 
  - Interacted with using `libsql-experimental` in Python and `github.com/tursodatabase/libsql-client-go/libsql` in Go.
  - Environment variables: `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
- **Deployment**: Hugging Face Spaces.
  - A custom `Dockerfile` installs Node, Python, and Go.
  - It builds Next.js, compiles the Go binary, and uses a `start.sh` script to run the FastAPI backend and Next.js frontend concurrently using a reverse proxy (Next.js rewrites `/api/:path*` to `http://127.0.0.1:8000`).

## 2. Recent Major Changes (Context for Bugs)

1. **Turso Migration**: The DB was moved from local SQLite to remote Turso. 
   - **Impact**: We had to write a custom `LibsqlDictCursor` in `collector/db.py` to make `libsql` behave like `sqlite3.Row`.
2. **Go Collector Migration**: The YouTube collector was rewritten in Go (`collector_go/youtube.go`).
   - **Impact**: Python backend now triggers a Go binary instead of calling a Python function.
3. **Frontend Virtualization**: Added `TableVirtuoso` to fix frontend lag.
   - **Impact**: Required converting server components to client components (`"use client"`), which caused `forwardRef` React crashes until `import React from 'react'` was explicitly added.

## 3. Known Issues & Bugs (What You Need to Fix)

Here is a list of the exact issues the system has been fighting recently. You should verify if my recent patches fully resolved them or if they need further fixing:

### Issue A: "New UI is not reflecting / stuck on Loading" (N+1 Query Timeout)
- **Symptom**: The frontend stays on the "Loading..." spinner forever. 
- **Cause**: In `api/main.py`, the `get_artists()` and `get_spotify_artists()` endpoints were performing correlated subqueries (`SELECT MAX(id) FROM play_snapshots GROUP BY song_id`) for *every single song* to calculate stats. Over a remote Turso network connection, this took > 60 seconds and timed out (`context deadline exceeded`).
- **Status**: I *just* rewrote the SQL queries using Common Table Expressions (CTEs) to do a single fast join. You should verify if this fully fixed the loading issue or if the CTEs have syntax errors / missing columns.

### Issue B: Turso / Libsql Type Strictness
- **Symptom**: 500 Internal Server Error in FastAPI.
- **Cause**: Standard `sqlite3` allows passing SQL parameters as a Python `list` (e.g., `conn.execute(sql, [limit, offset])`). `libsql-experimental` strictly requires a `tuple` and throws `TypeError: argument 'parameters': 'list' object cannot be converted to 'PyTuple'`.
- **Status**: I added a patch in `collector/db.py` inside `LibsqlDictConnection.execute()` to automatically do `params = tuple(params)` if a list is passed. Check if there are other `.execute()` calls bypassing this wrapper.

### Issue C: Next.js API Routing on Hugging Face
- **Symptom**: `fetch()` calls failing in the browser because they tried to reach `http://localhost:8000`.
- **Cause**: On HF Spaces, `localhost` resolves to the user's browser, not the Docker container. 
- **Status**: Fixed by setting `NEXT_PUBLIC_API_URL=""` in the Dockerfile so Next.js uses relative paths (e.g., `/api/artists`), which are then caught by `next.config.mjs` rewrites and proxied to the Python backend locally within the container. Verify that NO files in `frontend/src/` still hardcode `localhost`.

### Issue D: Hugging Face Startup Race Condition
- **Symptom**: Next.js throws 502 errors when the Space first boots up.
- **Cause**: Next.js starts before FastAPI (Uvicorn) is fully ready to accept connections.
- **Status**: Modified `start.sh` to include a `while ! curl -s http://127.0.0.1:8000/api/stats > /dev/null; do sleep 1; done` loop before starting Next.js. 

## 4. Development Guide for Fable

- **To run backend locally**: 
  ```bash
  cd hf-symphony
  source venv/bin/activate
  cd api
  uvicorn main:app --port 8000 --reload
  ```
- **To run frontend locally**:
  ```bash
  cd hf-symphony/frontend
  npm run dev
  ```
- **Local DB Testing**: Ensure you have `libsql-experimental` installed in the python environment (`pip install libsql-experimental`), otherwise `collector/db.py` falls back to standard local sqlite, masking Turso-specific bugs.
- **Logs**: If Hugging Face is crashing, always check the `logs/build` or `logs/container` in the Space UI to see if Uvicorn threw a Python traceback.
- **Syncing**: Keep in mind there are two repos in the workspace (`hf-symphony` and `symphony/music-dashboard`). If you make fixes, make sure they are applied to the `hf-symphony` codebase, committed, and pushed.

Good luck! Optimize intelligently and double-check your SQL syntax.
