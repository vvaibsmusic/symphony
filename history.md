# Symphony Dashboard - Performance Audit & Work History

## Completed Work

### Database & Migration
- **Turso Migration:** Successfully migrated all 137,578 `play_snapshots` to the remote Turso database.
- **Connection Pooling:** Added a global connection pool in `collector/db.py` to keep the Turso connection alive. This eliminated the ~400ms TLS handshake latency on every single API request, dropping query times to ~50ms.

### Frontend Immediate Fixes (`frontend/src/app/youtube/page.js`)
- Fixed `toggleWatch` to only re-fetch artists instead of all 6 data endpoints.
- Added proper `clearInterval` cleanup to the `setInterval` polling in `handleRefresh`.
- Added `loading="lazy"` to the artist avatars in the leaderboard table to reduce initial load weight (50 images per page).

---

## Pending Work (Required Fixes)

A full-stack performance audit was completed. The following critical issues were identified and still need to be implemented. (Subagents were attempting to fix these but hit quota limits).

### 1. Backend: Missing Indexes & Caching
- **Create `api/cache.py`**: Needs a simple in-memory `ttl_cache` decorator to cache expensive API responses.
- **Update `collector/db.py`**: Needs an `ensure_indexes()` function to create critical missing indexes on Turso:
  - `play_snapshots(song_id, platform, collected_at DESC)`
  - `songs(artist_id, platform)`
  - `viral_alerts(platform)`
  - `artists(spotify_id)`
  - `play_snapshots(platform, song_id)`

### 2. Backend: `api/metrics.py` (N+1 & Loops)
- **`compute_artist_metrics` (L227-244)**: Replace the loop that executes a query per `cycle_id` with a single query using `GROUP BY ps.cycle_id`.
- **`_compute_artist_metrics_legacy` (L292-301)**: Fix the subquery `ps.id IN (SELECT MAX(id) FROM play_snapshots WHERE platform = ? GROUP BY song_id)` which currently performs a full table scan. Wrap it in a CTE scoped specifically to the `artist_id`.
- **`enrich_viral_alerts_bulk`**: Create a new bulk enrichment function (similar to `enrich_songs_bulk`) to prevent N+1 queries when fetching viral alerts.

### 3. Backend: `api/main.py` (Correlated Subqueries)
Currently, many endpoints use correlated subqueries (`SELECT` inside `SELECT`) which run per row. These need to be rewritten using CTEs (Common Table Expressions) like `WITH latest_snaps AS (...)`:
- **Viral Endpoints (L696, L731)**: Update to use the new `enrich_viral_alerts_bulk` function.
- **Watchlist Releases (L744-768)**: Replace separate watched/other queries with a single CTE query.
- **Spotify Releases (L784-808)**: Replace separate watched/other queries with a single CTE query.
- **Spotify Artists (L994-1019)**: Rewrite the 4 correlated subqueries per artist row using a CTE approach (matching the YouTube `GET /api/artists` endpoint).
- **Artist Detail Songs (L1057-1082 & L1122-1135)**: This is the worst query (7 subqueries per song). Must be rewritten with `latest_snaps` and `first_snaps` CTEs.
- **Stats Endpoint (L1236-1251)**: Combine the 7 separate `COUNT(*)` queries into a single query.
- **Global Search (L1350-1373 & L1385-1415)**: Rewrite artist and song search queries to use CTEs for popularity stats instead of correlated subqueries.

### 4. Frontend Performance Debt
- **`next.config.mjs`**: Remove or fix `images: { unoptimized: true }` which disables all Next.js image optimization.
- **Duplicate Data Fetching**: `youtube/page.js` fires 6 parallel fetch calls on every mount. Needs client-side caching (like SWR or React Query) or API response caching.
- **Duplicate Fonts**: `globals.css` (L6-7) imports the Inter font twice. Also, fonts are loaded via `@import url()` instead of `next/font`.
- **Images**: Need to migrate raw `<img>` tags to `next/image` for WebP/AVIF support.
- **Rendering**: The entire app is `"use client"`. Consider moving some parts to Server Components.
- **Styles**: `youtube/page.js` has 48KB of inline `style={{}}` objects. These should be moved to CSS modules.
- **Virtualization**: The `artist/[id]/page.js` song table renders all rows at once without pagination or virtualization.
