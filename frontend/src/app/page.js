"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function formatNumber(num) {
  if (!num && num !== 0) return "—";
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + "B";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toLocaleString();
}

export default function Home() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/stats`)
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error);
  }, []);

  return (
    <div className="page">
      <div className="page-header" style={{ textAlign: "center", padding: "4rem 0 2rem" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <img src="/logo.png" alt="vvaibsmusic" style={{ width: 80, height: 80, borderRadius: 16, objectFit: "cover", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }} />
        </div>
        <h1 className="symphony-brand" style={{ fontSize: "3.2rem", marginBottom: "0.5rem" }}>
          symphony
        </h1>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 400, marginBottom: "0.75rem", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          by <img src="/logo.png" alt="" style={{ width: 16, height: 16, borderRadius: 3, objectFit: "cover" }} /> vvaibsmusic
        </p>
        <p className="page-subtitle" style={{ fontSize: "1.05rem", maxWidth: 600, margin: "0 auto" }}>
          Music intelligence dashboard tracking viral songs, new releases &amp; artist analytics
        </p>
      </div>

      {stats && (
        <div className="stats-grid" style={{ maxWidth: 800, margin: "0 auto 3rem" }}>
          <div className="stat-card">
            <div className="stat-value">{stats.total_artists}</div>
            <div className="stat-label">Artists</div>
          </div>
          <div className="stat-card yt">
            <div className="stat-value">{formatNumber(stats.yt_songs)}</div>
            <div className="stat-label">YouTube Songs</div>
          </div>
          <div className="stat-card viral">
            <div className="stat-value">{stats.viral_alerts}</div>
            <div className="stat-label">Viral Alerts</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.watched_artists}</div>
            <div className="stat-label">Favourites</div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem", maxWidth: 800, margin: "0 auto" }}>
        <Link href="/youtube" style={{ textDecoration: "none" }}>
          <div className="card" style={{
            textAlign: "center",
            padding: "3rem 2rem",
            cursor: "pointer",
            border: "1px solid var(--yt-red-dim)",
            background: "linear-gradient(180deg, var(--yt-red-dim) 0%, var(--bg-card) 100%)"
          }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>▶</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--yt-red)" }}>
              YouTube Analytics
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              Viral detection • View &amp; like tracking • New releases
            </p>
          </div>
        </Link>

        <Link href="/spotify" style={{ textDecoration: "none" }}>
          <div className="card" style={{
            textAlign: "center",
            padding: "3rem 2rem",
            cursor: "pointer",
            border: "1px solid var(--sp-green-dim)",
            background: "linear-gradient(180deg, var(--sp-green-dim) 0%, var(--bg-card) 100%)",
          }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎧</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--sp-green)" }}>
              Spotify Analytics
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              Popularity tracking • Trending detection • New releases
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
