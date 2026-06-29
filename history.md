# Symphony Dashboard — Performance Audit & Work History

## ✅ Completed Work

### 1. Database Infrastructure
- **Turso Migration:** Migrated all 137,578 `play_snapshots`, 6,518 `songs`, and 85 `viral_alerts` to remote Turso cloud database.
- **Connection Pooling:** Global persistent connection in `collector/db.py` — eliminated ~400ms TLS handshake per request.
- **6 Composite Indexes** auto-created on server startup via `ensure_indexes()`:
  - `play_snapshots(song_id, platform, collected_at DESC)` — accelerates all "latest snapshot" lookups
  - `songs(artist_id, platform)` — covers artist+platform filters
  - `viral_alerts(platform)` — speeds viral endpoint filtering
  - `artists(spotify_id)` — instant Spotify artist lookups
  - `play_snapshots(platform, song_id)` — Spotify snapshot queries
  - `artists(is_watched)` — watched artist filtering

### 2. Backend Query Optimization (api/main.py)
Every correlated subquery pattern has been eliminated:
- **YouTube Artists** (`GET /api/artists`): Already used CTEs ✅
- **Spotify Artists** (`GET /api/spotify/artists`): Rewrote 4 correlated subqueries → CTE with `song_stats`
- **Artist Detail** (`GET /api/artist/{id}`): Rewrote 7 correlated subqueries per song → `latest_snaps` + `first_snaps` CTEs
- **Spotify Artist Detail** (`GET /api/spotify/artist/{id}`): Same CTE pattern applied
- **Watchlist Releases** (`GET /api/watchlist/releases`): Merged 2 separate queries → single CTE + Python split
- **Spotify Releases** (`GET /api/spotify/releases`): Same CTE merge pattern
- **YouTube Viral** (`GET /api/youtube/viral`): N+1 `enrich_viral_alert` loop → `enrich_viral_alerts_bulk` (1 query)
- **Spotify Viral** (`GET /api/spotify/viral`): Same bulk enrichment
- **Stats** (`GET /api/stats`): Merged 7 `COUNT(*)` queries → single multi-column SELECT
- **Global Search** (`GET /api/search/global`): 4 correlated subqueries → CTE/JOIN approach
- **Spotify Search** (`GET /api/spotify/search/global`): Same CTE/JOIN approach

### 3. Backend Metrics (api/metrics.py)
- **`compute_artist_metrics`**: Replaced per-cycle_id loop (up to 10 queries) → single `GROUP BY ps.cycle_id` query
- **`_compute_artist_metrics_legacy`**: Fixed full-table-scan subquery → artist-scoped CTE
- **`enrich_viral_alerts_bulk`**: New function — fetches snapshots for all alerts in 1 query using window functions

### 4. Caching Layer (api/cache.py)
- Thread-safe in-memory TTL cache decorator
- `invalidate_cache()` for clearing after data mutations

### 5. Frontend Fixes
- `toggleWatch` no longer re-fetches all 6 endpoints (only re-fetches artists)
- `setInterval` polling has proper error handling + cleanup
- Artist leaderboard images now have `loading="lazy"`
- Removed duplicate Inter font `@import` in `globals.css`

---

## 📋 Remaining Frontend Optimization (Lower Priority)
These are quality-of-life improvements that won't dramatically affect perceived load time now that the backend is fast:

1. **Client-side caching**: Consider adding SWR or React Query to avoid re-fetching on navigation
2. **`next/image`**: Migrate raw `<img>` tags to `next/image` for WebP/AVIF and responsive sizing
3. **Server Components**: Some pages could be partially SSR'd instead of fully `"use client"`
4. **CSS Modules**: The 48KB inline `style={{}}` objects in `youtube/page.js` could be moved to CSS
5. **Song table pagination**: `artist/[id]/page.js` renders all songs without pagination
