---
description: How to launch the Music Intelligence Dashboard
---

# Launch Dashboard

// turbo-all

## Quick Start (One Command)
```bash
cd /Users/vaibhavchandra/vvaibsmusic/symphony/music-dashboard
bash symphony.sh
```
This starts both the API backend (port 8000) and the Next.js frontend (port 3000), then opens the browser.

## Manual Start (Step by Step)

### 1. Start the API Backend
```bash
cd /Users/vaibhavchandra/vvaibsmusic/symphony/music-dashboard
source venv/bin/activate
cd api
uvicorn main:app --port 8000 &
```

### 2. Start the Frontend
```bash
cd /Users/vaibhavchandra/vvaibsmusic/symphony/music-dashboard/frontend
npm run dev &
```

### 3. Open the Dashboard
Navigate to **http://localhost:3000** in your browser.

## Refresh Data Manually

### YouTube Stats
```bash
curl -X POST http://localhost:8000/api/refresh/stats
```

### Spotify Stats
```bash
curl -X POST http://localhost:8000/api/refresh/spotify/stats
```

### Discover New YouTube Songs
```bash
curl -X POST http://localhost:8000/api/refresh/discover
```

### Check Refresh Status
```bash
curl http://localhost:8000/api/refresh/status
```

## Auto-Refresh
The API has a built-in scheduler that auto-refreshes YouTube + Spotify data at **9:00 AM IST** daily (runs as long as the API server is running).

Check scheduler: `curl http://localhost:8000/api/scheduler/status`

## Stop Everything
Press `Ctrl+C` if running via `symphony.sh`, or:
```bash
pkill -f "uvicorn main:app"
pkill -f "node.*next"
```
