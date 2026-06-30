"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { formatDate, formatDateTime } from "../../utils/dateFormat";

const API = process.env.NEXT_PUBLIC_API_URL || "";

function formatNumber(num) {
    if (!num && num !== 0) return "—";
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + "B";
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
    return num.toLocaleString();
}

const SORT_OPTIONS = [
    { value: "name", label: "Name", defaultDir: "asc" },
    { value: "songs", label: "Songs", defaultDir: "desc" },
    { value: "views", label: "Views", defaultDir: "desc" },
    { value: "genre", label: "Genre", defaultDir: "asc" },
    { value: "region", label: "Region", defaultDir: "asc" },
    { value: "recency", label: "Latest Release", defaultDir: "desc" },
];

/* ── Multi‑select Dropdown ── */
function MultiSelect({ label, options, selected, onChange }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const toggle = (val) => {
        const next = selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val];
        onChange(next);
    };

    return (
        <div ref={ref} style={{ position: "relative" }}>
            <button
                onClick={() => setOpen(!open)}
                style={{
                    padding: "7px 12px", background: "var(--bg-secondary)",
                    border: selected.length ? "1px solid var(--yt-red)" : "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-sm)", color: selected.length ? "var(--text-primary)" : "var(--text-muted)",
                    fontSize: "0.82rem", fontFamily: "Inter, sans-serif", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
                }}
            >
                {selected.length ? `${label} (${selected.length})` : label}
                <span style={{ fontSize: "0.6rem", marginLeft: 2 }}>{open ? "▲" : "▼"}</span>
            </button>
            {open && (
                <div style={{
                    position: "absolute", top: "110%", left: 0, zIndex: 50,
                    background: "var(--bg-card)", border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-sm)", maxHeight: 260, overflowY: "auto",
                    minWidth: 200, boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                }}>
                    {selected.length > 0 && (
                        <button onClick={() => onChange([])} style={{
                            width: "100%", padding: "6px 12px", background: "transparent",
                            border: "none", borderBottom: "1px solid var(--border-subtle)",
                            color: "var(--text-muted)", fontSize: "0.78rem", cursor: "pointer",
                            fontFamily: "Inter, sans-serif", textAlign: "left",
                        }}>✕ Clear all</button>
                    )}
                    {options.map(opt => (
                        <label key={opt} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "6px 12px", cursor: "pointer", fontSize: "0.82rem",
                            color: "var(--text-primary)",
                            background: selected.includes(opt) ? "rgba(255,0,0,0.08)" : "transparent",
                        }}>
                            <input
                                type="checkbox" checked={selected.includes(opt)}
                                onChange={() => toggle(opt)}
                                style={{ accentColor: "var(--yt-red)" }}
                            />
                            {opt}
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function YouTubeDashboardClient({ initialDashboard, initialArtists }) {
    const [artists, setArtists] = useState(initialArtists?.artists || []);
    const [stats, setStats] = useState(initialDashboard?.stats || null);
    const [viral, setViral] = useState(initialDashboard?.viral?.viral || []);
    const [releases, setReleases] = useState(initialDashboard?.releases || { watched: [], other: [] });
    const [filterOptions, setFilterOptions] = useState(initialDashboard?.filters || { genres: [], regions: [] });
    const [search, setSearch] = useState("");
    const [genres, setGenres] = useState([]);
    const [regions, setRegions] = useState([]);
    const [sortBy, setSortBy] = useState("views");
    const [sortDir, setSortDir] = useState("desc");
    const [watchedOnly, setWatchedOnly] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(initialArtists?.pages || 1);
    const [total, setTotal] = useState(initialArtists?.total || 0);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [addUrl, setAddUrl] = useState("");
    const [addingArtist, setAddingArtist] = useState(false);
    const [addMsg, setAddMsg] = useState(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [quota, setQuota] = useState(initialDashboard?.quota || null);
    const [globalQ, setGlobalQ] = useState("");
    const [globalResults, setGlobalResults] = useState(null);
    const globalRef = useRef(null);
    const debounceRef = useRef(null);

    // Close global search on outside click
    useEffect(() => {
        const handler = (e) => { if (globalRef.current && !globalRef.current.contains(e.target)) setGlobalResults(null); };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const handleGlobalSearch = (val) => {
        setGlobalQ(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!val.trim()) { setGlobalResults(null); return; }
        debounceRef.current = setTimeout(async () => {
            try {
                const res = await fetch(`${API}/api/search/global?q=${encodeURIComponent(val)}`).then(r => r.json());
                setGlobalResults(res);
            } catch { setGlobalResults(null); }
        }, 300);
    };

    const fetchData = useCallback(async () => {
        try {
            const dashboard = await fetch(`${API}/api/dashboard`).then(r => r.json());
            setViral(dashboard.viral?.viral || []);
            setReleases(dashboard.releases || { watched: [], other: [] });
            setStats(dashboard.stats);
            setFilterOptions(dashboard.filters);
            if (dashboard.quota) setQuota(dashboard.quota);
        } catch (e) { console.error("Failed to fetch data:", e); }
    }, []);

    const fetchArtists = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page, limit: 50, sort_by: sortBy, sort_dir: sortDir,
            });
            if (search) params.set("search", search);
            if (genres.length) params.set("genre", genres.join(","));
            if (regions.length) params.set("region", regions.join(","));
            if (watchedOnly) params.set("watched_only", "true");
            const res = await fetch(`${API}/api/artists?${params}`).then(r => r.json());
            setArtists(res.artists || []);
            setTotalPages(res.pages || 1);
            setTotal(res.total || 0);
        } catch (e) { console.error("Failed to fetch artists:", e); }
        setLoading(false);
    }, [page, search, genres, regions, sortBy, sortDir, watchedOnly]);

    const isFirstMount = useRef(true);
    useEffect(() => { 
        if (isFirstMount.current) {
            isFirstMount.current = false;
            return;
        }
        fetchArtists(); 
    }, [fetchArtists]);

    const toggleWatch = async (artistId) => {
        try {
            await fetch(`${API}/api/artist/${artistId}/watch`, { method: "POST" });
            fetchArtists();
        } catch (e) { console.error(e); }
    };

    const handleRefresh = async (type) => {
        setRefreshing(type);
        try {
            await fetch(`${API}/api/refresh/${type}`, { method: "POST" });
            const poll = setInterval(async () => {
                try {
                    const res = await fetch(`${API}/api/refresh/status`).then(r => r.json());
                    if (!res.running) {
                        clearInterval(poll); setRefreshing(false);
                        fetchData(); fetchArtists();
                        if (type === "stats") fetch(`${API}/api/quota`).then(r => r.json()).then(q => setQuota(q)).catch(() => { });
                    }
                } catch { clearInterval(poll); setRefreshing(false); }
            }, 5000);
        } catch (e) { console.error(e); setRefreshing(false); }
    };

    const handleAddArtist = async () => {
        if (!addUrl.trim()) return;
        setAddingArtist(true); setAddMsg(null);
        try {
            const res = await fetch(`${API}/api/artist/add-by-url`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: addUrl.trim() }),
            });
            const data = await res.json();
            if (!res.ok) { setAddMsg(`❌ ${data.detail || "Failed to add artist"}`); }
            else if (data.status === "exists") {
                const platform = data.platform === "spotify" ? "🎧" : "▶";
                setAddMsg(`${platform} "${data.artist.name}" already exists. Refreshing songs...`);
            } else {
                const platform = data.platform === "spotify" ? "🎧" : "▶";
                setAddMsg(`✅ ${platform} Added "${data.artist.name}". Songs loading...`);
                setAddUrl("");
                setTimeout(() => { fetchArtists(); fetchData(); }, 3000);
                setTimeout(() => { setAddMsg(null); setShowAddForm(false); }, 5000);
            }
        } catch { setAddMsg("❌ Error adding artist"); }
        setAddingArtist(false);
    };

    const deleteArtist = async (artistId, artistName) => {
        if (!confirm(`Delete "${artistName}" and all their songs? This cannot be undone.`)) return;
        try {
            const res = await fetch(`${API}/api/artist/${artistId}`, { method: "DELETE" });
            if (res.ok) { fetchArtists(); fetchData(); }
        } catch (e) { console.error(e); }
    };

    const handleSort = (value) => {
        if (sortBy === value) { setSortDir(d => d === "asc" ? "desc" : "asc"); }
        else { const opt = SORT_OPTIONS.find(o => o.value === value); setSortBy(value); setSortDir(opt?.defaultDir || "asc"); }
        setPage(1);
    };

    const clearFilters = () => {
        setSearch(""); setGenres([]); setRegions([]); setWatchedOnly(false);
        setSortBy("views"); setSortDir("desc"); setPage(1);
    };

    const hasActiveFilters = search || genres.length || regions.length || watchedOnly || sortBy !== "views";
    const inputStyle = {
        padding: "8px 14px", background: "var(--bg-secondary)",
        border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)",
        color: "var(--text-primary)", fontSize: "0.85rem",
        fontFamily: "Inter, sans-serif", outline: "none",
    };

    return (
        <div className="page">
            {/* Header */}
            <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
                <div style={{ flex: 1, minWidth: 320 }}>
                    <h1 className="page-title">
                        <span style={{ color: "var(--yt-red)" }}>▶</span> <span className="symphony-brand" style={{ fontSize: "1.8rem" }}>symphony</span> <span style={{ fontSize: "0.6em", color: "var(--text-muted)", fontWeight: 400, fontStyle: "normal" }}>YouTube Analytics</span>
                    </h1>
                    <p className="page-subtitle">
                        Tracking {stats?.total_artists || 0} artists • {stats?.yt_songs || 0} songs monitored
                        {stats?.last_collection?.last_run && (
                            <span style={{ marginLeft: 12, fontSize: "0.78rem", color: "var(--text-muted)" }}>
                                🕐 Last refreshed: {formatDateTime(stats.last_collection.last_run)}
                            </span>
                        )}
                    </p>

                    {/* Global Search */}
                    <div ref={globalRef} style={{ position: "relative", marginTop: 12, maxWidth: 500 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", marginBottom: 12 }}>
                            <span style={{ fontSize: "1rem" }}>🔍</span>
                            <input
                                type="text" placeholder="Search artists or songs..."
                                value={globalQ} onChange={e => handleGlobalSearch(e.target.value)}
                                style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--text-primary)", fontSize: "0.9rem", fontFamily: "Inter, sans-serif" }}
                            />
                            {globalQ && <button onClick={() => { setGlobalQ(""); setGlobalResults(null); }} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.85rem" }}>✕</button>}
                        </div>

                        <button onClick={() => setShowAddForm(!showAddForm)} style={{
                            padding: "8px 20px", borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border-subtle)", background: showAddForm ? "rgba(255,255,255,0.1)" : "var(--bg-secondary)",
                            color: "var(--text-primary)", fontSize: "0.85rem", fontWeight: 600,
                            fontFamily: "Inter, sans-serif", cursor: "pointer"
                        }}>
                            {showAddForm ? "✕ Close" : "＋ Add Artist"}
                        </button>

                        {globalResults && (
                            <div style={{ position: "absolute", top: "45px", left: 0, right: 0, zIndex: 100, background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", maxHeight: 400, overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
                                {globalResults.artists?.length > 0 && (
                                    <div>
                                        <div style={{ padding: "8px 14px", fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", borderBottom: "1px solid var(--border-subtle)" }}>Artists</div>
                                        {globalResults.artists.map(a => (
                                            <Link key={a.id} href={`/artist/${a.id}`} onClick={() => setGlobalResults(null)}>
                                                <div style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                                                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                                                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg, var(--yt-red), #ff6b6b)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.75rem", color: "white" }}>{a.name.charAt(0)}</div>
                                                    <div>
                                                        <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text-primary)" }}>{a.name}</div>
                                                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{a.genre} • {a.yt_song_count} songs • {formatNumber(a.total_yt_views)} views</div>
                                                    </div>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                                {globalResults.songs?.length > 0 && (
                                    <div>
                                        <div style={{ padding: "8px 14px", fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", borderBottom: "1px solid var(--border-subtle)" }}>Songs</div>
                                        {globalResults.songs.map(s => (
                                            <Link key={s.id} href={`/artist/${s.artist_id}`} onClick={() => setGlobalResults(null)}>
                                                <div style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                                                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                                                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                                    {s.thumbnail_url ? <img src={s.thumbnail_url} alt="" style={{ width: 36, height: 36, borderRadius: 4, objectFit: "cover" }} /> : <div style={{ width: 36, height: 36, borderRadius: 4, background: "var(--bg-secondary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", color: "var(--text-muted)" }}>▶</div>}
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                                                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{s.artist_name} • {formatNumber(s.latest_play_count)} views</div>
                                                    </div>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                                {!globalResults.artists?.length && !globalResults.songs?.length && (
                                    <div style={{ padding: "16px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>No results found</div>
                                )}
                            </div>
                        )}

                        {showAddForm && (
                            <div style={{ width: "100%", marginTop: 12, padding: "16px 20px", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)" }}>
                                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                    <div style={{ flex: 1, position: "relative" }}>
                                        <input type="text" placeholder="Paste YouTube artist URL..." value={addUrl} onChange={e => setAddUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddArtist()} style={{ ...inputStyle, width: "100%", paddingLeft: 36 }} />
                                        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: "0.9rem", opacity: 0.5 }}>🔗</span>
                                    </div>
                                    <button onClick={handleAddArtist} disabled={addingArtist || !addUrl.trim()} style={{ padding: "8px 20px", borderRadius: "var(--radius-sm)", border: "none", background: "var(--yt-red)", color: "white", fontSize: "0.85rem", fontWeight: 600, fontFamily: "Inter, sans-serif", cursor: addingArtist ? "not-allowed" : "pointer", opacity: addingArtist ? 0.6 : 1, whiteSpace: "nowrap" }}>
                                        {addingArtist ? "Resolving..." : "Add Artist"}
                                    </button>
                                </div>
                                <div style={{ marginTop: 8, fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                    Example: <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 3 }}>youtube.com/@agsyworld</code>
                                </div>
                                {addMsg && <div style={{ marginTop: 8, fontSize: "0.82rem", color: addMsg.startsWith("✅") ? "#4ade80" : addMsg.startsWith("❌") ? "#ef4444" : "var(--text-muted)" }}>{addMsg}</div>}
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-end" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button onClick={() => handleRefresh("stats")} disabled={refreshing} style={{
                            padding: "8px 16px", borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--yt-red)", background: refreshing === "stats" ? "rgba(255,0,0,0.15)" : "rgba(255,0,0,0.1)",
                            color: "var(--yt-red)", fontSize: "0.82rem", fontWeight: 600,
                            fontFamily: "Inter, sans-serif", cursor: refreshing ? "not-allowed" : "pointer",
                            display: "flex", alignItems: "center", gap: 6,
                        }}>
                            {refreshing === "stats" ? (<><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}></span> Updating stats...</>) : (<>📊 Refresh Stats</>)}
                        </button>
                        <button onClick={() => handleRefresh("discover")} disabled={refreshing} style={{
                            padding: "8px 16px", borderRadius: "var(--radius-sm)",
                            border: "1px solid #4ade80", background: refreshing === "discover" ? "rgba(74,222,128,0.15)" : "rgba(74,222,128,0.1)",
                            color: "#4ade80", fontSize: "0.82rem", fontWeight: 600,
                            fontFamily: "Inter, sans-serif", cursor: refreshing ? "not-allowed" : "pointer",
                            display: "flex", alignItems: "center", gap: 6,
                        }}>
                            {refreshing === "discover" ? (<><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}></span> Finding songs...</>) : (<>🔍 Find New Songs</>)}
                        </button>
                    </div>

                    {/* Quota Box */}
                    {quota && (
                        <div style={{
                            padding: "8px 16px", borderRadius: "var(--radius-sm)",
                            background: "var(--bg-card)", border: `1px solid ${quota.pct_used > 80 ? "#ef4444" : quota.pct_used > 50 ? "#f59e0b" : "var(--border-subtle)"}`,
                            display: "flex", alignItems: "center", gap: 12, fontSize: "0.78rem",
                            fontFamily: "Inter, sans-serif", color: "var(--text-secondary)", minWidth: 260,
                        }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
                                    <span style={{ fontWeight: 700, color: quota.pct_used > 80 ? "#ef4444" : quota.pct_used > 50 ? "#f59e0b" : "#4ade80" }}>
                                        {quota.pct_used > 80 ? "⚠️" : "📊"} API Quota
                                    </span>
                                    <span>{formatNumber(quota.remaining)} / {formatNumber(quota.daily_limit)}</span>
                                </div>
                                <div style={{ width: "100%", height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
                                    <div style={{
                                        width: `${Math.min(100, quota.pct_used)}%`, height: "100%", borderRadius: 2,
                                        background: quota.pct_used > 80 ? "#ef4444" : quota.pct_used > 50 ? "#f59e0b" : "#4ade80",
                                    }} />
                                </div>
                            </div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", lineHeight: 1.3, textAlign: "right" }}>
                                Refresh ≈ {formatNumber(quota.estimated_refresh_cost)}
                                {quota.remaining < quota.estimated_refresh_cost && (
                                    <div style={{ color: "#ef4444", fontWeight: 600, marginTop: 2 }}>⚠ Low!</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Stats */}
            {stats && (
                <div className="stats-grid">
                    <div className="stat-card yt"><div className="stat-value">{formatNumber(stats.yt_songs)}</div><div className="stat-label">Songs Tracked</div></div>
                    <div className="stat-card viral"><div className="stat-value">{stats.viral_alerts}</div><div className="stat-label">Viral Alerts</div></div>
                    <div className="stat-card"><div className="stat-value">{stats.watched_artists}</div><div className="stat-label">Watching</div></div>
                    <div className="stat-card"><div className="stat-value">{stats.total_artists}</div><div className="stat-label">Total Artists</div></div>
                </div>
            )}

            {/* Viral */}
            <div className="section">
                <div className="section-header"><h2 className="section-title"><span className="icon">🔥</span> What&apos;s Hot?</h2></div>
                {viral.length > 0 ? (
                    <div className="viral-grid">
                        {viral.map(v => (
                            <Link href={`/artist/${v.artist_id}`} key={v.alert_id}>
                                <div className="viral-card">
                                    {v.thumbnail_url ? <img src={v.thumbnail_url} alt={v.title} className="viral-thumbnail" /> : <div className="viral-thumbnail" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", color: "var(--text-muted)" }}>▶</div>}
                                    <div className="viral-info">
                                        <div className="viral-title">{v.title}</div>
                                        <div className="viral-artist">{v.artist_name}</div>
                                        <div className="viral-stats">
                                            <span className="viral-badge">🔥 {v.growth_factor}x</span>
                                            <span className="viral-views">{formatNumber(v.previous_count)} → {formatNumber(v.current_count)}</span>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                ) : (<div className="empty-state"><div className="emoji">📊</div><p>No viral alerts yet. Run the data collector to start tracking songs and detecting spikes.</p></div>)}
            </div>

            {/* What's New? */}
            <div className="section">
                <div className="section-header">
                    <h2 className="section-title"><span className="icon">🆕</span> What&apos;s New?</h2>
                    <span className="section-link">Past 7 days</span>
                </div>

                {/* Watched Artists Row */}
                {(releases.watched?.length > 0 || releases.other?.length > 0) ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                        {releases.watched?.length > 0 && (
                            <div>
                                <h3 style={{ fontSize: "1rem", color: "var(--yt-red)", marginBottom: "1rem", fontWeight: 700 }}>
                                    ♥ From Your Favourites
                                </h3>
                                <div className="release-grid">
                                    {releases.watched.map(r => (
                                        <Link href={`/artist/${r.artist_id}`} key={r.song_id}>
                                            <div className="release-card">
                                                {r.thumbnail_url ? <img src={r.thumbnail_url} alt={r.title} className="release-thumb" /> : <div className="release-thumb" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem", color: "var(--text-muted)" }}>▶</div>}
                                                <div className="release-body">
                                                    <div className="release-title">{r.title}</div>
                                                    <div className="release-artist">{r.artist_name}</div>
                                                    <div className="release-date">📅 {formatDate(r.release_date)} • {formatNumber(r.latest_play_count)} views</div>
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Other Artists Row */}
                        {releases.other?.length > 0 && (
                            <div>
                                <h3 style={{ fontSize: "1rem", color: "var(--text-secondary)", marginBottom: "1rem", fontWeight: 600 }}>
                                    All Other Artists
                                </h3>
                                <div className="release-grid">
                                    {releases.other.map(r => (
                                        <Link href={`/artist/${r.artist_id}`} key={r.song_id}>
                                            <div className="release-card">
                                                {r.thumbnail_url ? <img src={r.thumbnail_url} alt={r.title} className="release-thumb" /> : <div className="release-thumb" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem", color: "var(--text-muted)" }}>▶</div>}
                                                <div className="release-body">
                                                    <div className="release-title">{r.title}</div>
                                                    <div className="release-artist">{r.artist_name}</div>
                                                    <div className="release-date">📅 {formatDate(r.release_date)} • {formatNumber(r.latest_play_count)} views</div>
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="empty-state"><div className="emoji">👀</div><p>No new releases found in the past 7 days.</p></div>
                )}
            </div>

            {/* ─── LEADERBOARD ─── */}
            <div className="section">
                <div className="section-header">
                    <h2 className="section-title">
                        <span className="icon">🏆</span> Artist Leaderboard
                        <span style={{ fontSize: "0.8rem", fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>({total})</span>
                    </h2>
                </div>

                {/* Filter Toolbar */}
                <div style={{
                    display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "1rem",
                    alignItems: "center", padding: "12px 14px",
                    background: "var(--bg-card)", border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-lg)",
                }}>
                    {/* Search */}
                    <div className="search-bar" style={{ maxWidth: 200 }}>
                        <span className="search-icon">🔍</span>
                        <input type="text" className="search-input" placeholder="Search..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
                    </div>

                    {/* Multi-select Genre */}
                    <MultiSelect label="Genre" options={filterOptions.genres} selected={genres} onChange={v => { setGenres(v); setPage(1); }} />
                    {/* Multi-select Region */}
                    <MultiSelect label="Region" options={filterOptions.regions} selected={regions} onChange={v => { setRegions(v); setPage(1); }} />

                    {/* Favourites toggle */}
                    <button onClick={() => { setWatchedOnly(!watchedOnly); setPage(1); }} style={{
                        padding: "7px 14px", borderRadius: "var(--radius-sm)",
                        border: watchedOnly ? "1px solid #ef4444" : "1px solid var(--border-subtle)",
                        background: watchedOnly ? "rgba(239,68,68,0.15)" : "var(--bg-secondary)",
                        color: watchedOnly ? "#ef4444" : "var(--text-muted)",
                        fontSize: "0.82rem", fontWeight: 600, fontFamily: "Inter, sans-serif", cursor: "pointer",
                    }}>
                        {watchedOnly ? "♥ Favourites" : "♡ Favourites"}
                    </button>

                    <div style={{ width: 1, height: 24, background: "var(--border-subtle)", margin: "0 2px" }} />

                    {/* Sort Pills */}
                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                        {SORT_OPTIONS.map(opt => (
                            <button key={opt.value} onClick={() => handleSort(opt.value)} style={{
                                padding: "4px 10px", borderRadius: "var(--radius-sm)",
                                border: sortBy === opt.value ? "1px solid var(--yt-red)" : "1px solid var(--border-subtle)",
                                background: sortBy === opt.value ? "rgba(255,0,0,0.1)" : "var(--bg-secondary)",
                                color: sortBy === opt.value ? "var(--yt-red)" : "var(--text-secondary)",
                                fontSize: "0.75rem", fontWeight: 600, fontFamily: "Inter, sans-serif",
                                cursor: "pointer", display: "flex", alignItems: "center", gap: 2,
                            }}>
                                {opt.label}
                                {sortBy === opt.value && <span style={{ fontSize: "0.65rem" }}>{sortDir === "desc" ? "↓" : "↑"}</span>}
                            </button>
                        ))}
                    </div>

                    {hasActiveFilters && (
                        <button onClick={clearFilters} style={{
                            padding: "4px 10px", borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border-subtle)", background: "transparent",
                            color: "var(--text-muted)", fontSize: "0.75rem", fontFamily: "Inter, sans-serif",
                            cursor: "pointer", marginLeft: "auto",
                        }}>✕ Clear</button>
                    )}
                </div>

                {/* Leaderboard Table */}
                {loading ? (
                    <div className="loading"><div className="spinner"></div>Loading...</div>
                ) : artists.length === 0 ? (
                    <div className="empty-state"><div className="emoji">🔍</div><p>No artists match your filters.</p></div>
                ) : (
                    <>
                        <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "70vh", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)" }}>
                            <table style={{
                                width: "100%", borderCollapse: "separate", borderSpacing: 0,
                                fontSize: "0.85rem", fontFamily: "Inter, sans-serif",
                            }}>
                                <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                                    <tr>
                                        {["#", "Artist", "Genre", "Region", "Songs", "Total Views", "Latest Release", ""].map((h, i) => (
                                            <th key={i} style={{
                                                padding: "10px 12px", textAlign: i >= 4 ? "right" : "left",
                                                fontWeight: 600, color: "var(--text-muted)", fontSize: "0.75rem",
                                                textTransform: "uppercase", letterSpacing: "0.04em",
                                                borderBottom: "1px solid var(--border-subtle)",
                                                background: "var(--bg-secondary)",
                                                whiteSpace: "nowrap",
                                            }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {artists.map((a, idx) => {
                                        const rank = (page - 1) * 50 + idx + 1;
                                        return (
                                            <tr key={a.id} style={{
                                                borderBottom: "1px solid var(--border-subtle)",
                                                transition: "background 0.12s ease",
                                            }}
                                                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                                                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                                            >
                                                {/* Rank */}
                                                <td style={{
                                                    padding: "10px 12px", fontWeight: 700, width: 40,
                                                    color: rank <= 3 ? "var(--yt-red)" : "var(--text-muted)",
                                                    fontSize: rank <= 3 ? "1rem" : "0.85rem",
                                                }}>
                                                    {rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] : rank}
                                                </td>

                                                {/* Artist name + avatar */}
                                                <td style={{ padding: "10px 12px" }}>
                                                    <Link href={`/artist/${a.id}`} style={{
                                                        display: "flex", alignItems: "center", gap: 10,
                                                        textDecoration: "none", color: "var(--text-primary)",
                                                    }}>
                                                        {a.image_url ? (
                                                            <img
                                                                src={a.image_url}
                                                                alt={a.name}
                                                                loading="lazy"
                                                                style={{
                                                                    width: 36, height: 36, borderRadius: "50%",
                                                                    objectFit: "cover", flexShrink: 0
                                                                }}
                                                            />
                                                        ) : (
                                                            <div style={{
                                                                width: 36, height: 36, borderRadius: "50%",
                                                                background: "linear-gradient(135deg, var(--yt-red), #ff6b6b)",
                                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                                fontWeight: 700, fontSize: "0.85rem", color: "white", flexShrink: 0,
                                                            }}>
                                                                {a.name.charAt(0)}
                                                            </div>
                                                        )}
                                                        <span style={{ fontWeight: 600 }}>{a.name}</span>
                                                    </Link>
                                                </td>

                                                {/* Genre */}
                                                <td style={{ padding: "10px 12px" }}>
                                                    <span style={{
                                                        padding: "2px 8px", borderRadius: "12px", fontSize: "0.72rem",
                                                        background: "rgba(255,255,255,0.06)", color: "var(--text-secondary)",
                                                    }}>{a.genre || "—"}</span>
                                                </td>

                                                {/* Region */}
                                                <td style={{ padding: "10px 12px", color: "var(--text-secondary)", fontSize: "0.82rem" }}>
                                                    {a.region ? `📍 ${a.region}` : "—"}
                                                </td>

                                                {/* Songs */}
                                                <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-primary)" }}>
                                                    {a.yt_song_count || 0}
                                                </td>

                                                {/* Views */}
                                                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: a.total_yt_views ? "var(--text-primary)" : "var(--text-muted)" }}>
                                                    {a.total_yt_views ? formatNumber(a.total_yt_views) : "—"}
                                                </td>

                                                {/* Latest Release */}
                                                <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                                                    {formatDate(a.latest_release)}
                                                </td>

                                                {/* Watch + Delete */}
                                                <td style={{ padding: "10px 6px", width: 70, whiteSpace: "nowrap" }}>
                                                    <button onClick={(e) => { e.preventDefault(); toggleWatch(a.id); }} style={{
                                                        background: "none", border: "none",
                                                        color: a.is_watched ? "#ef4444" : "var(--text-muted)",
                                                        fontSize: "1.1rem", cursor: "pointer", padding: "2px 4px",
                                                        transition: "transform 0.15s ease",
                                                    }}
                                                        onMouseEnter={e => e.currentTarget.style.transform = "scale(1.2)"}
                                                        onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                                                        title={a.is_watched ? "Unwatch" : "Watch"}>
                                                        {a.is_watched ? "♥" : "♡"}
                                                    </button>
                                                    <button onClick={(e) => { e.preventDefault(); deleteArtist(a.id, a.name); }} style={{
                                                        background: "none", border: "none",
                                                        color: "var(--text-muted)",
                                                        fontSize: "0.9rem", cursor: "pointer", padding: "2px 4px",
                                                        transition: "all 0.15s ease", opacity: 0.4,
                                                    }}
                                                        onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "#ef4444"; }}
                                                        onMouseLeave={e => { e.currentTarget.style.opacity = "0.4"; e.currentTarget.style.color = "var(--text-muted)"; }}
                                                        title="Remove artist">
                                                        🗑
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {totalPages > 1 && (
                            <div className="pagination">
                                <button disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
                                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                                    const p = i + 1;
                                    return <button key={p} className={p === page ? "active" : ""} onClick={() => setPage(p)}>{p}</button>;
                                })}
                                {totalPages > 7 && <span style={{ color: "var(--text-muted)" }}>...</span>}
                                <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next →</button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
