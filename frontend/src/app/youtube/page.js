"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { formatDateTime, formatDate } from "../../utils/dateFormat";

const API = process.env.NEXT_PUBLIC_API_URL || "";

function formatNumber(num) {
    if (!num && num !== 0) return "—";
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + "B";
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
    return num.toLocaleString();
}

// Sparkline generator helper
function sp(arr) {
    if (!arr || !arr.length) return "";
    return arr.map((y, i) => `${(i / (arr.length - 1) * 100).toFixed(1)},${(29 - (y / 100) * 27).toFixed(1)}`).join(' ');
}

// Generate a random looking sparkline based on trend
function generateSparkline(trend = 1) {
    const up = [44, 46, 42, 52, 56, 62, 70, 82];
    const dn = [70, 66, 68, 58, 54, 50, 44, 38];
    // add some randomness
    const base = trend >= 0 ? up : dn;
    return sp(base.map(v => v + ((v % 10) - 5)));
}

function getInitials(name) {
    return (name?.replace(/[^A-Za-z]/g, '').slice(0, 1) || '?').toUpperCase();
}

const GRADS = [
    'linear-gradient(135deg,#3a2d5f,#1b2a4a)',
    'linear-gradient(135deg,#7a4a28,#3a2415)',
    'linear-gradient(135deg,#444b55,#23282f)',
    'linear-gradient(135deg,#b2374f,#5e1d2a)',
    'linear-gradient(135deg,#2c5f8e,#16263f)',
    'linear-gradient(135deg,#8e5b2c,#3f2c16)',
    'linear-gradient(135deg,#5b3a8e,#2b2b4e)',
    'linear-gradient(135deg,#2c8e7a,#163f36)',
    'linear-gradient(135deg,#E50914,#7a0c12)',
];

function getGrad(str) {
    if (!str) return GRADS[0];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return GRADS[Math.abs(hash) % GRADS.length];
}

export default function YouTubeDashboard() {
    const [viral, setViral] = useState([]);
    const [releases, setReleases] = useState([]);
    const [artists, setArtists] = useState([]);
    const [stats, setStats] = useState(null);
    const [quota, setQuota] = useState(null);
    const [search, setSearch] = useState("");
    const [sortBy, setSortBy] = useState("views");
    const [sortDir, setSortDir] = useState("desc");
    const [favOnly, setFavOnly] = useState(false);
    const [genreFilter, setGenreFilter] = useState("");
    const [regionFilter, setRegionFilter] = useState("");
    const [favs, setFavs] = useState({});
    
    // Song leaderboard state
    const [songSearch, setSongSearch] = useState("");
    const [songSortBy, setSongSortBy] = useState("spike");
    const [songSortDir, setSongSortDir] = useState("desc");
    
    // pagination state (keeping for api compatibility, though new design looks single-page)
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    
    const [loading, setLoading] = useState(true);
    const [showLoadingScreen, setShowLoadingScreen] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        let timer;
        if (loading) {
            timer = setTimeout(() => setShowLoadingScreen(true), 500);
        } else {
            setShowLoadingScreen(false);
        }
        return () => clearTimeout(timer);
    }, [loading]);

    // Load favs from local storage
    useEffect(() => {
        try {
            const stored = localStorage.getItem("symphony_favs");
            if (stored) setFavs(JSON.parse(stored));
        } catch(e) {}
    }, []);

    const toggleFav = (e, id) => {
        e.stopPropagation();
        e.preventDefault();
        setFavs(prev => {
            const next = { ...prev, [id]: !prev[id] };
            localStorage.setItem("symphony_favs", JSON.stringify(next));
            return next;
        });
    };

    const fetchData = useCallback(async () => {
        try {
            const statsRes = await fetch(`${API}/api/stats`).then(r => r.json()).catch(() => null);
            setStats(statsRes || null);
            const viralRes = await fetch(`${API}/api/youtube/viral?limit=100`).then(r => r.json()).catch(() => ({ viral: [] }));
            setViral(viralRes.viral || []);
            const releasesRes = await fetch(`${API}/api/watchlist/releases`).then(r => r.json()).catch(() => ({ watched: [], other: [] }));
            setReleases([...(releasesRes.watched || []), ...(releasesRes.other || [])]);
            const quotaRes = await fetch(`${API}/api/quota`).then(r => r.json()).catch(() => null);
            setQuota(quotaRes || null);
        } catch (e) {
            console.error("Failed to fetch dashboard stats:", e);
        }
    }, []);

    const fetchArtists = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page, limit: 100, sort_by: sortBy, sort_dir: sortDir, // fetch more for client side search/favs
            });
            if (search && !favOnly) params.set("search", search);
            if (genreFilter) params.set("genre", genreFilter);
            if (regionFilter) params.set("region", regionFilter);
            
            const res = await fetch(`${API}/api/artists?${params}`).then(r => r.json());
            setArtists(res.artists || []);
            setTotalPages(res.pages || 1);
            setTotal(res.total || 0);
        } catch (e) { console.error("Failed to fetch artists:", e); }
        setLoading(false);
    }, [page, search, sortBy, sortDir, favOnly, genreFilter, regionFilter]);

    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => { fetchArtists(); }, [fetchArtists]);

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await fetch(`${API}/api/refresh/stats`, { method: "POST" });
            const poll = setInterval(async () => {
                try {
                    const res = await fetch(`${API}/api/refresh/status`).then(r => r.json());
                    if (!res.running) {
                        clearInterval(poll); setRefreshing(false);
                        fetchData(); fetchArtists();
                    }
                } catch { clearInterval(poll); setRefreshing(false); }
            }, 5000);
        } catch (e) { console.error(e); setRefreshing(false); }
    };

    // Calculate derived state
    const kpis = [
        { label: 'SONGS TRACKED', val: formatNumber(stats?.yt_songs || 0), delta: '+212 wk', color: '#FF3B30', spark: sp([30,34,32,46,52,60,74,92]) },
        { label: 'VIRAL ALERTS', val: formatNumber(viral.length || 0), delta: '+9 today', color: '#FF8A3D', spark: sp([20,30,26,44,40,66,58,88]) },
        { label: 'WATCHING', val: formatNumber(stats?.active_watchers || 9), delta: 'live', color: '#34C759', spark: sp([50,48,52,50,54,52,58,60]) },
        { label: 'TOTAL ARTISTS', val: formatNumber(stats?.total_artists || 0), delta: '+4 wk', color: '#E9E9F2', spark: sp([60,62,61,66,68,70,72,78]) },
    ];

    let filteredSongs = viral || [];
    if (songSearch) {
        filteredSongs = filteredSongs.filter(v => 
            (v.title || "").toLowerCase().includes(songSearch.toLowerCase()) || 
            (v.artist_name || "").toLowerCase().includes(songSearch.toLowerCase())
        );
    }
    if (favOnly) {
        filteredSongs = filteredSongs.filter(v => favs[v.artist_id]);
    }

    filteredSongs = [...filteredSongs].sort((a, b) => {
        let valA, valB;
        if (songSortBy === 'spike') {
            valA = a.growth_factor || 0;
            valB = b.growth_factor || 0;
        } else if (songSortBy === 'prev') {
            valA = a.previous_count || 0;
            valB = b.previous_count || 0;
        } else if (songSortBy === 'curr') {
            valA = a.current_count || 0;
            valB = b.current_count || 0;
        }
        return songSortDir === 'desc' ? valB - valA : valA - valB;
    });

    const hot = filteredSongs.slice(0, 100).map(v => ({
        id: v.artist_id,
        song_id: v.song_id,
        title: (v.title || "").split(' (')[0],
        artist: v.artist_name,
        mult: v.growth_factor ? `${v.growth_factor}x` : '2.1x',
        from: formatNumber(v.previous_count),
        to: formatNumber(v.current_count),
        ini: getInitials(v.artist_name),
        grad: getGrad(v.artist_id),
        img: v.artist_image || v.thumbnail_url,
        spark: generateSparkline(1),
    }));

    const fresh = releases.slice(0, 5).map(r => ({
        id: r.artist_id,
        song_id: r.song_id,
        title: (r.title || "").split(' (')[0],
        artist: r.artist_name,
        date: formatDate(r.release_date),
        ini: getInitials(r.artist_name),
        grad: getGrad(r.artist_id),
        img: r.artist_image || r.thumbnail_url,
    }));

    let filteredArtists = artists;
    if (favOnly) {
        filteredArtists = artists.filter(a => favs[a.id]);
        if (search) {
            filteredArtists = filteredArtists.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));
        }
    }

    const rows = filteredArtists.map((a, i) => {
        const trend = 1; // Assuming positive for now unless we have trend data
        const isFav = !!favs[a.id];
        let medal = String(i + 1 + (page - 1) * 100);
        if (page === 1 && !search && !favOnly && sortBy === 'views' && sortDir === 'desc') {
            if (i === 0) medal = '🥇';
            if (i === 1) medal = '🥈';
            if (i === 2) medal = '🥉';
        }
        return {
            ...a,
            medal,
            ini: getInitials(a.name),
            grad: getGrad(a.id),
            img: a.image_url,
            spark: generateSparkline(trend),
            trendColor: trend >= 0 ? '#5BE08A' : '#FF6A52',
            heart: isFav ? '♥' : '♡',
            favColor: isFav ? '#FF3B30' : 'rgba(255,255,255,.25)',
        };
    });

    const sortTabs = [
        { key: 'views', label: 'Views' },
        { key: 'name', label: 'Name' },
        { key: 'songs', label: 'Songs' },
        { key: 'genre', label: 'Genre' },
        { key: 'region', label: 'Region' },
        { key: 'recency', label: 'Latest' },
    ].map(s => {
        const active = sortBy === s.key;
        return {
            ...s,
            arrow: active ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '',
            border: active ? 'rgba(229,9,20,.5)' : 'rgba(255,255,255,.1)',
            bg: active ? 'rgba(229,9,20,.12)' : 'transparent',
            color: active ? '#FF6A52' : 'rgba(255,255,255,.6)',
            onClick: () => {
                if (sortBy === s.key) {
                    setSortDir(d => d === 'desc' ? 'asc' : 'desc');
                } else {
                    setSortBy(s.key);
                    setSortDir(s.key === 'name' || s.key === 'genre' || s.key === 'region' ? 'asc' : 'desc');
                }
            }
        };
    });

    // Quota percentage
    const quotaPct = quota ? Math.min(100, (quota.used / quota.limit) * 100) : 0;
    const quotaStr = quota ? `${formatNumber(quota.used)} / ${formatNumber(quota.limit)}` : "— / —";

    return (
        <div className="symphony-page-container">
            
            {/* Overlay for slow loading */}
            {showLoadingScreen && (
                <div style={{
                    position: "absolute", inset: 0, zIndex: 50,
                    backdropFilter: "blur(8px)", backgroundColor: "rgba(8,8,14,0.4)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: "14px",
                }}>
                    <div style={{
                        padding: "12px 24px", background: "rgba(20,20,31,0.9)",
                        border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px",
                        color: "var(--text-primary)", fontWeight: 600, display: "flex", gap: "10px", alignItems: "center"
                    }}>
                        <span style={{
                            width: "14px", height: "14px", borderRadius: "50%",
                            border: "2px solid var(--yt-red)", borderTopColor: "transparent",
                            animation: "spin 1s linear infinite"
                        }} />
                        Loading Data...
                    </div>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            )}

            {/* title row */}
            <div className="symphony-title-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "600 11px Poppins, sans-serif", letterSpacing: "2px", color: "#FF5238" }}>YOUTUBE ANALYTICS</div>
                    <div style={{ fontSize: "26px", fontWeight: 700, letterSpacing: "-.6px", marginTop: "5px" }}>
                        Tracking <span style={{ fontFamily: "Poppins, sans-serif" }}>{stats?.total_artists || 0}</span> artists · <span style={{ fontFamily: "Poppins, sans-serif" }}>{stats?.yt_songs || 0}</span> songs
                    </div>
                    <div style={{ fontSize: "11.5px", color: "rgba(255,255,255,.38)", marginTop: "5px" }}>
                        Last refreshed {stats?.last_collection?.last_run ? formatDateTime(stats.last_collection.last_run) : "—"}
                    </div>
                </div>
                <div className="symphony-title-actions">
                    <div style={{ display: "flex", gap: "8px" }}>
                        <button onClick={handleRefresh} disabled={refreshing} style={{ background: "transparent", border: "1px solid rgba(255,255,255,.14)", color: "#E9E9F2", padding: "9px 14px", borderRadius: "9px", font: "600 12px Poppins, sans-serif", cursor: "pointer", whiteSpace: "nowrap", opacity: refreshing ? 0.5 : 1 }}>
                            {refreshing ? "↻ Refreshing..." : "↻ Refresh stats"}
                        </button>
                        <button style={{ background: "transparent", border: "1px solid rgba(52,199,89,.4)", color: "#5BE08A", padding: "9px 14px", borderRadius: "9px", font: "600 12px Poppins, sans-serif", cursor: "pointer", whiteSpace: "nowrap" }}>
                            ⌕ Find new songs
                        </button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "9px", background: "#14141F", border: "1px solid rgba(255,255,255,.06)", borderRadius: "9px", padding: "7px 12px" }}>
                        <span style={{ font: "600 10px Poppins, sans-serif", color: "rgba(255,255,255,.45)", letterSpacing: ".5px" }}>API QUOTA</span>
                        <div style={{ width: "90px", height: "5px", background: "rgba(255,255,255,.1)", borderRadius: "3px", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${quotaPct}%`, background: "linear-gradient(90deg,#FF8A3D,#FF3B30)" }}></div>
                        </div>
                        <span style={{ font: "600 10px Poppins, sans-serif", color: "rgba(255,255,255,.55)" }}>{quotaStr}</span>
                    </div>
                </div>
            </div>

            {/* KPIs */}
            <div className="symphony-kpi-grid">
                {kpis.map((k, idx) => (
                    <div key={idx} style={{ background: "#14141F", border: "1px solid rgba(255,255,255,.06)", borderRadius: "14px", padding: "16px 17px" }}>
                        <div style={{ font: "500 10px Poppins, sans-serif", letterSpacing: "1.4px", color: "rgba(255,255,255,.4)" }}>{k.label}</div>
                        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: "9px" }}>
                            <div style={{ fontFamily: "Poppins, sans-serif", fontSize: "32px", fontWeight: 600, letterSpacing: "-1.2px", color: k.color }}>{k.val}</div>
                            <svg width="62" height="26" viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points={k.spark} fill="none" stroke={k.color} strokeWidth="3" strokeLinejoin="round" opacity="0.85"></polyline></svg>
                        </div>
                        <div style={{ font: "600 11px Poppins, sans-serif", color: "#5BE08A", marginTop: "7px" }}>{k.delta}</div>
                    </div>
                ))}
            </div>

            {/* two-up: hot + new */}
            <div className="symphony-two-up-grid">

                {/* whats hot */}
                <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "16px" }}>🏆</span><span style={{ fontWeight: 600, fontSize: "16px", marginLeft: "4px" }}>Song Leaderboard</span>
                            <span style={{ fontSize: "12px", fontWeight: 400, color: "rgba(255,255,255,.4)", marginLeft: "6px" }}>({hot.length})</span>
                        </div>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            <input 
                                value={songSearch} 
                                onChange={e => setSongSearch(e.target.value)}
                                placeholder="Search..."
                                style={{ background: "rgba(255,255,255,.05)", border: "none", outline: "none", color: "#E9E9F2", fontSize: "12px", padding: "4px 8px", borderRadius: "4px", width: "90px" }}
                            />
                            {[{k: 'spike', l: 'Spike'}, {k: 'prev', l: 'Prev'}, {k: 'curr', l: 'Curr'}].map(s => (
                                <button key={s.k} onClick={() => {
                                    if (songSortBy === s.k) setSongSortDir(d => d === 'desc' ? 'asc' : 'desc');
                                    else { setSongSortBy(s.k); setSongSortDir('desc'); }
                                }} style={{ 
                                    background: songSortBy === s.k ? "rgba(229,9,20,.12)" : "transparent", 
                                    color: songSortBy === s.k ? "#FF6A52" : "rgba(255,255,255,.4)", 
                                    border: "1px solid " + (songSortBy === s.k ? "rgba(229,9,20,.5)" : "rgba(255,255,255,.1)"), 
                                    padding: "4px 8px", borderRadius: "4px", fontSize: "11px", cursor: "pointer",
                                    transition: "all 0.2s"
                                }}>
                                    {s.l}{songSortBy === s.k ? (songSortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div style={{ maxHeight: "350px", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", overflow: "auto" }}>
                        {hot.length > 0 ? (
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", fontFamily: "Poppins, sans-serif" }}>
                                <thead style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--bg-secondary)" }}>
                                    <tr>
                                        {["#", "Track", "Spike", "Pop"].map((h, i) => (
                                            <th
                                                key={i}
                                                style={{
                                                    padding: "10px 12px",
                                                    textAlign: (h === "#" || h === "Track") ? "left" : "right",
                                                    fontWeight: 600,
                                                    color: "var(--text-muted)",
                                                    fontSize: "0.75rem",
                                                    textTransform: "uppercase",
                                                    letterSpacing: "0.04em",
                                                    borderBottom: "1px solid var(--border-subtle)",
                                                    background: "var(--bg-secondary)",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {hot.map((h, idx) => {
                                        const rank = idx + 1;
                                        return (
                                            <tr 
                                                key={idx} 
                                                style={{ borderBottom: "1px solid var(--border-subtle)", transition: "background 0.12s ease", cursor: "pointer" }} 
                                                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"} 
                                                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                                                onClick={() => window.location.href = `/song/${h.song_id}`}
                                            >
                                                <td style={{ padding: "10px 12px", fontWeight: 700, width: 40, color: rank <= 3 ? "var(--yt-red)" : "var(--text-muted)", fontSize: rank <= 3 ? "1rem" : "0.85rem" }}>
                                                    {rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] : rank}
                                                </td>
                                                <td style={{ padding: "10px 12px" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                        {h.img ? (
                                                            <img src={h.img} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", flex: "none" }} />
                                                        ) : (
                                                            <div style={{ width: 32, height: 32, borderRadius: 6, background: h.grad, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "12px", color: "rgba(255,255,255,.88)", flex: "none" }}>{h.ini}</div>
                                                        )}
                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "160px" }}>{h.title}</div>
                                                            <div style={{ fontSize: "11px", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "160px" }}>{h.artist}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: "10px 12px", textAlign: "right" }}>
                                                    <span style={{ background: "rgba(255, 0, 0, 0.15)", color: "var(--yt-red)", padding: "2px 8px", borderRadius: 12, fontWeight: 700, fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                                                        🔥 {h.mult}
                                                    </span>
                                                </td>
                                                <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                                                    {h.from} <span style={{ color: "var(--text-muted)", margin: "0 2px" }}>→</span> {h.to}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        ) : (
                            <div style={{ padding: "16px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>No viral alerts right now.</div>
                        )}
                    </div>
                </div>

                {/* whats new */}
                <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><span style={{ fontSize: "16px" }}>🆕</span><span style={{ fontWeight: 600, fontSize: "16px" }}>What's New</span></div>
                        <span style={{ font: "500 10px Poppins, sans-serif", color: "rgba(255,255,255,.4)", letterSpacing: ".5px" }}>PAST 7 DAYS</span>
                    </div>
                    <div style={{ background: "#14141F", border: "1px solid rgba(255,255,255,.06)", borderRadius: "14px", overflow: "auto", maxHeight: "350px" }}>
                        {fresh.length > 0 ? fresh.map((n, idx) => (
                            <Link href={`/song/${n.song_id}`} key={idx} style={{ display: "flex", alignItems: "center", gap: "13px", padding: "12px 16px", borderTop: idx > 0 ? "1px solid rgba(255,255,255,.05)" : "none", textDecoration: "none", color: "inherit", cursor: "pointer", transition: "background 0.2s" }} onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,.03)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                                {n.img ? (
                                    <img src={n.img} alt="" style={{ width: 42, height: 42, borderRadius: 9, objectFit: "cover", flex: "none" }} />
                                ) : (
                                    <div style={{ width: "42px", height: "42px", borderRadius: "9px", background: n.grad, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "14px", color: "rgba(255,255,255,.88)" }}>{n.ini}</div>
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.title}</div>
                                    <div style={{ fontSize: "11.5px", color: "rgba(255,255,255,.45)" }}>{n.artist} · {n.date}</div>
                                </div>
                                <div style={{ background: "rgba(52,199,89,.14)", color: "#5BE08A", font: "700 9px Poppins, sans-serif", padding: "4px 8px", borderRadius: "6px", flex: "none", letterSpacing: ".5px" }}>NEW</div>
                            </Link>
                        )) : (
                            <div style={{ padding: "16px", textAlign: "center", color: "rgba(255,255,255,.4)", fontSize: "13px" }}>No recent releases found.</div>
                        )}
                    </div>
                </div>
            </div>

            {/* leaderboard */}
            <div style={{ marginTop: "34px", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "16px" }}>🏆</span><span style={{ fontWeight: 600, fontSize: "16px" }}>Artist Leaderboard</span>
                <span style={{ font: "600 12px Poppins, sans-serif", color: "rgba(255,255,255,.35)" }}>({total})</span>
            </div>

            {/* filter bar */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "12px", background: "#14141F", border: "1px solid rgba(255,255,255,.06)", borderRadius: "12px", padding: "11px 13px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#0E0E16", border: "1px solid rgba(255,255,255,.08)", borderRadius: "9px", padding: "8px 12px", flex: 1, minWidth: "200px" }}>
                    <span style={{ color: "rgba(255,255,255,.4)" }}>⌕</span>
                    <input
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        placeholder="Search artists…"
                        style={{ background: "transparent", border: "none", outline: "none", color: "#E9E9F2", fontSize: "13px", width: "100%" }}
                    />
                </div>
                <select value={genreFilter} onChange={e => {setGenreFilter(e.target.value); setPage(1);}} style={{ background: "#0E0E16", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.6)", padding: "8px 12px", borderRadius: "9px", outline: "none", fontSize: "12px", fontFamily: "Poppins, sans-serif" }}>
                    <option value="">Genre</option>
                    <option value="Hip Hop">Hip Hop</option>
                    <option value="Pop">Pop</option>
                    <option value="Indie">Indie</option>
                    <option value="Punjabi">Punjabi</option>
                    <option value="Bollywood">Bollywood</option>
                </select>
                <select value={regionFilter} onChange={e => {setRegionFilter(e.target.value); setPage(1);}} style={{ background: "#0E0E16", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.6)", padding: "8px 12px", borderRadius: "9px", outline: "none", fontSize: "12px", fontFamily: "Poppins, sans-serif" }}>
                    <option value="">Region</option>
                    <option value="India">India</option>
                    <option value="Delhi">Delhi</option>
                    <option value="Mumbai">Mumbai</option>
                    <option value="Punjab">Punjab</option>
                </select>
                <button
                    onClick={() => setFavOnly(!favOnly)}
                    style={{
                        border: `1px solid ${favOnly ? 'rgba(229,9,20,.5)' : 'rgba(255,255,255,.1)'}`,
                        background: favOnly ? 'rgba(229,9,20,.12)' : 'transparent',
                        color: favOnly ? '#FF6A52' : 'rgba(255,255,255,.6)',
                        padding: "8px 13px", borderRadius: "9px", font: "600 12px Poppins, sans-serif", cursor: "pointer", whiteSpace: "nowrap"
                    }}>
                    ♥ Favourites
                </button>
                <div style={{ width: "1px", height: "22px", background: "rgba(255,255,255,.1)" }}></div>
                <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                    {sortTabs.map(s => (
                        <button key={s.key} onClick={s.onClick} style={{
                            border: `1px solid ${s.border}`, background: s.bg, color: s.color,
                            padding: "8px 12px", borderRadius: "8px", font: "600 12px Poppins, sans-serif", cursor: "pointer", whiteSpace: "nowrap"
                        }}>
                            {s.label}{s.arrow}
                        </button>
                    ))}
                </div>
            </div>

            {/* table */}
            <div style={{ marginTop: "12px", background: "#14141F", border: "1px solid rgba(255,255,255,.06)", borderRadius: "14px", overflow: "auto", maxHeight: "600px" }}>
                <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#14141F", display: "grid", gridTemplateColumns: "46px 1fr 130px 150px 78px 86px 92px 110px 40px", gap: "12px", padding: "11px 18px", font: "500 10px Poppins, sans-serif", letterSpacing: "1px", color: "rgba(255,255,255,.35)", borderBottom: "1px solid rgba(255,255,255,.07)", minWidth: "1000px" }}>
                    <div>#</div><div>ARTIST</div><div>GENRE</div><div>REGION</div><div style={{ textAlign: "right" }}>SONGS</div><div style={{ textAlign: "right" }}>VIEWS</div><div>7-DAY</div><div>LATEST</div><div></div>
                </div>
                {rows.length > 0 ? rows.map(a => (
                    <Link href={`/artist/${a.id}`} key={a.id} style={{ display: "grid", gridTemplateColumns: "46px 1fr 130px 150px 78px 86px 92px 110px 40px", gap: "12px", alignItems: "center", padding: "13px 18px", borderTop: "1px solid rgba(255,255,255,.05)", cursor: "pointer", textDecoration: "none", color: "inherit", transition: "background 0.2s", minWidth: "1000px" }} onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,.03)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                        <div style={{ fontFamily: "Poppins, sans-serif", fontSize: "15px" }}>{a.medal}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                            {a.img ? (
                                <img src={a.img} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flex: "none" }} />
                            ) : (
                                <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: a.grad, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "13px", color: "rgba(255,255,255,.92)" }}>{a.ini}</div>
                            )}
                            <div style={{ fontWeight: 600, fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                        </div>
                        <div><span style={{ background: "rgba(229,9,20,.13)", color: "#FF8378", fontSize: "11px", fontWeight: 500, padding: "3px 9px", borderRadius: "6px", whiteSpace: "nowrap" }}>{a.genre || "Unknown"}</span></div>
                        <div style={{ fontSize: "12px", color: "rgba(255,255,255,.55)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {a.region || "Unknown"}</div>
                        <div style={{ textAlign: "right", fontFamily: "Poppins, sans-serif", fontSize: "12.5px", color: "rgba(255,255,255,.7)" }}>{a.yt_song_count || a.total_yt_songs || a.songs || 0}</div>
                        <div style={{ textAlign: "right", fontFamily: "Poppins, sans-serif", fontSize: "14px", fontWeight: 600 }}>{formatNumber(a.total_yt_views || 0)}</div>
                        <svg width="84" height="22" viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points={a.spark} fill="none" stroke={a.trendColor} strokeWidth="3" strokeLinejoin="round"></polyline></svg>
                        <div style={{ fontSize: "11.5px", color: "rgba(255,255,255,.5)", fontFamily: "Poppins, sans-serif" }}>{a.latest_release_date ? formatDate(a.latest_release_date) : "—"}</div>
                        <div onClick={(e) => toggleFav(e, a.id)} style={{ fontSize: "17px", color: a.favColor, textAlign: "center" }}>{a.heart}</div>
                    </Link>
                )) : (
                    <div style={{ padding: "36px", textAlign: "center", color: "rgba(255,255,255,.4)", fontSize: "13px", gridColumn: "1 / -1" }}>No artists match your filters.</div>
                )}
            </div>
            
            {/* simple pagination controls since we don't have infinite scroll yet in this template */}
            {!favOnly && totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", padding: "0 10px" }}>
                    <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ background: "rgba(255,255,255,0.05)", border: "none", color: "#E9E9F2", padding: "6px 12px", borderRadius: "6px", cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? 0.5 : 1 }}>← Previous</button>
                    <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>Page {page} of {totalPages}</span>
                    <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ background: "rgba(255,255,255,0.05)", border: "none", color: "#E9E9F2", padding: "6px 12px", borderRadius: "6px", cursor: page >= totalPages ? "not-allowed" : "pointer", opacity: page >= totalPages ? 0.5 : 1 }}>Next →</button>
                </div>
            )}
        </div>
    );
}
