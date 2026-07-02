"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { TableVirtuoso } from "react-virtuoso";
import { formatDate, formatDateTime } from "../../utils/dateFormat";

const API = process.env.NEXT_PUBLIC_API_URL || "";

function formatNumber(num) {
  if (!num && num !== 0) return "—";
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + "B";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return Number(num).toLocaleString();
}

const SORT_OPTIONS = [
  { value: "popularity", label: "Popularity", defaultDir: "desc" },
  { value: "songs", label: "Songs", defaultDir: "desc" },
  { value: "name", label: "Name", defaultDir: "asc" },
  { value: "genre", label: "Genre", defaultDir: "asc" },
  { value: "region", label: "Region", defaultDir: "asc" },
  { value: "recency", label: "Latest Release", defaultDir: "desc" },
];

function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (val) => {
    const next = selected.includes(val)
      ? selected.filter((v) => v !== val)
      : [...selected, val];
    onChange(next);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: "7px 12px",
          background: "var(--bg-secondary)",
          border: selected.length
            ? "1px solid var(--sp-green)"
            : "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-sm)",
          color: selected.length ? "var(--text-primary)" : "var(--text-muted)",
          fontSize: "0.82rem",
          fontFamily: "Inter, sans-serif",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
          whiteSpace: "nowrap",
        }}
      >
        {selected.length ? `${label} (${selected.length})` : label}
        <span style={{ fontSize: "0.6rem", marginLeft: 2 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "110%",
            left: 0,
            zIndex: 50,
            background: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            maxHeight: 260,
            overflowY: "auto",
            minWidth: 200,
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              style={{
                width: "100%",
                padding: "6px 12px",
                background: "transparent",
                border: "none",
                borderBottom: "1px solid var(--border-subtle)",
                color: "var(--text-muted)",
                fontSize: "0.78rem",
                cursor: "pointer",
                fontFamily: "Inter, sans-serif",
                textAlign: "left",
              }}
            >
              ✕ Clear all
            </button>
          )}
          {options.map((opt) => (
            <label
              key={opt}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                cursor: "pointer",
                fontSize: "0.82rem",
                color: "var(--text-primary)",
                background: selected.includes(opt) ? "rgba(29,185,84,0.12)" : "transparent",
              }}
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                style={{ accentColor: "var(--sp-green)" }}
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SpotifyDashboard() {
  const [viral, setViral] = useState([]);
  const [releases, setReleases] = useState([]);
  const [artists, setArtists] = useState([]);
  const [stats, setStats] = useState(null);
  const [filterOptions, setFilterOptions] = useState({ genres: [], regions: [] });
  const [search, setSearch] = useState("");
  const [genres, setGenres] = useState([]);
  const [regions, setRegions] = useState([]);
  const [sortBy, setSortBy] = useState("popularity");
  const [sortDir, setSortDir] = useState("desc");
  const [watchedOnly, setWatchedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [addingArtist, setAddingArtist] = useState(false);
  const [addMsg, setAddMsg] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [globalQ, setGlobalQ] = useState("");
  const [globalResults, setGlobalResults] = useState(null);
  const globalRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (globalRef.current && !globalRef.current.contains(e.target)) {
        setGlobalResults(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleGlobalSearch = (val) => {
    setGlobalQ(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setGlobalResults(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API}/api/spotify/search/global?q=${encodeURIComponent(val)}`
        ).then((r) => r.json());
        setGlobalResults(res);
      } catch {
        setGlobalResults(null);
      }
    }, 300);
  };

  const fetchData = useCallback(async () => {
    try {
      const [viralRes, releasesRes, statsRes, filtersRes] = await Promise.all([
        fetch(`${API}/api/spotify/viral?limit=12`).then((r) => r.json()),
        fetch(`${API}/api/spotify/releases?days=7`).then((r) => r.json()),
        fetch(`${API}/api/spotify/stats`).then((r) => r.json()),
        fetch(`${API}/api/filters`).then((r) => r.json()),
      ]);
      setViral(viralRes.viral || []);
      setReleases(releasesRes.releases || []);
      setStats(statsRes || null);
      setFilterOptions(filtersRes || { genres: [], regions: [] });
    } catch (e) {
      console.error("Failed to fetch Spotify dashboard data:", e);
    }
  }, []);

  const fetchArtists = useCallback(async () => {
    if (page === 1) setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: 50,
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      if (search) params.set("search", search);
      if (genres.length) params.set("genre", genres.join(","));
      if (regions.length) params.set("region", regions.join(","));
      if (watchedOnly) params.set("watched_only", "true");

      const res = await fetch(`${API}/api/spotify/artists?${params}`).then((r) => r.json());
      if (page === 1) {
        setArtists(res.artists || []);
      } else {
        setArtists(prev => {
            const newIds = new Set((res.artists || []).map(a => a.id));
            const filteredPrev = prev.filter(a => !newIds.has(a.id));
            return [...filteredPrev, ...(res.artists || [])];
        });
      }
      setTotalPages(res.pages || 1);
      setTotal(res.total || 0);
    } catch (e) {
      console.error("Failed to fetch Spotify artists:", e);
    }
    setLoading(false);
  }, [page, search, genres, regions, sortBy, sortDir, watchedOnly]);

  const loadMore = useCallback(() => {
    if (!loading && page < totalPages) {
        setPage(p => p + 1);
    }
  }, [loading, page, totalPages]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const [viralRes, releasesRes, statsRes, filtersRes] = await Promise.all([
          fetch(`${API}/api/spotify/viral?limit=12`).then((r) => r.json()),
          fetch(`${API}/api/spotify/releases?days=7`).then((r) => r.json()),
          fetch(`${API}/api/spotify/stats`).then((r) => r.json()),
          fetch(`${API}/api/filters`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setViral(viralRes.viral || []);
        setReleases(releasesRes.releases || []);
        setStats(statsRes || null);
        setFilterOptions(filtersRes || { genres: [], regions: [] });
      } catch (e) {
        console.error("Failed to fetch Spotify dashboard data:", e);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page,
          limit: 50,
          sort_by: sortBy,
          sort_dir: sortDir,
        });
        if (search) params.set("search", search);
        if (genres.length) params.set("genre", genres.join(","));
        if (regions.length) params.set("region", regions.join(","));
        if (watchedOnly) params.set("watched_only", "true");

        const res = await fetch(`${API}/api/spotify/artists?${params}`).then((r) => r.json());
        if (cancelled) return;
        setArtists(res.artists || []);
        setTotalPages(res.pages || 1);
        setTotal(res.total || 0);
      } catch (e) {
        console.error("Failed to fetch Spotify artists:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [page, search, genres, regions, sortBy, sortDir, watchedOnly]);

  const toggleWatch = async (artistId) => {
    try {
      await fetch(`${API}/api/artist/${artistId}/watch`, { method: "POST" });
      fetchArtists();
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const deleteArtist = async (artistId, artistName) => {
    if (!confirm(`Delete "${artistName}" and all their songs? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API}/api/artist/${artistId}`, { method: "DELETE" });
      if (res.ok) { fetchArtists(); fetchData(); }
    } catch (e) { console.error(e); }
  };

  const handleRefresh = async (type) => {
    setRefreshing(type);
    try {
      await fetch(`${API}/api/refresh/${type}`, { method: "POST" });
      const poll = setInterval(async () => {
        const res = await fetch(`${API}/api/refresh/status`).then((r) => r.json());
        if (!res.running) {
          clearInterval(poll);
          setRefreshing(false);
          // Re-fetch dashboard data
          const [viralRes, releasesRes, statsRes] = await Promise.all([
            fetch(`${API}/api/spotify/viral?limit=12`).then((r) => r.json()),
            fetch(`${API}/api/spotify/releases?days=7`).then((r) => r.json()),
            fetch(`${API}/api/spotify/stats`).then((r) => r.json()),
          ]);
          setViral(viralRes.viral || []);
          setReleases(releasesRes.releases || []);
          setStats(statsRes || null);
        }
      }, 5000);
    } catch (e) {
      console.error(e);
      setRefreshing(false);
    }
  };

  const handleAddArtist = async () => {
    if (!addUrl.trim()) return;
    setAddingArtist(true);
    setAddMsg(null);
    try {
      const res = await fetch(`${API}/api/artist/add-by-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: addUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddMsg(`❌ ${data.detail || "Failed to add artist"}`);
      } else if (data.status === "exists") {
        const platform = data.platform === "spotify" ? "🎧" : "▶";
        setAddMsg(`${platform} "${data.artist.name}" already exists. Refreshing songs...`);
      } else {
        const platform = data.platform === "spotify" ? "🎧" : "▶";
        setAddMsg(`✅ ${platform} Added "${data.artist.name}". Songs loading...`);
        setAddUrl("");
        setTimeout(() => {
          fetchArtists();
          fetchData();
        }, 3000);
        setTimeout(() => {
          setAddMsg(null);
          setShowAddForm(false);
        }, 5000);
      }
    } catch {
      setAddMsg("❌ Error adding artist");
    }
    setAddingArtist(false);
  };

  const handleSort = (value) => {
    if (sortBy === value) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      const opt = SORT_OPTIONS.find((o) => o.value === value);
      setSortBy(value);
      setSortDir(opt?.defaultDir || "asc");
    }
    setPage(1);
  };

  const clearFilters = () => {
    setSearch("");
    setGenres([]);
    setRegions([]);
    setWatchedOnly(false);
    setSortBy("popularity");
    setSortDir("desc");
    setPage(1);
  };

  const hasActiveFilters =
    search || genres.length || regions.length || watchedOnly || sortBy !== "popularity";

  const inputStyle = {
    padding: "8px 14px",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-primary)",
    fontSize: "0.85rem",
    fontFamily: "Inter, sans-serif",
    outline: "none",
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ flex: 1, minWidth: 320 }}>
          <h1 className="page-title">
            <span style={{ color: "var(--sp-green)" }}>🎧</span>{" "}
            <span className="symphony-brand" style={{ fontSize: "1.8rem" }}>
              symphony
            </span>{" "}
            <span
              style={{
                fontSize: "0.6em",
                color: "var(--text-muted)",
                fontWeight: 400,
                fontStyle: "normal",
              }}
            >
              Spotify Analytics
            </span>
          </h1>
          <p className="page-subtitle">
            Tracking {stats?.total_artists || 0} artists • {stats?.spotify_songs || 0} tracks monitored
            {stats?.last_collection?.last_run && (
              <span style={{ marginLeft: 12, fontSize: "0.78rem", color: "var(--text-muted)" }}>
                🕐 Last refreshed: {formatDateTime(stats.last_collection.last_run)}
              </span>
            )}
          </p>

          <div ref={globalRef} style={{ position: "relative", marginTop: 12, maxWidth: 500 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                background: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <span style={{ fontSize: "1rem" }}>🔍</span>
              <input
                type="text"
                placeholder="Search artists or tracks..."
                value={globalQ}
                onChange={(e) => handleGlobalSearch(e.target.value)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--text-primary)",
                  fontSize: "0.9rem",
                  fontFamily: "Inter, sans-serif",
                }}
              />
              {globalQ && (
                <button
                  onClick={() => {
                    setGlobalQ("");
                    setGlobalResults(null);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                  }}
                >
                  ✕
                </button>
              )}
            </div>
            {globalResults && (
              <div
                style={{
                  position: "absolute",
                  top: "110%",
                  left: 0,
                  right: 0,
                  zIndex: 100,
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  maxHeight: 400,
                  overflowY: "auto",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                }}
              >
                {globalResults.artists?.length > 0 && (
                  <div>
                    <div
                      style={{
                        padding: "8px 14px",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      Artists
                    </div>
                    {globalResults.artists.map((a) => (
                      <Link
                        key={a.id}
                        href={`/spotify/artist/${a.id}`}
                        onClick={() => setGlobalResults(null)}
                      >
                        <div
                          style={{
                            padding: "8px 14px",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            cursor: "pointer",
                            borderBottom: "1px solid rgba(255,255,255,0.03)",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: "50%",
                              background: "linear-gradient(135deg, var(--sp-green), #1ed760)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 700,
                              fontSize: "0.75rem",
                              color: "white",
                            }}
                          >
                            {a.name.charAt(0)}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                              {a.name}
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                              {a.genre} • {a.spotify_song_count || 0} tracks •{" "}
                              {formatNumber(a.total_sp_popularity || 0)} popularity
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
                {globalResults.songs?.length > 0 && (
                  <div>
                    <div
                      style={{
                        padding: "8px 14px",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      Tracks
                    </div>
                    {globalResults.songs.map((s) => (
                      <Link
                        key={s.id}
                        href={`/spotify/artist/${s.artist_id}`}
                        onClick={() => setGlobalResults(null)}
                      >
                        <div
                          style={{
                            padding: "8px 14px",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            cursor: "pointer",
                            borderBottom: "1px solid rgba(255,255,255,0.03)",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          {s.thumbnail_url ? (
                            <img
                              src={s.thumbnail_url}
                              alt=""
                              style={{ width: 36, height: 36, borderRadius: 4, objectFit: "cover" }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 4,
                                background: "var(--bg-secondary)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "0.8rem",
                                color: "var(--text-muted)",
                              }}
                            >
                              🎵
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: "0.85rem",
                                color: "var(--text-primary)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {s.title}
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                              {s.artist_name} • {formatNumber(s.latest_play_count)} popularity
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
                {!globalResults.artists?.length && !globalResults.songs?.length && (
                  <div style={{ padding: "16px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    No results found
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              onClick={() => handleRefresh("spotify_stats")}
              disabled={refreshing}
              style={{
                padding: "8px 16px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--sp-green)",
                background: refreshing === "spotify_stats" ? "rgba(29,185,84,0.15)" : "rgba(29,185,84,0.1)",
                color: "var(--sp-green)",
                fontSize: "0.82rem",
                fontWeight: 600,
                fontFamily: "Inter, sans-serif",
                cursor: refreshing ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {refreshing === "spotify_stats" ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderTopColor: "var(--sp-green)" }}></span>
                  Updating stats...
                </>
              ) : (
                <>📊 Refresh Stats</>
              )}
            </button>
            <button
              onClick={() => handleRefresh("spotify_discover")}
              disabled={refreshing}
              style={{
                padding: "8px 16px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid #a78bfa",
                background: refreshing === "spotify_discover" ? "rgba(167,139,250,0.15)" : "rgba(167,139,250,0.1)",
                color: "#a78bfa",
                fontSize: "0.82rem",
                fontWeight: 600,
                fontFamily: "Inter, sans-serif",
                cursor: refreshing ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {refreshing === "spotify_discover" ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderTopColor: "#a78bfa" }}></span>
                  Finding tracks...
                </>
              ) : (
                <>🔍 Find New Tracks</>
              )}
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              style={{
                padding: "8px 20px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-subtle)",
                background: showAddForm ? "rgba(255,255,255,0.1)" : "var(--bg-secondary)",
                color: "var(--text-primary)",
                fontSize: "0.85rem",
                fontWeight: 600,
                fontFamily: "Inter, sans-serif",
                cursor: "pointer",
              }}
            >
              {showAddForm ? "✕ Close" : "＋ Add Artist"}
            </button>
          </div>

          <div
            style={{
              padding: "8px 16px",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: "0.78rem",
              fontFamily: "Inter, sans-serif",
              color: "var(--text-secondary)",
              minWidth: 260,
              justifyContent: "space-between"
            }}
          >
            <span style={{ fontWeight: 700, color: "var(--sp-green)" }}>🎧 Spotify API</span>
            <span style={{ color: "var(--text-muted)" }}>
              {stats?.total_artists || 0} artists • {stats?.spotify_songs || 0} tracks
            </span>
          </div>
        </div>

        {showAddForm && (
          <div
            style={{
              width: "100%",
              marginTop: 8,
              padding: "16px 20px",
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ flex: 1, position: "relative" }}>
                <input
                  type="text"
                  placeholder="Paste YouTube or Spotify artist URL..."
                  value={addUrl}
                  onChange={(e) => setAddUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddArtist()}
                  style={{ ...inputStyle, width: "100%", paddingLeft: 36 }}
                />
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: "0.9rem", opacity: 0.5 }}>🔗</span>
              </div>
              <button
                onClick={handleAddArtist}
                disabled={addingArtist || !addUrl.trim()}
                style={{
                  padding: "8px 20px",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  background: "var(--sp-green)",
                  color: "white",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  fontFamily: "Inter, sans-serif",
                  cursor: addingArtist ? "not-allowed" : "pointer",
                  opacity: addingArtist ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {addingArtist ? "Resolving..." : "Add Artist"}
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Examples: <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 3 }}>open.spotify.com/artist/6vEZo...</code> or <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 3 }}>youtube.com/@agsyworld</code>
            </div>
            {addMsg && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: "0.82rem",
                  color: addMsg.startsWith("✅") ? "#4ade80" : addMsg.startsWith("❌") ? "#ef4444" : "var(--text-muted)",
                }}
              >
                {addMsg}
              </div>
            )}
          </div>
        )}
      </div>

      {stats && (
        <div className="stats-grid">
          <div className="stat-card sp">
            <div className="stat-value">{formatNumber(stats.spotify_songs)}</div>
            <div className="stat-label">Tracks Tracked</div>
          </div>
          <div className="stat-card viral">
            <div className="stat-value">{stats.viral_alerts}</div>
            <div className="stat-label">Viral Alerts</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.watched_artists}</div>
            <div className="stat-label">Watching</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.total_artists}</div>
            <div className="stat-label">Total Artists</div>
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-header">
          <h2 className="section-title">
            <span className="icon">🔥</span> What&apos;s Hot?
          </h2>
        </div>
        {viral.length > 0 ? (
          <div className="viral-grid">
            {viral.map((v) => (
              <Link href={`/spotify/artist/${v.artist_id}`} key={v.alert_id}>
                <div className="viral-card">
                  {v.thumbnail_url ? (
                    <img src={v.thumbnail_url} alt={v.title} className="viral-thumbnail" />
                  ) : (
                    <div
                      className="viral-thumbnail"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.5rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      🎵
                    </div>
                  )}
                  <div className="viral-info">
                    <div className="viral-title">{v.title}</div>
                    <div className="viral-artist">{v.artist_name}</div>
                    <div className="viral-stats">
                      <span className="viral-badge">
                        +{v.popularity_delta ?? (v.current_count || 0) - (v.previous_count || 0)}
                      </span>
                      <span className="viral-views">
                        {formatNumber(v.previous_count)} → {formatNumber(v.current_count)} popularity
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="emoji">📊</div>
            <p>No Spotify viral alerts yet. Run Spotify collection to start detecting popularity spikes.</p>
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-header">
          <h2 className="section-title">
            <span className="icon">🆕</span> What&apos;s New?
          </h2>
          <span className="section-link">Past 7 days</span>
        </div>

        {/* Watched Artists Row */}
        {(releases.watched?.length > 0 || releases.other?.length > 0) ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            {releases.watched?.length > 0 && (
              <div>
                <h3 style={{ fontSize: "1rem", color: "var(--sp-green)", marginBottom: "1rem", fontWeight: 700 }}>
                  ♥ From Your Favourites
                </h3>
                <div className="release-grid">
                  {releases.watched.map(r => (
                    <Link href={`/spotify/artist/${r.artist_id}`} key={r.song_id}>
                      <div className="release-card">
                        {r.thumbnail_url ? <img src={r.thumbnail_url} alt={r.title} className="release-thumb" /> : <div className="release-thumb" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem", color: "var(--text-muted)" }}>🎵</div>}
                        <div className="release-body">
                          <div className="release-title">{r.title}</div>
                          <div className="release-artist">{r.artist_name}</div>
                          <div className="release-date">📅 {formatDate(r.release_date)} • {formatNumber(r.latest_play_count)} popularity</div>
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
                    <Link href={`/spotify/artist/${r.artist_id}`} key={r.song_id}>
                      <div className="release-card">
                        {r.thumbnail_url ? <img src={r.thumbnail_url} alt={r.title} className="release-thumb" /> : <div className="release-thumb" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem", color: "var(--text-muted)" }}>🎵</div>}
                        <div className="release-body">
                          <div className="release-title">{r.title}</div>
                          <div className="release-artist">{r.artist_name}</div>
                          <div className="release-date">📅 {formatDate(r.release_date)} • {formatNumber(r.latest_play_count)} popularity</div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state">
            <div className="emoji">👀</div><p>No new Spotify releases found in the past 7 days.</p>
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-header">
          <h2 className="section-title">
            <span className="icon">🏆</span> Artist Leaderboard
            <span style={{ fontSize: "0.8rem", fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>
              ({total})
            </span>
          </h2>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            marginBottom: "1rem",
            alignItems: "center",
            padding: "12px 14px",
            background: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <div className="search-bar" style={{ maxWidth: 200 }}>
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="search-input spotify"
              placeholder="Search..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <MultiSelect
            label="Genre"
            options={filterOptions.genres}
            selected={genres}
            onChange={(v) => {
              setGenres(v);
              setPage(1);
            }}
          />
          <MultiSelect
            label="Region"
            options={filterOptions.regions}
            selected={regions}
            onChange={(v) => {
              setRegions(v);
              setPage(1);
            }}
          />

          <button
            onClick={() => {
              setWatchedOnly(!watchedOnly);
              setPage(1);
            }}
            style={{
              padding: "7px 14px",
              borderRadius: "var(--radius-sm)",
              border: watchedOnly ? "1px solid #ef4444" : "1px solid var(--border-subtle)",
              background: watchedOnly ? "rgba(239,68,68,0.15)" : "var(--bg-secondary)",
              color: watchedOnly ? "#ef4444" : "var(--text-muted)",
              fontSize: "0.82rem",
              fontWeight: 600,
              fontFamily: "Inter, sans-serif",
              cursor: "pointer",
            }}
          >
            {watchedOnly ? "♥ Favourites" : "♡ Favourites"}
          </button>

          <div style={{ width: 1, height: 24, background: "var(--border-subtle)", margin: "0 2px" }} />

          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleSort(opt.value)}
                style={{
                  padding: "4px 10px",
                  borderRadius: "var(--radius-sm)",
                  border: sortBy === opt.value ? "1px solid var(--sp-green)" : "1px solid var(--border-subtle)",
                  background: sortBy === opt.value ? "rgba(29,185,84,0.12)" : "var(--bg-secondary)",
                  color: sortBy === opt.value ? "var(--sp-green)" : "var(--text-secondary)",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  fontFamily: "Inter, sans-serif",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                {opt.label}
                {sortBy === opt.value && <span style={{ fontSize: "0.65rem" }}>{sortDir === "desc" ? "↓" : "↑"}</span>}
              </button>
            ))}
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              style={{
                padding: "4px 10px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-subtle)",
                background: "transparent",
                color: "var(--text-muted)",
                fontSize: "0.75rem",
                fontFamily: "Inter, sans-serif",
                cursor: "pointer",
                marginLeft: "auto",
              }}
            >
              ✕ Clear
            </button>
          )}
        </div>

        {loading && page === 1 ? (
          <div className="loading">
            <div className="spinner" style={{ borderTopColor: "var(--sp-green)" }}></div>
            Loading...
          </div>
        ) : artists.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">🔍</div>
            <p>No artists match your filters.</p>
          </div>
        ) : (
          <div style={{ height: "70vh", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "var(--bg-card)" }}>
            <TableVirtuoso
                data={artists}
                endReached={loadMore}
                style={{ height: "100%" }}
                components={{
                    Table: ({ style, ...props }) => <table {...props} style={{ ...style, width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", fontFamily: "Inter, sans-serif" }} />,
                    TableHead: React.forwardRef(({ style, ...props }, ref) => <thead {...props} ref={ref} style={{ ...style, position: "sticky", top: 0, zIndex: 10, background: "var(--bg-secondary)" }} />),
                    TableRow: (props) => <tr {...props} style={{ borderBottom: "1px solid var(--border-subtle)", transition: "background 0.12s ease" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"} />
                }}
                fixedHeaderContent={() => (
                    <tr>
                    {["#", "Artist", "Genre", "Region", "Tracks", "Popularity", "Latest Release", ""].map((h, i) => (
                        <th
                        key={i}
                        style={{
                            padding: "10px 12px",
                            textAlign: i >= 4 ? "right" : "left",
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
                )}
                itemContent={(index, a) => {
                    const rank = index + 1;
                    return (
                        <>
                        <td
                            style={{
                            padding: "10px 12px",
                            fontWeight: 700,
                            width: 40,
                            color: rank <= 3 ? "var(--sp-green)" : "var(--text-muted)",
                            fontSize: rank <= 3 ? "1rem" : "0.85rem",
                            borderBottom: "1px solid var(--border-subtle)"
                            }}
                        >
                            {rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] : rank}
                        </td>

                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                            <Link
                            href={`/spotify/artist/${a.id}`}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                textDecoration: "none",
                                color: "var(--text-primary)",
                            }}
                            >
                            {a.image_url ? (
                                <img
                                src={a.image_url}
                                alt={a.name}
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: "50%",
                                    objectFit: "cover",
                                    flexShrink: 0,
                                }}
                                />
                            ) : (
                                <div
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: "50%",
                                    background: "linear-gradient(135deg, var(--sp-green), #1ed760)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontWeight: 700,
                                    fontSize: "0.85rem",
                                    color: "white",
                                    flexShrink: 0,
                                }}
                                >
                                {a.name.charAt(0)}
                                </div>
                            )}
                            <span style={{ fontWeight: 600 }}>{a.name}</span>
                            </Link>
                        </td>

                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                            <span
                            style={{
                                padding: "2px 8px",
                                borderRadius: "12px",
                                fontSize: "0.72rem",
                                background: "rgba(255,255,255,0.06)",
                                color: "var(--text-secondary)",
                            }}
                            >
                            {a.genre || "—"}
                            </span>
                        </td>

                        <td style={{ padding: "10px 12px", color: "var(--text-secondary)", fontSize: "0.82rem", borderBottom: "1px solid var(--border-subtle)" }}>
                            {a.region ? `📍 ${a.region}` : "—"}
                        </td>

                        <td
                            style={{
                            padding: "10px 12px",
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                            color: "var(--text-primary)",
                            borderBottom: "1px solid var(--border-subtle)"
                            }}
                        >
                            {a.spotify_song_count || 0}
                        </td>

                        <td
                            style={{
                            padding: "10px 12px",
                            textAlign: "right",
                            fontWeight: 600,
                            fontVariantNumeric: "tabular-nums",
                            color: a.total_sp_popularity ? "var(--text-primary)" : "var(--text-muted)",
                            borderBottom: "1px solid var(--border-subtle)"
                            }}
                        >
                            {a.total_sp_popularity ? formatNumber(a.total_sp_popularity) : "—"}
                        </td>

                        <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-muted)", fontSize: "0.8rem", borderBottom: "1px solid var(--border-subtle)" }}>
                            {formatDate(a.latest_release)}
                        </td>

                        <td style={{ padding: "10px 6px", width: 70, whiteSpace: "nowrap", borderBottom: "1px solid var(--border-subtle)" }}>
                            <button
                            onClick={(e) => {
                                e.preventDefault();
                                toggleWatch(a.id);
                            }}
                            style={{
                                background: "none",
                                border: "none",
                                color: a.is_watched ? "#ef4444" : "var(--text-muted)",
                                fontSize: "1.1rem",
                                cursor: "pointer",
                                padding: "2px 4px",
                                transition: "transform 0.15s ease",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.2)")}
                            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                            title={a.is_watched ? "Unwatch" : "Watch"}
                            >
                            {a.is_watched ? "♥" : "♡"}
                            </button>
                            <button
                            onClick={(e) => { e.preventDefault(); deleteArtist(a.id, a.name); }}
                            style={{
                                background: "none",
                                border: "none",
                                color: "var(--text-muted)",
                                fontSize: "0.9rem",
                                cursor: "pointer",
                                padding: "2px 4px",
                                transition: "all 0.15s ease",
                                opacity: 0.4,
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "#ef4444"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.4"; e.currentTarget.style.color = "var(--text-muted)"; }}
                            title="Remove artist"
                            >
                            🗑
                            </button>
                        </td>
                        </>
                    );
                }}
            />
            {loading && page > 1 && (
                <div style={{ padding: 10, textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    Loading more artists...
                </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
