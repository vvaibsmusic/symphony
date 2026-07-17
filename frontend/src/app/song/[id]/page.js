"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const API = process.env.NEXT_PUBLIC_API_URL || "";

function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return "N/A";
  const abs = Math.abs(num);
  const sign = num < 0 ? "-" : "";
  if (abs >= 1000000000) return sign + (abs / 1000000000).toFixed(2) + "B";
  if (abs >= 1000000) return sign + (abs / 1000000).toFixed(2) + "M";
  if (abs >= 1000) return sign + (abs / 1000).toFixed(1) + "K";
  return sign + abs;
}

export default function SongAnalyticsPage() {
  const params = useParams();
  const id = params?.id;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`${API}/api/songs/${id}/history`)
      .then(res => res.json())
      .then(resData => {
        // Parse dates for the chart
        const formattedHistory = resData.history.map(item => ({
          ...item,
          dateLabel: new Date(item.collected_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        }));
        setData({ ...resData, history: formattedHistory });
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching song history:", err);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="symphony-page-container" style={{ display: "flex", justifyContent: "center", paddingTop: "100px" }}>
        <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>Loading song data...</div>
      </div>
    );
  }

  if (!data || !data.song) {
    return (
      <div className="symphony-page-container" style={{ display: "flex", justifyContent: "center", paddingTop: "100px" }}>
        <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>Song not found.</div>
      </div>
    );
  }

  const { song, history, alerts } = data;
  const isYouTube = song.platform === "youtube";
  
  // Calculate stats
  const latestSnapshot = history.length > 0 ? history[history.length - 1] : null;
  const firstSnapshot = history.length > 0 ? history[0] : null;
  const growth = latestSnapshot && firstSnapshot ? latestSnapshot.play_count - firstSnapshot.play_count : 0;
  const growthPct = latestSnapshot && firstSnapshot && firstSnapshot.play_count > 0 
    ? ((growth / firstSnapshot.play_count) * 100).toFixed(1) 
    : 0;

  return (
    <div className="symphony-page-container">
      {/* Breadcrumb */}
      <div style={{ marginBottom: "20px" }}>
        <Link href={`/artist/${song.artist_id}`} style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "12px", letterSpacing: "1px", textTransform: "uppercase" }}>
          ← Back to {song.artist_name}
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: "flex", gap: "20px", alignItems: "center", marginBottom: "20px", flexWrap: "wrap" }}>
        <div style={{ width: "100px", height: "100px", borderRadius: "12px", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.4)", overflow: "hidden", flexShrink: 0 }}>
          {song.thumbnail_url ? (
            <img src={song.thumbnail_url} alt={song.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: "32px" }}>🎵</span>
          )}
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <span style={{ background: isYouTube ? "rgba(229,9,20,0.15)" : "rgba(29,185,84,0.15)", color: isYouTube ? "#E50914" : "#1DB954", padding: "4px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px" }}>
              {song.platform}
            </span>
            <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>{song.release_date || "Unknown Release"}</span>
          </div>
          <h1 style={{ margin: "0 0 2px 0", fontSize: "24px", fontWeight: 800, letterSpacing: "-0.5px" }}>{song.title}</h1>
          <h2 style={{ margin: 0, fontSize: "16px", color: "var(--text-muted)", fontWeight: 500 }}>{song.artist_name}</h2>
        </div>
      </div>

      {/* KPIs */}
      <div className="symphony-kpi-grid" style={{ marginBottom: "20px" }}>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "16px", padding: "16px" }}>
          <div style={{ color: "var(--text-muted)", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Current {isYouTube ? "Views" : "Streams"}</div>
          <div style={{ fontSize: "24px", fontWeight: 700 }}>{latestSnapshot ? formatNumber(latestSnapshot.play_count) : "N/A"}</div>
        </div>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "16px", padding: "16px" }}>
          <div style={{ color: "var(--text-muted)", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Growth (Period)</div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: growth > 0 ? "#34C759" : growth < 0 ? "#FF3B30" : "inherit" }}>
            {growth > 0 ? "+" : ""}{formatNumber(growth)} <span style={{ fontSize: "14px", opacity: 0.7 }}>({growth > 0 ? "+" : ""}{growthPct}%)</span>
          </div>
        </div>
        {isYouTube && (
          <>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "16px", padding: "16px" }}>
              <div style={{ color: "var(--text-muted)", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Likes</div>
              <div style={{ fontSize: "24px", fontWeight: 700 }}>{latestSnapshot ? formatNumber(latestSnapshot.like_count) : "N/A"}</div>
            </div>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "16px", padding: "16px" }}>
              <div style={{ color: "var(--text-muted)", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Dislikes</div>
              <div style={{ fontSize: "24px", fontWeight: 700 }}>{latestSnapshot ? formatNumber(latestSnapshot.dislike_count) : "N/A"}</div>
            </div>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "16px", padding: "16px" }}>
              <div style={{ color: "var(--text-muted)", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Comments</div>
              <div style={{ fontSize: "24px", fontWeight: 700 }}>{latestSnapshot ? formatNumber(latestSnapshot.comment_count) : "N/A"}</div>
            </div>
          </>
        )}
      </div>

      {/* Audience Sentiment */}
      {song.sentiment_summary && (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "16px", padding: "16px", display: "flex", gap: "16px", alignItems: "center" }}>
            <div style={{ 
              width: "48px", height: "48px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              background: song.sentiment_score > 0.3 ? "rgba(52,199,89,0.15)" : song.sentiment_score < -0.3 ? "rgba(255,59,48,0.15)" : "rgba(255,255,255,0.1)",
              color: song.sentiment_score > 0.3 ? "#34C759" : song.sentiment_score < -0.3 ? "#FF3B30" : "#FFF",
              fontSize: "20px", fontWeight: "bold"
            }}>
              {song.sentiment_score > 0.3 ? "😊" : song.sentiment_score < -0.3 ? "😠" : "😐"}
            </div>
            <div>
              <div style={{ fontSize: "15px", fontWeight: 600, marginBottom: "2px" }}>Audience Sentiment: {song.sentiment_summary}</div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Based on AI analysis of recent YouTube comments (Score: {song.sentiment_score})</div>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px", letterSpacing: "0.5px", color: "rgba(255,255,255,0.8)" }}>Growth Trajectory</h3>
      <div style={{ width: "100%", height: "250px", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "16px", padding: "16px 16px 16px 0", marginBottom: "20px" }}>
        {history.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history}>
              <defs>
                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isYouTube ? "#E50914" : "#1DB954"} stopOpacity={0.4}/>
                  <stop offset="95%" stopColor={isYouTube ? "#E50914" : "#1DB954"} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis 
                dataKey="dateLabel" 
                stroke="rgba(255,255,255,0.3)" 
                fontSize={12}
                tickMargin={10}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                stroke="rgba(255,255,255,0.3)" 
                fontSize={12} 
                tickFormatter={(val) => formatNumber(val)}
                axisLine={false}
                tickLine={false}
                width={70}
              />
              <Tooltip 
                contentStyle={{ background: "#14141F", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff" }}
                itemStyle={{ color: "#fff", fontWeight: 600 }}
                formatter={(value) => [value.toLocaleString(), "Plays"]}
              />
              <Area 
                type="monotone" 
                dataKey="play_count" 
                stroke={isYouTube ? "#E50914" : "#1DB954"} 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorCount)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
            Not enough historical data to render chart.
          </div>
        )}
      </div>

      {/* Viral Alerts */}
      {alerts.length > 0 && (
        <>
          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", letterSpacing: "0.5px", color: "rgba(255,255,255,0.8)" }}>Viral Events</h3>
          <div style={{ background: "var(--bg-card)", border: "1px solid rgba(255,59,48,0.2)", borderRadius: "16px", overflow: "hidden" }}>
            {alerts.map((a, i) => (
              <div key={i} style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: i < alerts.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: "4px" }}>Breakout Detected</div>
                  <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>{new Date(a.detected_at).toLocaleString()}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: "#FF5238", fontWeight: 700, fontSize: "16px" }}>+{(a.growth_factor * 100).toFixed(1)}% Spike</div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{formatNumber(a.previous_count)} → {formatNumber(a.current_count)}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
