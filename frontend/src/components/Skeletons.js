"use client";

// Shimmer placeholders shown on first load (before any data is cached).

export function TableSkeleton({ rows = 8 }) {
  return (
    <div style={{
      border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)",
      overflow: "hidden", background: "var(--bg-card)",
    }}>
      <div className="skeleton" style={{ height: 38, borderRadius: 0, opacity: 0.7 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)",
        }}>
          <div className="skeleton" style={{ width: 24, height: 14 }} />
          <div className="skeleton" style={{ width: 36, height: 36, borderRadius: "50%" }} />
          <div className="skeleton" style={{ width: `${28 + ((i * 13) % 30)}%`, height: 14 }} />
          <div className="skeleton" style={{ width: 70, height: 14, marginLeft: "auto" }} />
          <div className="skeleton" style={{ width: 90, height: 14 }} />
        </div>
      ))}
    </div>
  );
}

export function StatsSkeleton({ cards = 4 }) {
  return (
    <div className="stats-grid" style={{ maxWidth: 800, margin: "0 auto 3rem" }}>
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="stat-card" style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          <div className="skeleton" style={{ width: 64, height: 30 }} />
          <div className="skeleton" style={{ width: 90, height: 12 }} />
        </div>
      ))}
    </div>
  );
}
