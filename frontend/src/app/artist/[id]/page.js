"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatDate, formatDateTime } from "../../../utils/dateFormat";

const API = process.env.NEXT_PUBLIC_API_URL || "";

function formatNumber(num) {
    if (!num && num !== 0) return "—";
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + "B";
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
    return num.toLocaleString();
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

export default function ArtistDetail() {
    const params = useParams();
    const artistId = params.id;

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showLoadingScreen, setShowLoadingScreen] = useState(false);

    useEffect(() => {
        let timer;
        if (loading) {
            timer = setTimeout(() => setShowLoadingScreen(true), 500);
        } else {
            setShowLoadingScreen(false);
        }
        return () => clearTimeout(timer);
    }, [loading]);

    const fetchDetail = () => {
        if (!artistId) return;
        setLoading(true);
        fetch(`${API}/api/artist/${artistId}?platform=youtube`)
            .then(r => r.json())
            .then(d => { setData(d); setLoading(false); })
            .catch(e => { console.error(e); setLoading(false); });
    };

    useEffect(() => { fetchDetail(); }, [artistId]);

    const toggleWatch = async () => {
        try {
            await fetch(`${API}/api/artist/${artistId}/watch`, { method: "POST" });
            fetchDetail();
        } catch (e) { console.error(e); }
    };

    if (loading && !data) {
        return (
            <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "26px 28px 60px", position: "relative", minHeight: "80vh" }}>
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
                            Loading Artist...
                        </div>
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                )}
            </div>
        );
    }

    if (!data || !data.artist) {
        return (
            <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "26px 28px 60px", textAlign: "center" }}>
                <div style={{ padding: "36px", color: "rgba(255,255,255,.4)", fontSize: "14px" }}>
                    Artist not found.<br/><br/>
                    <Link href="/youtube" style={{ color: "#FF3B30", textDecoration: "none" }}>← Back to Leaderboard</Link>
                </div>
            </div>
        );
    }

    const { artist, songs, viral_alerts } = data;

    const totalViews = songs.reduce((sum, s) => sum + (s.latest_play_count || 0), 0);
    const totalLikes = songs.reduce((sum, s) => sum + (s.latest_like_count || 0), 0);
    
    // Process songs for the table (sort by views descending)
    const sortedSongs = [...songs].sort((a, b) => (b.latest_play_count || 0) - (a.latest_play_count || 0));

    return (
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "22px 28px 60px" }}>
            
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
                        Refreshing...
                    </div>
                </div>
            )}

            <Link href="/youtube" style={{ display: "inline-flex", alignItems: "center", gap: "7px", color: "rgba(255,255,255,.5)", fontSize: "13px", cursor: "pointer", marginBottom: "18px", textDecoration: "none" }}>
                ← Back to leaderboard
            </Link>

            {/* profile header */}
            <div style={{ background: "linear-gradient(135deg,#1b1830,#14141F)", border: "1px solid rgba(255,255,255,.07)", borderRadius: "18px", padding: "26px", display: "flex", gap: "26px", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ width: "118px", height: "118px", borderRadius: "50%", background: getGrad(artist.id), flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "42px", color: "rgba(255,255,255,.92)", boxShadow: "0 8px 30px -6px rgba(0,0,0,.5)" }}>
                    {getInitials(artist.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "38px", fontWeight: 700, letterSpacing: "-1px", lineHeight: 1 }}>{artist.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "10px" }}>
                        <span style={{ background: "rgba(229,9,20,.16)", color: "#FF6A52", fontSize: "12px", fontWeight: 600, padding: "5px 12px", borderRadius: "999px" }}>{artist.genre || "Unknown Genre"}</span>
                        <span style={{ fontSize: "13px", color: "rgba(255,255,255,.55)" }}>📍 {artist.region || "Unknown Region"}</span>
                    </div>
                    <div style={{ display: "flex", gap: "34px", marginTop: "18px", flexWrap: "wrap" }}>
                        <div><div style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: "24px", fontWeight: 600 }}>{songs.length}</div><div style={{ font: "500 10px ui-monospace,Menlo,monospace", letterSpacing: "1px", color: "rgba(255,255,255,.4)", marginTop: "2px" }}>SONGS</div></div>
                        <div><div style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: "24px", fontWeight: 600, color: "#FF3B30" }}>{formatNumber(totalViews)}</div><div style={{ font: "500 10px ui-monospace,Menlo,monospace", letterSpacing: "1px", color: "rgba(255,255,255,.4)", marginTop: "2px" }}>TOTAL VIEWS</div></div>
                        <div><div style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: "24px", fontWeight: 600, color: "#5BE08A" }}>{formatNumber(totalLikes)}</div><div style={{ font: "500 10px ui-monospace,Menlo,monospace", letterSpacing: "1px", color: "rgba(255,255,255,.4)", marginTop: "2px" }}>TOTAL LIKES</div></div>
                        <div><div style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: "24px", fontWeight: 600, color: "#FF8A3D" }}>{viral_alerts.length}</div><div style={{ font: "500 10px ui-monospace,Menlo,monospace", letterSpacing: "1px", color: "rgba(255,255,255,.4)", marginTop: "2px" }}>VIRAL ALERTS</div></div>
                    </div>
                </div>
                <button onClick={toggleWatch} style={{ background: artist.is_watched ? "rgba(255,255,255,0.1)" : "transparent", border: "1px solid rgba(255,255,255,.16)", color: "#E9E9F2", padding: "11px 20px", borderRadius: "11px", font: "600 13px 'Space Grotesk'", cursor: "pointer", flex: "none" }}>
                    {artist.is_watched ? '♥ Watching' : '♡ Watch'}
                </button>
            </div>

            {/* viral alerts */}
            <div style={{ marginTop: "28px", display: "flex", alignItems: "center", gap: "8px" }}><span style={{ fontSize: "16px" }}>🔥</span><span style={{ fontWeight: 600, fontSize: "16px" }}>Viral Alerts</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "14px", marginTop: "12px" }}>
                {viral_alerts.length > 0 ? viral_alerts.slice(0, 9).map((v, i) => (
                    <div key={i} style={{ background: "#14141F", border: "1px solid rgba(255,82,56,.18)", borderRadius: "13px", padding: "15px 16px" }}>
                        <div style={{ fontWeight: 600, fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.title || "Unknown Song"}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: "9px", marginTop: "9px" }}>
                            <span style={{ background: "rgba(255,82,56,.16)", color: "#FF6A52", font: "700 12px ui-monospace,Menlo,monospace", padding: "4px 9px", borderRadius: "7px" }}>▲ {v.growth_factor ? `${v.growth_factor}x` : '—'}</span>
                            <span style={{ font: "600 11px ui-monospace,Menlo,monospace", color: "rgba(255,255,255,.5)" }}>{formatNumber(v.previous_count)} → {formatNumber(v.current_count)}</span>
                        </div>
                        <div style={{ fontSize: "10.5px", color: "rgba(255,255,255,.35)", marginTop: "9px", fontFamily: "ui-monospace,Menlo,monospace" }}>{formatDateTime(v.detected_at)}</div>
                    </div>
                )) : (
                    <div style={{ gridColumn: "1 / -1", padding: "20px", background: "#14141F", border: "1px solid rgba(255,255,255,.06)", borderRadius: "13px", color: "rgba(255,255,255,.4)", fontSize: "13px", textAlign: "center" }}>
                        No viral alerts recorded yet for this artist.
                    </div>
                )}
            </div>

            {/* all songs */}
            <div style={{ marginTop: "28px", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "16px" }}>🎵</span><span style={{ fontWeight: 600, fontSize: "16px" }}>All Songs</span>
                <span style={{ font: "600 12px ui-monospace,Menlo,monospace", color: "rgba(255,255,255,.35)" }}>({songs.length})</span>
            </div>
            <div style={{ marginTop: "12px", background: "#14141F", border: "1px solid rgba(255,255,255,.06)", borderRadius: "14px", overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 150px 96px 86px 88px 36px", gap: "12px", padding: "11px 18px", font: "500 10px ui-monospace,Menlo,monospace", letterSpacing: "1px", color: "rgba(255,255,255,.35)", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
                    <div>#</div><div>SONG</div><div>ALBUM</div><div style={{ textAlign: "right" }}>VIEWS</div><div style={{ textAlign: "right" }}>LIKES</div><div>RELEASED</div><div></div>
                </div>
                {sortedSongs.length > 0 ? sortedSongs.map((t, i) => (
                    <div key={t.id} style={{ display: "grid", gridTemplateColumns: "40px 1fr 150px 96px 86px 88px 36px", gap: "12px", alignItems: "center", padding: "11px 18px", borderTop: "1px solid rgba(255,255,255,.05)", transition: "background 0.2s" }} onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,.03)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                        <div style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: "12px", color: "rgba(255,255,255,.4)" }}>{i + 1}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: "11px", minWidth: 0 }}>
                            <div style={{ width: "38px", height: "26px", borderRadius: "5px", background: getGrad(t.id), flex: "none", backgroundImage: t.thumbnail_url ? `url(${t.thumbnail_url})` : "none", backgroundSize: "cover", backgroundPosition: "center" }}></div>
                            <div style={{ fontWeight: 500, fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={t.title}>{t.title}</div>
                        </div>
                        <div style={{ fontSize: "12px", color: "rgba(255,255,255,.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={t.album_name || "Single"}>{t.album_name || "Single"}</div>
                        <div style={{ textAlign: "right", fontFamily: "ui-monospace,Menlo,monospace", fontSize: "13px", fontWeight: 600, color: "#FF6A52" }}>{formatNumber(t.latest_play_count)}</div>
                        <div style={{ textAlign: "right", fontFamily: "ui-monospace,Menlo,monospace", fontSize: "12px", color: "rgba(255,255,255,.6)" }}>{formatNumber(t.latest_like_count)}</div>
                        <div style={{ fontSize: "11px", color: "rgba(255,255,255,.45)", fontFamily: "ui-monospace,Menlo,monospace" }}>{t.release_date ? formatDate(t.release_date) : "—"}</div>
                        <a href={`https://youtube.com/watch?v=${t.platform_id}`} target="_blank" rel="noopener noreferrer" style={{ textAlign: "center", color: "#FF3B30", fontSize: "13px", textDecoration: "none", cursor: "pointer" }}>▶</a>
                    </div>
                )) : (
                    <div style={{ padding: "36px", textAlign: "center", color: "rgba(255,255,255,.4)", fontSize: "13px", gridColumn: "1 / -1" }}>No songs found.</div>
                )}
            </div>

        </div>
    );
}
