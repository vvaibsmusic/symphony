# Symphony Project - Knowledge Transfer (KT)

Welcome! This document serves as a complete Knowledge Transfer for the "Symphony" music intelligence dashboard. The user is transitioning the project to you to resolve ongoing bugs and stabilize the application.

## Development Log

### **Major UI Fixes, SQLite Migration & Simulation (July 15-16, 2026)**
- **Turso Removed**: Completely stripped all Turso dependencies, environment variables, and `libsql` code. The project now uses purely local SQLite (`db/music_dashboard.db`) due to quota issues and user preference.
- **Deep Clean**: Purged `collector_go/` and unused files. Simplified the python backend to run everything synchronously via `subprocess` calls.
- **Artist Photos & Viral Songs**: Implemented robust seeders (`seed_photos_and_viral.py`) to fetch missing artist avatars via `ytmusicapi` and successfully render them on the UI.
- **Mobile Responsiveness**: Extensively refactored `globals.css`, `youtube/page.js`, `spotify/page.js`, and `artist/[id]/page.js`. Added `symphony-page-container`, `symphony-navbar-inner`, and ensured horizontal tables scroll via `overflow: auto` without breaking the viewport (`overflow-x: hidden` on body).
- **GitHub Actions**: Updated the `daily_collection.yml` cron to trigger YouTube Discover and Stats. (Note: Spotify triggers were temporarily added and then reverted per user request).
- **7-Day Simulation**: Built and executed `simulate_7_days.py` via `/api/simulate` on Hugging Face to inject 7 days of realistic growth and viral breakouts into the ephemeral database.

### **Bug Fixes, UI Polish & API Fallbacks (July 09, 2026)**
- Implemented GitHub Actions Keep-Alive cron job to ping the dashboard and prevent 30s cold starts.
- Reduced `logo.png` file size to 4.6KB and restored the missing navbar logo.
- Overhauled "What's Hot?" section into a "🏆 Viral Leaderboard" with absolute positioned rank badges.
- Debugged and fixed missing `googleapiclient` dependency in backend for adding artists.
- Identified API issues with YouTube handle resolution; correctly bubbled up the official API errors to the user UI instead of silently falling back to scrapers.

**Known Issues:**
- The `YOUTUBE_API_KEY` on Hugging Face is either missing or invalid, causing "No YouTube channel found" errors.
- **Ephemeral Storage**: Because the project is deployed on Hugging Face Spaces and Turso was removed, the local SQLite database resets every time the Space sleeps. The user was advised to enable Persistent Storage on Hugging Face.

## 1. Architecture Overview

Symphony is a full-stack dashboard deployed on **Hugging Face Spaces (Docker)**. It tracks viral songs, new releases, and artist analytics across YouTube and Spotify.

- **Frontend**: Next.js 14 (App Router). Located in `frontend/`. 
  - Originally used standard `<table>`, but was recently migrated to `TableVirtuoso` (`react-virtuoso`) for fast rendering of large artist lists.
  - Client-side data fetching calls `/api/...`.
- **Backend**: FastAPI (Python). Located in `api/main.py`.
  - Serves JSON stats to the frontend.
  - Exposes endpoints to trigger Python collection scripts (`/api/refresh/...`).
- **Database**: Local SQLite. 
  - File is `db/music_dashboard.db`.
- **Deployment**: Hugging Face Spaces.
  - A custom `Dockerfile` installs Node, Python.
  - It builds Next.js and uses a `start.sh` script to run the FastAPI backend and Next.js frontend concurrently using a reverse proxy (Next.js rewrites `/api/:path*` to `http://127.0.0.1:8000`).

## 2. Recent Major Changes (Context for Bugs)

1. **Turso -> SQLite Migration**: The DB was moved back to local SQLite from Turso. The app now relies entirely on standard `sqlite3` driver.
2. **Go Collector Removed**: The Go collector was deleted.
3. **Frontend Virtualization**: Added `TableVirtuoso` to fix frontend lag.

## 4. Development Guide for Agents

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
