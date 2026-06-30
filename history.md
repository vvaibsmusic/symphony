# Symphony Dashboard — Performance Audit & Work History

## ✅ Completed Work

### 1. Database Infrastructure
- **Turso Migration:** Migrated all 137,578 `play_snapshots`, 6,518 `songs`, and 85 `viral_alerts` to remote Turso cloud database.
- **Connection Pooling:** Global persistent connection in `collector/db.py` with:
  - **Auto-reconnect:** If idle >30s, runs `SELECT 1` health check; if stale, transparently reconnects
  - **Thread safety:** `threading.Lock` protects connection creation/health check from concurrent uvicorn worker threads
  - **Graceful no-op close:** `conn.close()` is a no-op so pooled connection survives across requests
- **6 Composite Indexes** auto-created once per process via `ensure_indexes()` with `_INDEXES_CREATED` flag:
  - `play_snapshots(song_id, platform, collected_at DESC)`
  - `songs(artist_id, platform)`
  - `viral_alerts(platform)`
  - `artists(spotify_id)`
  - `play_snapshots(platform, song_id)`
  - `artists(is_watched)`

### 2. Backend Query Optimization (api/main.py)
Every correlated subquery pattern has been eliminated:
- **YouTube Artists** (`GET /api/artists`): Uses CTEs ✅
- **Spotify Artists** (`GET /api/spotify/artists`): Rewrote 4 correlated subqueries → CTE with `song_stats`
- **Artist Detail** (`GET /api/artist/{id}`): Rewrote 7 correlated subqueries per song → **scoped** `artist_song_ids` + `latest_snaps` + `first_snaps` CTEs (scans only the artist's ~30 songs, not all 137K snapshots)
- **Spotify Artist Detail** (`GET /api/spotify/artist/{id}`): Same scoped CTE pattern
- **Watchlist Releases** (`GET /api/watchlist/releases`): Merged 2 queries → single CTE + Python split
- **Spotify Releases** (`GET /api/spotify/releases`): Same CTE merge pattern
- **YouTube Viral** (`GET /api/youtube/viral`): N+1 loop → `enrich_viral_alerts_bulk` (1 query)
- **Spotify Viral** (`GET /api/spotify/viral`): Same bulk enrichment
- **Stats** (`GET /api/stats`): 7 queries → 2 queries + **cached 60s via `ttl_cache`**
- **Filters** (`GET /api/filters`): **Cached 300s via `ttl_cache`** (genres/regions rarely change)
- **Global Search** (`GET /api/search/global`): Correlated subqueries → CTE/JOIN
- **Spotify Search** (`GET /api/spotify/search/global`): Same CTE/JOIN approach

### 3. Backend Metrics (api/metrics.py)
- **`compute_artist_metrics`**: Loop of 10 queries → single `GROUP BY ps.cycle_id`
- **`_compute_artist_metrics_legacy`**: Full-table-scan → artist-scoped CTE
- **`enrich_viral_alerts_bulk`**: Bulk fetch via window functions

### 4. Caching Layer (api/cache.py)
- Thread-safe in-memory TTL cache decorator
- Applied to `stats` (60s TTL) and `filters` (300s TTL)
- `invalidate_cache()` called after: watch toggle, artist deletion

### 5. Edge Case Fixes
- **`is_watched` comparison**: Uses `int(artist["is_watched"] or 0)` to safely handle string/NULL/int from Turso
- **`ensure_indexes()` run-once**: `_INDEXES_CREATED` flag prevents re-running 6 CREATE INDEX statements on every import
- **Test files removed**: `test_db.py`, `test_perf.py`, `test_perf_artist.py` deleted + added to `.gitignore`

### 6. Frontend Fixes
- `toggleWatch` no longer re-fetches all 6 endpoints (only re-fetches artists)
- `setInterval` polling has proper error handling + cleanup
- Artist leaderboard images have `loading="lazy"`
- Removed duplicate Inter font `@import` in `globals.css`

---

## 📋 Remaining Frontend Optimization (Lower Priority)
These won't dramatically affect perceived load time now that backend is fast:

1. **Client-side caching**: Consider SWR or React Query to avoid re-fetching on navigation
2. **`next/image`**: Migrate raw `<img>` tags for WebP/AVIF + responsive sizing
3. **Server Components**: Some pages could be partially SSR'd instead of fully `"use client"`
4. **CSS Modules**: 48KB inline `style={{}}` in `youtube/page.js` should be CSS classes
5. **Song table pagination**: `artist/[id]/page.js` renders all songs without pagination
