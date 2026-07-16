"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, Legend } from "recharts";

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

const COLORS = ["#FF3B30", "#34C759", "#007AFF", "#AF52DE"]; // Red, Green, Blue, Purple

function SongSearch({ onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const delay = setTimeout(() => {
      setLoading(true);
      fetch(`${API}/api/search/global?q=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((data) => {
          setResults(data.songs || []);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Search error:", err);
          setLoading(false);
        });
    }, 300);
    return () => clearTimeout(delay);
  }, [query]);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        type="text"
        placeholder="Search for a song..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: "100%", padding: "12px 16px", borderRadius: "12px", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", color: "#fff", outline: "none", fontSize: "14px" }}
      />
      {loading && <div style={{ position: "absolute", right: "16px", top: "12px", color: "var(--text-muted)", fontSize: "12px" }}>Searching...</div>}
      {results.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: "8px", background: "var(--bg-card)", border: "1px solid var(--border-active)", borderRadius: "12px", maxHeight: "300px", overflowY: "auto", zIndex: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
          {results.map((song) => (
            <div
              key={song.id}
              onClick={() => {
                onSelect(song);
                setQuery("");
                setResults([]);
              }}
              style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", borderBottom: "1px solid var(--border-subtle)", transition: "background 0.2s" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <img src={song.thumbnail_url || "https://via.placeholder.com/40"} alt="" style={{ width: "40px", height: "40px", borderRadius: "6px", objectFit: "cover" }} />
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600 }}>{song.title}</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{song.artist_name}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ComparePage() {
  const [slots, setSlots] = useState([null, null, null, null]);
  const [songData, setSongData] = useState({}); // id -> detailed data (history, etc)

  const handleSelect = async (index, song) => {
    const newSlots = [...slots];
    newSlots[index] = song;
    setSlots(newSlots);

    if (song && !songData[song.id]) {
      try {
        const res = await fetch(`${API}/api/songs/${song.id}/history`);
        const data = await res.json();
        // Parse dates for the chart
        const formattedHistory = data.history.map((item) => ({
          ...item,
          dateLabel: new Date(item.collected_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        }));
        setSongData((prev) => ({ ...prev, [song.id]: { ...data, history: formattedHistory } }));
      } catch (err) {
        console.error("Failed to load song history", err);
      }
    }
  };

  const handleRemove = (index) => {
    const newSlots = [...slots];
    newSlots[index] = null;
    setSlots(newSlots);
  };

  // Build unified chart data
  const chartDataMap = {};
  slots.forEach((song, i) => {
    if (song && songData[song.id]) {
      const history = songData[song.id].history;
      history.forEach((point) => {
        if (!chartDataMap[point.dateLabel]) chartDataMap[point.dateLabel] = { dateLabel: point.dateLabel };
        chartDataMap[point.dateLabel][`song_${i}`] = point.play_count;
      });
    }
  });

  const chartData = Object.values(chartDataMap).sort((a, b) => new Date(a.dateLabel + " 2026") - new Date(b.dateLabel + " 2026"));

  return (
    <div className="symphony-page-container">
      <div style={{ marginBottom: "30px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: "0 0 8px 0", fontSize: "32px", fontWeight: 800, letterSpacing: "-0.5px" }}>Song Comparison</h1>
          <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>Compare growth trajectories and audience sentiment across up to 4 songs.</div>
        </div>
      </div>

      {/* Selectors Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "20px", marginBottom: "40px" }}>
        {slots.map((song, i) => (
          <div key={i} style={{ background: "var(--bg-card)", border: `2px solid ${song ? COLORS[i] : "var(--border-subtle)"}`, borderRadius: "16px", padding: "20px", display: "flex", flexDirection: "column", gap: "16px", position: "relative", overflow: "visible" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: song ? COLORS[i] : "var(--text-muted)" }}>Slot {i + 1}</div>
            
            {!song ? (
              <SongSearch onSelect={(s) => handleSelect(i, s)} />
            ) : (
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <img src={song.thumbnail_url || "https://via.placeholder.com/60"} alt={song.title} style={{ width: "60px", height: "60px", borderRadius: "8px", objectFit: "cover" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: "4px" }}>{song.title}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{song.artist_name}</div>
                </div>
                <button 
                  onClick={() => handleRemove(i)}
                  style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "20px", padding: "4px" }}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Unified Chart */}
      {slots.some(s => s) && (
        <div style={{ marginBottom: "40px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", letterSpacing: "0.5px", color: "rgba(255,255,255,0.8)" }}>Comparison Trajectory</h3>
          <div style={{ width: "100%", height: "350px", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "16px", padding: "24px 24px 24px 0" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="dateLabel" stroke="rgba(255,255,255,0.3)" fontSize={12} tickMargin={10} axisLine={false} tickLine={false} />
                <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} tickFormatter={(val) => formatNumber(val)} axisLine={false} tickLine={false} width={70} />
                <Tooltip 
                  contentStyle={{ background: "#14141F", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff" }}
                  itemStyle={{ color: "#fff", fontWeight: 600 }}
                  formatter={(value, name) => {
                    const slotIndex = parseInt(name.split("_")[1]);
                    const songTitle = slots[slotIndex]?.title || "Unknown";
                    return [value.toLocaleString(), songTitle];
                  }}
                />
                <Legend 
                  formatter={(value) => {
                    const slotIndex = parseInt(value.split("_")[1]);
                    return slots[slotIndex]?.title || "Unknown";
                  }}
                />
                {slots.map((song, i) => (
                  song && songData[song.id] && (
                    <Line 
                      key={i} 
                      type="monotone" 
                      dataKey={`song_${i}`} 
                      stroke={COLORS[i]} 
                      strokeWidth={3} 
                      dot={{ fill: COLORS[i], strokeWidth: 0, r: 4 }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  )
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* KPI Grid Comparison */}
      {slots.some(s => s) && (
        <div style={{ overflowX: "auto" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", letterSpacing: "0.5px", color: "rgba(255,255,255,0.8)" }}>Metrics Breakdown</h3>
          <table style={{ width: "100%", minWidth: "800px", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "16px", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-muted)", fontSize: "12px", textTransform: "uppercase" }}>Metric</th>
                {slots.map((song, i) => (
                  <th key={i} style={{ width: "20%", textAlign: "left", padding: "16px", borderBottom: "1px solid var(--border-subtle)", borderLeft: "1px solid var(--border-subtle)", color: COLORS[i], fontSize: "14px", fontWeight: 700 }}>
                    {song ? song.title : "-"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Current Views */}
              <tr>
                <td style={{ padding: "16px", borderBottom: "1px solid var(--border-subtle)", fontWeight: 600, fontSize: "14px" }}>Current Views</td>
                {slots.map((song, i) => {
                  const sData = songData[song?.id];
                  const latest = sData?.history?.length > 0 ? sData.history[sData.history.length - 1] : null;
                  return <td key={i} style={{ padding: "16px", borderBottom: "1px solid var(--border-subtle)", borderLeft: "1px solid var(--border-subtle)" }}>{latest ? formatNumber(latest.play_count) : "-"}</td>;
                })}
              </tr>
              {/* Growth */}
              <tr>
                <td style={{ padding: "16px", borderBottom: "1px solid var(--border-subtle)", fontWeight: 600, fontSize: "14px" }}>Growth (Period)</td>
                {slots.map((song, i) => {
                  const sData = songData[song?.id];
                  const latest = sData?.history?.length > 0 ? sData.history[sData.history.length - 1] : null;
                  const first = sData?.history?.length > 0 ? sData.history[0] : null;
                  const growth = latest && first ? latest.play_count - first.play_count : 0;
                  const pct = latest && first && first.play_count > 0 ? ((growth / first.play_count) * 100).toFixed(1) : 0;
                  return (
                    <td key={i} style={{ padding: "16px", borderBottom: "1px solid var(--border-subtle)", borderLeft: "1px solid var(--border-subtle)", color: growth > 0 ? "#34C759" : growth < 0 ? "#FF3B30" : "inherit" }}>
                      {song && sData ? `${growth > 0 ? "+" : ""}${formatNumber(growth)} (${growth > 0 ? "+" : ""}${pct}%)` : "-"}
                    </td>
                  );
                })}
              </tr>
              {/* Likes */}
              <tr>
                <td style={{ padding: "16px", borderBottom: "1px solid var(--border-subtle)", fontWeight: 600, fontSize: "14px" }}>Likes</td>
                {slots.map((song, i) => {
                  const sData = songData[song?.id];
                  const latest = sData?.history?.length > 0 ? sData.history[sData.history.length - 1] : null;
                  return <td key={i} style={{ padding: "16px", borderBottom: "1px solid var(--border-subtle)", borderLeft: "1px solid var(--border-subtle)" }}>{latest ? formatNumber(latest.like_count) : "-"}</td>;
                })}
              </tr>
              {/* Dislikes */}
              <tr>
                <td style={{ padding: "16px", borderBottom: "1px solid var(--border-subtle)", fontWeight: 600, fontSize: "14px" }}>Dislikes</td>
                {slots.map((song, i) => {
                  const sData = songData[song?.id];
                  const latest = sData?.history?.length > 0 ? sData.history[sData.history.length - 1] : null;
                  return <td key={i} style={{ padding: "16px", borderBottom: "1px solid var(--border-subtle)", borderLeft: "1px solid var(--border-subtle)" }}>{latest ? formatNumber(latest.dislike_count) : "-"}</td>;
                })}
              </tr>
              {/* Sentiment Score */}
              <tr>
                <td style={{ padding: "16px", borderBottom: "1px solid var(--border-subtle)", fontWeight: 600, fontSize: "14px" }}>Sentiment Score</td>
                {slots.map((song, i) => {
                  const sData = songData[song?.id];
                  const score = sData?.song?.sentiment_score;
                  if (!song || !sData || score === null || score === undefined) return <td key={i} style={{ padding: "16px", borderBottom: "1px solid var(--border-subtle)", borderLeft: "1px solid var(--border-subtle)" }}>-</td>;
                  const emoji = score > 0.3 ? "😊" : score < -0.3 ? "😠" : "😐";
                  const color = score > 0.3 ? "#34C759" : score < -0.3 ? "#FF3B30" : "#FFF";
                  return (
                    <td key={i} style={{ padding: "16px", borderBottom: "1px solid var(--border-subtle)", borderLeft: "1px solid var(--border-subtle)" }}>
                      <span style={{ fontSize: "18px", marginRight: "8px" }}>{emoji}</span>
                      <span style={{ color, fontWeight: 700 }}>{score}</span>
                    </td>
                  );
                })}
              </tr>
              {/* Sentiment Summary */}
              <tr>
                <td style={{ padding: "16px", borderBottom: "1px solid var(--border-subtle)", fontWeight: 600, fontSize: "14px" }}>Audience Feedback</td>
                {slots.map((song, i) => {
                  const sData = songData[song?.id];
                  const summary = sData?.song?.sentiment_summary;
                  return (
                    <td key={i} style={{ padding: "16px", borderBottom: "1px solid var(--border-subtle)", borderLeft: "1px solid var(--border-subtle)", fontSize: "13px", lineHeight: "1.5", color: "var(--text-muted)" }}>
                      {summary || "-"}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
