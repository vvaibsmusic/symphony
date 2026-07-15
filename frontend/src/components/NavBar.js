"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavBar() {
  const pathname = usePathname() || "/";
  const youtubeActive = pathname === "/youtube" || pathname.startsWith("/artist/");
  const spotifyActive = pathname === "/spotify" || pathname.startsWith("/spotify/");

  return (
    <>
      {/* viral ticker - just a static/animated placeholder for now since we're redesigning NavBar */}
      <div style={{ height: "32px", background: "#101019", borderBottom: "1px solid rgba(255,59,48,.22)", overflow: "hidden", display: "flex", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "38px", whiteSpace: "nowrap", animation: "tick 26s linear infinite", paddingLeft: "24px", font: "600 11px ui-monospace,Menlo,monospace", letterSpacing: ".3px" }}>
          <span style={{ color: "rgba(255,255,255,.55)" }}><span style={{ color: "#FF5238" }}>▲ 3.02x</span> Daaku — viral cut</span>
          <span style={{ color: "rgba(255,255,255,.55)" }}><span style={{ color: "#FF5238" }}>▲ 2.08x</span> Karan Aujla (Music Video)</span>
          <span style={{ color: "rgba(255,255,255,.55)" }}><span style={{ color: "#FF5238" }}>▲ 1.84x</span> Speed Records — new single</span>
          <span style={{ color: "rgba(255,255,255,.55)" }}><span style={{ color: "#FF5238" }}>▲ 3.02x</span> Daaku — viral cut</span>
          <span style={{ color: "rgba(255,255,255,.55)" }}><span style={{ color: "#FF5238" }}>▲ 2.08x</span> Karan Aujla (Music Video)</span>
          <span style={{ color: "rgba(255,255,255,.55)" }}><span style={{ color: "#FF5238" }}>▲ 1.84x</span> Speed Records — new single</span>
        </div>
      </div>

      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(8,8,14,.82)", backdropFilter: "blur(14px)", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
        <div className="symphony-navbar-inner">
          <Link href="/youtube" style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", textDecoration: "none", color: "inherit" }}>
            <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: "var(--yt-red)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flex: "none" }}>🎶</div>
            <span style={{ fontWeight: 700, fontSize: "19px", letterSpacing: "-.5px" }}>symphony</span>
          </Link>
          <div style={{ display: "flex", gap: "6px", background: "#14141F", padding: "4px", borderRadius: "11px", border: "1px solid rgba(255,255,255,.06)" }}>
            <Link href="/youtube" style={{
              padding: "7px 15px", borderRadius: "8px", textDecoration: "none",
              background: youtubeActive ? "#E50914" : "transparent",
              color: youtubeActive ? "#fff" : "rgba(255,255,255,.5)",
              fontWeight: 600, fontSize: "12.5px"
            }}>▶ YouTube</Link>
            <Link href="/spotify" style={{
              padding: "7px 15px", borderRadius: "8px", textDecoration: "none",
              background: spotifyActive ? "#1DB954" : "transparent",
              color: spotifyActive ? "#fff" : "rgba(255,255,255,.5)",
              fontWeight: 600, fontSize: "12.5px", cursor: "pointer"
            }}>♫ Spotify</Link>
          </div>
          <div style={{ flex: 1 }}></div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", font: "600 10px ui-monospace,Menlo,monospace", color: "rgba(255,255,255,.4)" }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#34C759", boxShadow: "0 0 8px #34C759", animation: "pulseDot 2s ease-in-out infinite" }}></span>LIVE
          </div>
        </div>
      </div>
    </>
  );
}
