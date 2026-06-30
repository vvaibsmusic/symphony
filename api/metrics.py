"""Advanced analytics metrics for the Music Intelligence Dashboard.

Computes Engagement, Loyalty, Listener Growth, Delta Change (bps), and
Momentum at both track and artist level for daily + weekly windows.

Uses CYCLE-BASED comparison — each collector run stamps all snapshots with
the same cycle_id, so comparisons are always between complete data sets.

Metric Definitions:
  Engagement  = (likes×1 + comments×5) / views
  Loyalty     = comments / likes
  Listener Growth = (current - previous) / previous × 100  (%)
  Delta Change = ratio_current − ratio_previous  (absolute shift)
  Momentum    = growth_rate_current − growth_rate_previous  (acceleration)
"""


# ─── Core Metric Functions ───────────────────────────────────

def compute_engagement(views, likes, comments):
    """Engagement = (likes×1 + comments×5) / views"""
    if not views or views <= 0:
        return None
    return round(float((likes or 0) + (comments or 0) * 5) / views, 6)


def compute_loyalty(likes, comments):
    """Loyalty = comments / likes"""
    if not likes or likes <= 0:
        return None
    return round(float(comments or 0) / likes, 4)


# ─── Track-Level Metrics ─────────────────────────────────────

def compute_track_metrics(snapshots):
    """Compute all metrics for a single track from its snapshot history.

    Snapshots are grouped by cycle_id. The latest cycle is compared against
    the previous cycle (daily) and the cycle ~7 positions back (weekly).

    Args:
        snapshots: list of dicts with keys: play_count, like_count,
                   comment_count, collected_at, cycle_id.
                   Ordered by collected_at DESC (most recent first).

    Returns:
        dict with current metrics, daily deltas, weekly deltas, and momentum.
    """
    if not snapshots:
        return _empty_metrics()

    # Group by cycle — each unique cycle_id is one complete collection run
    cycles = _group_by_cycle(snapshots)

    if not cycles:
        return _empty_metrics()

    current = cycles[0]  # most recent cycle
    views = current.get("play_count") or 0
    likes = current.get("like_count") or 0
    comments = current.get("comment_count") or 0

    engagement = compute_engagement(views, likes, comments)
    loyalty = compute_loyalty(likes, comments)

    # Daily = previous cycle (N-1)
    prev_daily = cycles[1] if len(cycles) >= 2 else None

    # Weekly = cycle ~7 back, or the oldest available
    prev_weekly = None
    if len(cycles) >= 7:
        prev_weekly = cycles[6]
    elif len(cycles) >= 2:
        prev_weekly = cycles[-1]  # oldest available

    result = {
        "engagement": engagement,
        "loyalty": loyalty,
        "views": views,
        "likes": likes,
        "comments": comments,
        "daily": _compute_delta(current, prev_daily),
        "weekly": _compute_delta(current, prev_weekly),
        "momentum": _compute_momentum_from_cycles(cycles),
    }

    return result


def _group_by_cycle(snapshots):
    """Aggregate snapshots by cycle_id, returning one summary per cycle.

    For tracks, each cycle has exactly one snapshot, but we handle
    the general case. Returns list sorted newest-first.

    If cycle_id is NULL (legacy data), each snapshot is its own cycle.
    """
    cycle_order = []
    cycle_data = {}

    for snap in snapshots:
        cid = snap.get("cycle_id") or snap.get("collected_at") or id(snap)
        if cid not in cycle_data:
            cycle_order.append(cid)
            cycle_data[cid] = {
                "play_count": 0, "like_count": 0, "comment_count": 0,
                "collected_at": snap.get("collected_at"), "cycle_id": cid,
            }
        cycle_data[cid]["play_count"] += snap.get("play_count") or 0
        cycle_data[cid]["like_count"] += snap.get("like_count") or 0
        cycle_data[cid]["comment_count"] += snap.get("comment_count") or 0

    return [cycle_data[cid] for cid in cycle_order]


def _empty_metrics():
    return {
        "engagement": None,
        "loyalty": None,
        "views": 0,
        "likes": 0,
        "comments": 0,
        "daily": _empty_delta(),
        "weekly": _empty_delta(),
        "momentum": None,
    }


def _empty_delta():
    return {
        "listener_growth_pct": None,
        "engagement_delta": None,
        "loyalty_delta": None,
        "view_change": None,
        "like_change": None,
        "comment_change": None,
    }


def _compute_delta(current, previous):
    """Compute delta metrics between two cycle aggregates."""
    if not previous:
        return _empty_delta()

    curr_views = current.get("play_count") or 0
    prev_views = previous.get("play_count") or 0
    curr_likes = current.get("like_count") or 0
    prev_likes = previous.get("like_count") or 0
    curr_comments = current.get("comment_count") or 0
    prev_comments = previous.get("comment_count") or 0

    # Listener growth %
    listener_growth = None
    if prev_views > 0:
        listener_growth = round(float(curr_views - prev_views) / prev_views * 100, 2)

    # Engagement delta (absolute bps shift)
    curr_engagement = compute_engagement(curr_views, curr_likes, curr_comments)
    prev_engagement = compute_engagement(prev_views, prev_likes, prev_comments)
    engagement_delta = None
    if curr_engagement is not None and prev_engagement is not None:
        engagement_delta = round(curr_engagement - prev_engagement, 6)

    # Loyalty delta (absolute shift)
    curr_loyalty = compute_loyalty(curr_likes, curr_comments)
    prev_loyalty = compute_loyalty(prev_likes, prev_comments)
    loyalty_delta = None
    if curr_loyalty is not None and prev_loyalty is not None:
        loyalty_delta = round(curr_loyalty - prev_loyalty, 4)

    return {
        "listener_growth_pct": listener_growth,
        "engagement_delta": engagement_delta,
        "loyalty_delta": loyalty_delta,
        "view_change": curr_views - prev_views,
        "like_change": curr_likes - prev_likes,
        "comment_change": curr_comments - prev_comments,
    }


def _compute_momentum_from_cycles(cycles):
    """Momentum = acceleration of growth rate across cycles.

    Compares growth between cycle[0]-cycle[1] vs cycle[1]-cycle[2].
    Positive = accelerating, Negative = decelerating.
    """
    if len(cycles) < 3:
        return None

    v0 = cycles[0].get("play_count") or 0
    v1 = cycles[1].get("play_count") or 0
    v2 = cycles[2].get("play_count") or 0

    if v1 <= 0 or v2 <= 0:
        return None

    growth_recent = float(v0 - v1) / v1 * 100
    growth_prior = float(v1 - v2) / v2 * 100
    return round(growth_recent - growth_prior, 2)


# ─── Artist-Level Aggregation ────────────────────────────────

def compute_artist_metrics(conn, artist_id, platform="youtube"):
    """Compute aggregated metrics for an artist using cycle-based comparison.

    Gets the latest N distinct cycle_ids and aggregates per cycle.
    """
    # Get distinct cycles for this artist's songs, most recent first
    cycles_rows = conn.execute("""
        SELECT DISTINCT ps.cycle_id, MAX(ps.collected_at) as cycle_time
        FROM play_snapshots ps
        JOIN songs s ON ps.song_id = s.id
        WHERE s.artist_id = ? AND ps.platform = ? AND ps.cycle_id IS NOT NULL
        GROUP BY ps.cycle_id
        ORDER BY cycle_time DESC
        LIMIT 10
    """, (artist_id, platform)).fetchall()

    cycle_ids = [r["cycle_id"] for r in cycles_rows]

    if not cycle_ids:
        # Fallback: use legacy (no cycle_id) — get latest snapshot per song
        return _compute_artist_metrics_legacy(conn, artist_id, platform)

    # Aggregate each cycle
    cycles = []
    for cid in cycle_ids:
        row = conn.execute("""
            SELECT
                COALESCE(SUM(ps.play_count), 0) as play_count,
                COALESCE(SUM(ps.like_count), 0) as like_count,
                COALESCE(SUM(ps.comment_count), 0) as comment_count
            FROM play_snapshots ps
            JOIN songs s ON ps.song_id = s.id
            WHERE s.artist_id = ? AND ps.platform = ? AND ps.cycle_id = ?
        """, (artist_id, platform, cid)).fetchone()
        cycles.append({
            "play_count": row["play_count"],
            "like_count": row["like_count"],
            "comment_count": row["comment_count"],
            "cycle_id": cid,
        })

    current = cycles[0]
    views = current["play_count"] or 0
    likes = current["like_count"] or 0
    comments = current["comment_count"] or 0

    engagement = compute_engagement(views, likes, comments)
    loyalty = compute_loyalty(likes, comments)

    prev_daily = cycles[1] if len(cycles) >= 2 else None
    prev_weekly = cycles[6] if len(cycles) >= 7 else (cycles[-1] if len(cycles) >= 2 else None)

    daily = _compute_delta(current, prev_daily)
    weekly = _compute_delta(current, prev_weekly)
    momentum = _compute_momentum_from_cycles(cycles)

    # Health flag based on daily listener growth
    health = None
    lg = daily.get("listener_growth_pct")
    if lg is not None:
        if lg >= 80:
            health = "viral_breakout"
        elif lg >= 20:
            health = "healthy"
        elif lg >= 5:
            health = "moderate"
        elif lg >= 0:
            health = "stable"
        else:
            health = "declining"

    return {
        "engagement": engagement,
        "loyalty": loyalty,
        "total_views": views,
        "total_likes": likes,
        "total_comments": comments,
        "daily": daily,
        "weekly": weekly,
        "momentum": momentum,
        "health": health,
        "cycles_available": len(cycles),
    }


def _compute_artist_metrics_legacy(conn, artist_id, platform):
    """Fallback for data without cycle_ids — uses latest snapshot per song."""
    latest = conn.execute("""
        SELECT
            COALESCE(SUM(ps.play_count), 0) as total_views,
            COALESCE(SUM(ps.like_count), 0) as total_likes,
            COALESCE(SUM(ps.comment_count), 0) as total_comments
        FROM play_snapshots ps
        JOIN songs s ON ps.song_id = s.id
        WHERE s.artist_id = ? AND ps.platform = ?
          AND ps.id IN (SELECT MAX(id) FROM play_snapshots WHERE platform = ? GROUP BY song_id)
    """, (artist_id, platform, platform)).fetchone()

    if not latest:
        return _empty_metrics()

    views = latest["total_views"] or 0
    likes = latest["total_likes"] or 0
    comments = latest["total_comments"] or 0

    return {
        "engagement": compute_engagement(views, likes, comments),
        "loyalty": compute_loyalty(likes, comments),
        "total_views": views,
        "total_likes": likes,
        "total_comments": comments,
        "daily": _empty_delta(),
        "weekly": _empty_delta(),
        "momentum": None,
        "health": None,
        "cycles_available": 0,
    }


# ─── Song Enrichment Helper ─────────────────────────────────

def enrich_song_with_metrics(conn, song_dict, platform="youtube"):
    """Add metrics to a song dict by fetching its snapshot history."""
    song_id = song_dict.get("id")
    if not song_id:
        song_dict["metrics"] = _empty_metrics()
        return song_dict

    snapshots = conn.execute("""
        SELECT play_count, like_count, comment_count, collected_at, cycle_id
        FROM play_snapshots
        WHERE song_id = ? AND platform = ?
        ORDER BY collected_at DESC
        LIMIT 30
    """, (song_id, platform)).fetchall()

    song_dict["metrics"] = compute_track_metrics(
        [dict(s) for s in snapshots]
    )
    return song_dict


def enrich_viral_alert(conn, alert_dict):
    """Add engagement/loyalty deltas to a viral alert."""
    song_id = alert_dict.get("song_id")
    platform = alert_dict.get("platform", "youtube")

    if not song_id:
        alert_dict["engagement_delta"] = None
        alert_dict["loyalty_delta"] = None
        alert_dict["momentum"] = None
        return alert_dict

    snapshots = conn.execute("""
        SELECT play_count, like_count, comment_count, collected_at, cycle_id
        FROM play_snapshots
        WHERE song_id = ? AND platform = ?
        ORDER BY collected_at DESC
        LIMIT 10
    """, (song_id, platform)).fetchall()

    snaps = [dict(s) for s in snapshots]
    cycles = _group_by_cycle(snaps)

    if len(cycles) >= 2:
        delta = _compute_delta(cycles[0], cycles[1])
        alert_dict["engagement_delta"] = delta.get("engagement_delta")
        alert_dict["loyalty_delta"] = delta.get("loyalty_delta")
    else:
        alert_dict["engagement_delta"] = None
        alert_dict["loyalty_delta"] = None

    alert_dict["momentum"] = _compute_momentum_from_cycles(cycles)
    return alert_dict
