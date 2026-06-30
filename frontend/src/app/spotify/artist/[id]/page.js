"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatDate, formatDateTime } from "../../../../utils/dateFormat";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function formatNumber(num) {
  if (!num && num !== 0) return "—";
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + "B";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return Number(num).toLocaleString();
}

function parseCollaborators(title) {
  const patterns = [
    /[\(\[](feat\.?|ft\.?|featuring)\s+(.+?)[\)\]]/i,
    /\s+(feat\.?|ft\.?|featuring)\s+(.+?)(\s*[\(\[]|$)/i,
    /\s+x\s+([A-Z][^\(\)\[\]]+?)(\s*[\(\[]|$)/,
  ];
  for (const p of patterns) {
    const m = title.match(p);
    if (m) {
      const collabs = (m[2] || m[1]).split(/[,&]/).map((s) => s.trim()).filter(Boolean);
      return collabs;
    }
  }
  return [];
}

export default function SpotifyArtistDetail() {
  const params = useParams();
  const artistId = params.id;

  const [data, setData] = useState(null);
  const [sortBy, setSortBy] = useState("latest_play_count");
  const [sortDir, setSortDir] = useState("desc");
  const [loading, setLoading] = useState(true);
  const [songSearch, setSongSearch] = useState("");
  const [groupByAlbum, setGroupByAlbum] = useState(false);
  const [collecting, setCollecting] = useState(false);

  const fetchDetail = () => {
    if (!artistId) return;
    setLoading(true);
    fetch(`${API}/api/spotify/artist/${artistId}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        console.error(e);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!artistId) return;
    let cancelled = false;
    const run = async () => {
      try {
        const d = await fetch(`${API}/api/spotify/artist/${artistId}`).then((r) => r.json());
        if (cancelled) return;
        setData(d);
        setLoading(false);
      } catch (e) {
        console.error(e);
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [artistId]);

  const toggleWatch = async () => {
    try {
      await fetch(`${API}/api/artist/${artistId}/watch`, { method: "POST" });
      fetchDetail();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCollect = async () => {
    setCollecting(true);
    try {
      await fetch(`${API}/api/spotify/artist/${artistId}/collect`, { method: "POST" });
      setTimeout(() => {
        fetchDetail();
        setCollecting(false);
      }, 8000);
    } catch (e) {
      console.error(e);
      setCollecting(false);
    }
  };

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="loading">
          <div className="spinner" style={{ borderTopColor: "var(--sp-green)" }}></div>
          Loading artist...
        </div>
      </div>
    );
  }

  if (!data || !data.artist) {
    return (
      <div className="page">
        <div className="empty-state">
          <div className="emoji">❌</div>
          <p>Artist not found</p>
          <Link href="/spotify" className="btn btn-secondary" style={{ marginTop: "1rem" }}>
            ← Back to Spotify Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const { artist, songs, viral_alerts } = data;

  const filtered = songSearch
    ? songs.filter((s) => s.title.toLowerCase().includes(songSearch.toLowerCase()))
    : songs;

  const sorted = [...filtered].sort((a, b) => {
    let aVal = a[sortBy];
    let bVal = b[sortBy];
    if (sortBy === "release_date" || sortBy === "title") {
      aVal = aVal || "";
      bVal = bVal || "";
      return sortDir === "desc" ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
    }
    aVal = aVal || 0;
    bVal = bVal || 0;
    return sortDir === "desc" ? bVal - aVal : aVal - bVal;
  });

  const albums = {};
  if (groupByAlbum) {
    sorted.forEach((s) => {
      const key = s.album_name || "Singles / Unknown";
      if (!albums[key]) albums[key] = [];
      albums[key].push(s);
    });
  }

  const totalPopularity = songs.reduce((sum, s) => sum + (s.latest_play_count || 0), 0);
  const avgPopularity = songs.length
    ? Math.round(totalPopularity / songs.length)
    : 0;

  const thStyle = {
    padding: "10px 12px",
    fontWeight: 600,
    color: "var(--text-muted)",
    fontSize: "0.75rem",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    borderBottom: "1px solid var(--border-subtle)",
    cursor: "pointer",
    whiteSpace: "nowrap",
    userSelect: "none",
  };

  const tdStyle = {
    padding: "8px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
  };

  const sortArrow = (col) =>
    sortBy === col ? (
      <span style={{ fontSize: "0.65rem", marginLeft: 2 }}>{sortDir === "desc" ? "↓" : "↑"}</span>
    ) : null;

  const renderSongRow = (song, i) => {
    const collabs = parseCollaborators(song.title);
    return (
      <tr
        key={song.id}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <td style={{ ...tdStyle, color: "var(--text-muted)", width: 40 }}>{i + 1}</td>
        <td style={tdStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {song.thumbnail_url ? (
              <img
                src={song.thumbnail_url}
                alt=""
                style={{ width: 40, height: 40, borderRadius: 4, objectFit: "cover", flexShrink: 0 }}
              />
            ) : (
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 4,
                  background: "var(--bg-secondary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.9rem",
                  color: "var(--text-muted)",
                  flexShrink: 0,
                }}
              >
                🎵
              </div>
            )}
            <span style={{ fontWeight: 500 }}>{song.title}</span>
          </div>
        </td>
        {!groupByAlbum && (
          <td
            style={{
              ...tdStyle,
              color: "var(--text-secondary)",
              fontSize: "0.82rem",
              maxWidth: 200,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {song.album_name || "—"}
          </td>
        )}
        <td style={{ ...tdStyle, fontSize: "0.82rem", color: "var(--text-secondary)" }}>
          {collabs.length > 0 ? collabs.join(", ") : <span style={{ color: "var(--text-muted)" }}>—</span>}
        </td>
        <td
          style={{
            ...tdStyle,
            textAlign: "right",
            fontWeight: 600,
            color: "var(--sp-green)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatNumber(song.latest_play_count)}
        </td>
        <td style={{ ...tdStyle, textAlign: "right", color: "var(--text-muted)", fontSize: "0.82rem" }}>
          {formatDate(song.release_date)}
        </td>
        <td style={{ ...tdStyle, width: 60 }}>
          {song.platform_id && (
            <a
              href={`https://open.spotify.com/track/${song.platform_id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: "3px 8px",
                fontSize: "0.72rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
                textDecoration: "none",
              }}
            >
              ↗
            </a>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="page">
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/spotify"
          style={{
            color: "var(--text-secondary)",
            fontSize: "0.85rem",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          ← Back to Spotify Dashboard
        </Link>
      </div>

      <div className="artist-hero">
        <div
          className="artist-hero-avatar"
          style={{ background: "linear-gradient(135deg, var(--sp-green-dim), var(--bg-secondary))" }}
        >
          {artist.image_url ? <img src={artist.image_url} alt={artist.name} /> : artist.name.charAt(0)}
        </div>
        <div className="artist-hero-info">
          <h1>{artist.name}</h1>
          <span className="genre-tag" style={{ background: "var(--sp-green-dim)", color: "var(--sp-green)" }}>
            {artist.genre || "Music"}
          </span>
          {artist.region && (
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "12px" }}>
              📍 {artist.region}
            </div>
          )}
          <div className="artist-hero-stats">
            <div className="artist-hero-stat">
              <div className="value">{songs.length}</div>
              <div className="label">Tracks</div>
            </div>
            <div className="artist-hero-stat">
              <div className="value" style={{ color: "var(--sp-green)" }}>
                {formatNumber(totalPopularity)}
              </div>
              <div className="label">Total Popularity</div>
            </div>
            <div className="artist-hero-stat">
              <div className="value" style={{ color: "var(--text-primary)" }}>
                {formatNumber(avgPopularity)}
              </div>
              <div className="label">Avg Popularity</div>
            </div>
            <div className="artist-hero-stat">
              <div className="value" style={{ color: "var(--viral-orange)" }}>
                {viral_alerts.length}
              </div>
              <div className="label">Viral Alerts</div>
            </div>
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "flex-start" }}>
          {songs.length === 0 && (
            <button
              onClick={handleCollect}
              disabled={collecting}
              style={{
                padding: "10px 20px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--sp-green)",
                background: "rgba(29,185,84,0.12)",
                color: "var(--sp-green)",
                fontSize: "0.85rem",
                fontWeight: 600,
                fontFamily: "Inter, sans-serif",
                cursor: collecting ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {collecting ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderTopColor: "var(--sp-green)" }}></span>
                  Collecting...
                </>
              ) : (
                "🔄 Fetch Tracks"
              )}
            </button>
          )}
          <button
            className={`btn ${artist.is_watched ? "btn-watch watching" : "btn-watch"}`}
            onClick={toggleWatch}
            style={{
              fontSize: "1rem",
              padding: "10px 24px",
              borderColor: artist.is_watched ? "var(--sp-green)" : undefined,
              color: artist.is_watched ? "var(--sp-green)" : undefined,
              background: artist.is_watched ? "var(--sp-green-dim)" : undefined,
              boxShadow: artist.is_watched ? "0 4px 15px rgba(29, 185, 84, 0.2)" : undefined,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={artist.is_watched ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="heart-icon">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
            {artist.is_watched ? "Watching" : "Watch"}
          </button>
        </div>
      </div>

      {viral_alerts.length > 0 && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">
              <span className="icon">🔥</span> Viral Alerts
            </h2>
          </div>
          <div className="viral-grid">
            {viral_alerts.map((v) => (
              <div className="viral-card" key={v.id}>
                <div className="viral-info">
                  <div className="viral-title">{v.title}</div>
                  <div className="viral-stats">
                    <span className="viral-badge">
                      +{v.popularity_delta ?? (v.current_count || 0) - (v.previous_count || 0)}
                    </span>
                    <span className="viral-views">
                      {formatNumber(v.previous_count)} → {formatNumber(v.current_count)}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "6px" }}>
                    {formatDateTime(v.detected_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-header">
          <h2 className="section-title">
            <span className="icon">🎵</span> All Tracks ({filtered.length}
            {songSearch && ` of ${songs.length}`})
          </h2>
        </div>

        {songs.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: "1rem",
              alignItems: "center",
              padding: "10px 14px",
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 180 }}>
              <span>🔍</span>
              <input
                type="text"
                placeholder="Filter tracks..."
                value={songSearch}
                onChange={(e) => setSongSearch(e.target.value)}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  fontSize: "0.85rem",
                  fontFamily: "Inter, sans-serif",
                  outline: "none",
                }}
              />
            </div>

            <button
              onClick={() => setGroupByAlbum(!groupByAlbum)}
              style={{
                padding: "6px 14px",
                borderRadius: "var(--radius-sm)",
                border: groupByAlbum ? "1px solid var(--sp-green)" : "1px solid var(--border-subtle)",
                background: groupByAlbum ? "rgba(29,185,84,0.12)" : "var(--bg-secondary)",
                color: groupByAlbum ? "var(--sp-green)" : "var(--text-secondary)",
                fontSize: "0.82rem",
                fontWeight: 600,
                fontFamily: "Inter, sans-serif",
                cursor: "pointer",
              }}
            >
              {groupByAlbum ? "📁 Grouped by Album" : "📁 Group by Album"}
            </button>
          </div>
        )}

        {songs.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            {groupByAlbum ? (
              Object.entries(albums).map(([albumName, albumSongs]) => (
                <div key={albumName} style={{ marginBottom: "1.5rem" }}>
                  <div
                    style={{
                      padding: "8px 14px",
                      background: "rgba(255,255,255,0.03)",
                      borderRadius: "var(--radius-sm)",
                      marginBottom: 6,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: "0.9rem" }}>💿</span>
                    <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                      {albumName}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      ({albumSongs.length} tracks)
                    </span>
                  </div>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "separate",
                      borderSpacing: 0,
                      fontSize: "0.85rem",
                      fontFamily: "Inter, sans-serif",
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={thStyle}>#</th>
                        <th style={{ ...thStyle, textAlign: "left" }} onClick={() => handleSort("title")}>
                          Track
                          {sortArrow("title")}
                        </th>
                        <th style={{ ...thStyle, textAlign: "left" }}>Feat.</th>
                        <th
                          style={{ ...thStyle, textAlign: "right" }}
                          onClick={() => handleSort("latest_play_count")}
                        >
                          Popularity
                          {sortArrow("latest_play_count")}
                        </th>
                        <th style={{ ...thStyle, textAlign: "right" }} onClick={() => handleSort("release_date")}>
                          Released
                          {sortArrow("release_date")}
                        </th>
                        <th style={thStyle}></th>
                      </tr>
                    </thead>
                    <tbody>{albumSongs.map((s, i) => renderSongRow(s, i))}</tbody>
                  </table>
                </div>
              ))
            ) : (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "separate",
                  borderSpacing: 0,
                  fontSize: "0.85rem",
                  fontFamily: "Inter, sans-serif",
                }}
              >
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={{ ...thStyle, textAlign: "left" }} onClick={() => handleSort("title")}>
                      Track
                      {sortArrow("title")}
                    </th>
                    <th style={{ ...thStyle, textAlign: "left" }}>Album</th>
                    <th style={{ ...thStyle, textAlign: "left" }}>Feat.</th>
                    <th style={{ ...thStyle, textAlign: "right" }} onClick={() => handleSort("latest_play_count")}>
                      Popularity
                      {sortArrow("latest_play_count")}
                    </th>
                    <th style={{ ...thStyle, textAlign: "right" }} onClick={() => handleSort("release_date")}>
                      Released
                      {sortArrow("release_date")}
                    </th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>{sorted.map((s, i) => renderSongRow(s, i))}</tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="empty-state">
            <div className="emoji">🎵</div>
            <p>No Spotify tracks collected yet.</p>
            <button
              onClick={handleCollect}
              disabled={collecting}
              style={{
                marginTop: 12,
                padding: "10px 24px",
                borderRadius: "var(--radius-sm)",
                border: "none",
                background: "var(--sp-green)",
                color: "white",
                fontSize: "0.9rem",
                fontWeight: 600,
                fontFamily: "Inter, sans-serif",
                cursor: collecting ? "not-allowed" : "pointer",
              }}
            >
              {collecting ? "Collecting..." : "🔄 Fetch Tracks from Spotify"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
