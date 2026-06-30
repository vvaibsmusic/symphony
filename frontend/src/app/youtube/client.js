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
    const [favs, setFavs] = useState({});
    
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
            const res = await fetch(`${API}/api/dashboard`).then(r => r.json());
            setStats(res.stats || null);
            setViral(res.viral || []);
            setReleases(res.releases || []);
            setQuota(res.quota || null);
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
            
            const res = await fetch(`${API}/api/artists?${params}`).then(r => r.json());
            setArtists(res.artists || []);
            setTotalPages(res.pages || 1);
            setTotal(res.total || 0);
        } catch (e) { console.error("Failed to fetch artists:", e); }
        setLoading(false);
    }, [page, search, sortBy, sortDir, favOnly]);

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

    const hot = viral.slice(0, 5).map(v => ({
        title: (v.title || "").split(' (')[0],
        artist: v.artist_name,
        mult: v.growth_factor ? `${v.growth_factor}x` : '2.1x',
        from: formatNumber(v.previous_count),
        to: formatNumber(v.current_count),
        ini: getInitials(v.artist_name),
        grad: getGrad(v.artist_id),
        spark: generateSparkline(1),
    }));

    const fresh = releases.slice(0, 5).map(r => ({
        title: (r.title || "").split(' (')[0],
        artist: r.artist_name,
        date: formatDate(r.release_date),
        ini: getInitials(r.artist_name),
        grad: getGrad(r.artist_id),
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
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "26px 28px 60px", position: "relative" }}>
            
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
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "18px", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "600 11px ui-monospace,Menlo,monospace", letterSpacing: "2px", color: "#FF5238" }}>YOUTUBE ANALYTICS</div>
                    <div style={{ fontSize: "26px", fontWeight: 700, letterSpacing: "-.6px", marginTop: "5px" }}>
                        Tracking <span style={{ fontFamily: "ui-monospace,Menlo,monospace" }}>{stats?.total_artists || 0}</span> artists · <span style={{ fontFamily: "ui-monospace,Menlo,monospace" }}>{stats?.yt_songs || 0}</span> songs
                    </div>
                    <div style={{ fontSize: "11.5px", color: "rgba(255,255,255,.38)", marginTop: "5px" }}>
                        Last refreshed {stats?.last_collection?.last_run ? formatDateTime(stats.last_collection.last_run) : "—"}
                    </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "9px", flex: "none" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                        <button onClick={handleRefresh} disabled={refreshing} style={{ background: "transparent", border: "1px solid rgba(255,255,255,.14)", color: "#E9E9F2", padding: "9px 14px", borderRadius: "9px", font: "600 12px 'Space Grotesk'", cursor: "pointer", whiteSpace: "nowrap", opacity: refreshing ? 0.5 : 1 }}>
                            {refreshing ? "↻ Refreshing..." : "↻ Refresh stats"}
                        </button>
                        <button style={{ background: "transparent", border: "1px solid rgba(52,199,89,.4)", color: "#5BE08A", padding: "9px 14px", borderRadius: "9px", font: "600 12px 'Space Grotesk'", cursor: "pointer", whiteSpace: "nowrap" }}>
                            ⌕ Find new songs
                        </button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "9px", background: "#14141F", border: "1px solid rgba(255,255,255,.06)", borderRadius: "9px", padding: "7px 12px" }}>
                        <span style={{ font: "600 10px ui-monospace,Menlo,monospace", color: "rgba(255,255,255,.45)", letterSpacing: ".5px" }}>API QUOTA</span>
                        <div style={{ width: "90px", height: "5px", background: "rgba(255,255,255,.1)", borderRadius: "3px", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${quotaPct}%`, background: "linear-gradient(90deg,#FF8A3D,#FF3B30)" }}></div>
                        </div>
                        <span style={{ font: "600 10px ui-monospace,Menlo,monospace", color: "rgba(255,255,255,.55)" }}>{quotaStr}</span>
                    </div>
                </div>
            </div>

            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "14px", marginTop: "22px" }}>
                {kpis.map((k, idx) => (
                    <div key={idx} style={{ background: "#14141F", border: "1px solid rgba(255,255,255,.06)", borderRadius: "14px", padding: "16px 17px" }}>
                        <div style={{ font: "500 10px ui-monospace,Menlo,monospace", letterSpacing: "1.4px", color: "rgba(255,255,255,.4)" }}>{k.label}</div>
                        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: "9px" }}>
                            <div style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: "32px", fontWeight: 600, letterSpacing: "-1.2px", color: k.color }}>{k.val}</div>
                            <svg width="62" height="26" viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points={k.spark} fill="none" stroke={k.color} strokeWidth="3" strokeLinejoin="round" opacity="0.85"></polyline></svg>
                        </div>
                        <div style={{ font: "600 11px ui-monospace,Menlo,monospace", color: "#5BE08A", marginTop: "7px" }}>{k.delta}</div>
                    </div>
                ))}
            </div>

            {/* two-up: hot + new */}
            <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: "18px", marginTop: "30px", alignItems: "start" }}>

                {/* whats hot */}
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                        <span style={{ fontSize: "16px" }}>🔥</span><span style={{ fontWeight: 600, fontSize: "16px" }}>What's Hot</span>
                        <span style={{ font: "500 10px ui-monospace,Menlo,monospace", color: "rgba(255,255,255,.35)", letterSpacing: ".5px", marginLeft: "2px" }}>SPIKE DETECTED · 24H</span>
                    </div>
                    <div style={{ background: "#14141F", border: "1px solid rgba(255,255,255,.06)", borderRadius: "14px", overflow: "hidden" }}>
                        {hot.length > 0 ? hot.map((h, idx) => (
                            <div key={idx} style={{ display: "flex", alignItems: "center", gap: "13px", padding: "12px 16px", borderTop: idx > 0 ? "1px solid rgba(255,255,255,.05)" : "none" }}>
                                <div style={{ width: "42px", height: "42px", borderRadius: "9px", background: h.grad, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "14px", color: "rgba(255,255,255,.88)" }}>{h.ini}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.title}</div>
                                    <div style={{ fontSize: "11.5px", color: "rgba(255,255,255,.45)" }}>{h.artist}</div>
                                </div>
                                <svg width="70" height="24" viewBox="0 0 100 30" preserveAspectRatio="none" style={{ flex: "none" }}><polyline points={h.spark} fill="none" stroke="#FF5238" strokeWidth="3" strokeLinejoin="round"></polyline></svg>
                                <div style={{ font: "600 11px ui-monospace,Menlo,monospace", color: "rgba(255,255,255,.5)", width: "108px", textAlign: "right", flex: "none" }}>{h.from} → {h.to}</div>
                                <div style={{ background: "rgba(255,82,56,.14)", color: "#FF6A52", font: "700 12px ui-monospace,Menlo,monospace", padding: "5px 9px", borderRadius: "7px", flex: "none", width: "62px", textAlign: "center" }}>{h.mult}</div>
                            </div>
                        )) : (
                            <div style={{ padding: "16px", textAlign: "center", color: "rgba(255,255,255,.4)", fontSize: "13px" }}>No viral alerts right now.</div>
                        )}
                    </div>
                </div>

                {/* whats new */}
                <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><span style={{ fontSize: "16px" }}>🆕</span><span style={{ fontWeight: 600, fontSize: "16px" }}>What's New</span></div>
                        <span style={{ font: "500 10px ui-monospace,Menlo,monospace", color: "rgba(255,255,255,.4)", letterSpacing: ".5px" }}>PAST 7 DAYS</span>
                    </div>
                    <div style={{ background: "#14141F", border: "1px solid rgba(255,255,255,.06)", borderRadius: "14px", overflow: "hidden" }}>
                        {fresh.length > 0 ? fresh.map((n, idx) => (
                            <div key={idx} style={{ display: "flex", alignItems: "center", gap: "13px", padding: "12px 16px", borderTop: idx > 0 ? "1px solid rgba(255,255,255,.05)" : "none" }}>
                                <div style={{ width: "42px", height: "42px", borderRadius: "9px", background: n.grad, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "14px", color: "rgba(255,255,255,.88)" }}>{n.ini}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.title}</div>
                                    <div style={{ fontSize: "11.5px", color: "rgba(255,255,255,.45)" }}>{n.artist} · {n.date}</div>
                                </div>
                                <div style={{ background: "rgba(52,199,89,.14)", color: "#5BE08A", font: "700 9px ui-monospace,Menlo,monospace", padding: "4px 8px", borderRadius: "6px", flex: "none", letterSpacing: ".5px" }}>NEW</div>
                            </div>
                        )) : (
                            <div style={{ padding: "16px", textAlign: "center", color: "rgba(255,255,255,.4)", fontSize: "13px" }}>No recent releases found.</div>
                        )}
                    </div>
                </div>
            </div>

            {/* leaderboard */}
            <div style={{ marginTop: "34px", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "16px" }}>🏆</span><span style={{ fontWeight: 600, fontSize: "16px" }}>Artist Leaderboard</span>
                <span style={{ font: "600 12px ui-monospace,Menlo,monospace", color: "rgba(255,255,255,.35)" }}>({total})</span>
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
                <button
                    onClick={() => setFavOnly(!favOnly)}
                    style={{
                        border: `1px solid ${favOnly ? 'rgba(229,9,20,.5)' : 'rgba(255,255,255,.1)'}`,
                        background: favOnly ? 'rgba(229,9,20,.12)' : 'transparent',
                        color: favOnly ? '#FF6A52' : 'rgba(255,255,255,.6)',
                        padding: "8px 13px", borderRadius: "9px", font: "600 12px 'Space Grotesk'", cursor: "pointer", whiteSpace: "nowrap"
                    }}>
                    ♥ Favourites
                </button>
                <div style={{ width: "1px", height: "22px", background: "rgba(255,255,255,.1)" }}></div>
                <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                    {sortTabs.map(s => (
                        <button key={s.key} onClick={s.onClick} style={{
                            border: `1px solid ${s.border}`, background: s.bg, color: s.color,
                            padding: "8px 12px", borderRadius: "8px", font: "600 12px 'Space Grotesk'", cursor: "pointer", whiteSpace: "nowrap"
                        }}>
                            {s.label}{s.arrow}
                        </button>
                    ))}
                </div>
            </div>

            {/* table */}
            <div style={{ marginTop: "12px", background: "#14141F", border: "1px solid rgba(255,255,255,.06)", borderRadius: "14px", overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "46px 1fr 130px 150px 78px 86px 92px 110px 40px", gap: "12px", padding: "11px 18px", font: "500 10px ui-monospace,Menlo,monospace", letterSpacing: "1px", color: "rgba(255,255,255,.35)", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
                    <div>#</div><div>ARTIST</div><div>GENRE</div><div>REGION</div><div style={{ textAlign: "right" }}>SONGS</div><div style={{ textAlign: "right" }}>VIEWS</div><div>7-DAY</div><div>LATEST</div><div></div>
                </div>
                {rows.length > 0 ? rows.map(a => (
                    <Link href={`/youtube/artist/${a.id}`} key={a.id} style={{ display: "grid", gridTemplateColumns: "46px 1fr 130px 150px 78px 86px 92px 110px 40px", gap: "12px", alignItems: "center", padding: "13px 18px", borderTop: "1px solid rgba(255,255,255,.05)", cursor: "pointer", textDecoration: "none", color: "inherit", transition: "background 0.2s" }} onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,.03)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                        <div style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: "15px" }}>{a.medal}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                            <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: a.grad, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "13px", color: "rgba(255,255,255,.92)" }}>{a.ini}</div>
                            <div style={{ fontWeight: 600, fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                        </div>
                        <div><span style={{ background: "rgba(229,9,20,.13)", color: "#FF8378", fontSize: "11px", fontWeight: 500, padding: "3px 9px", borderRadius: "6px", whiteSpace: "nowrap" }}>{a.genre || "Unknown"}</span></div>
                        <div style={{ fontSize: "12px", color: "rgba(255,255,255,.55)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {a.region || "Unknown"}</div>
                        <div style={{ textAlign: "right", fontFamily: "ui-monospace,Menlo,monospace", fontSize: "12.5px", color: "rgba(255,255,255,.7)" }}>{a.total_yt_songs || a.songs || 0}</div>
                        <div style={{ textAlign: "right", fontFamily: "ui-monospace,Menlo,monospace", fontSize: "14px", fontWeight: 600 }}>{formatNumber(a.total_yt_views || 0)}</div>
                        <svg width="84" height="22" viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points={a.spark} fill="none" stroke={a.trendColor} strokeWidth="3" strokeLinejoin="round"></polyline></svg>
                        <div style={{ fontSize: "11.5px", color: "rgba(255,255,255,.5)", fontFamily: "ui-monospace,Menlo,monospace" }}>{a.latest_release_date ? formatDate(a.latest_release_date) : "—"}</div>
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
