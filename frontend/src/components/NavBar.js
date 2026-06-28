"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavBar() {
  const pathname = usePathname() || "/";
  const youtubeActive = pathname === "/youtube" || pathname.startsWith("/artist/");
  const spotifyActive = pathname === "/spotify" || pathname.startsWith("/spotify/");

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="nav-logo" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src="/logo.png"
            alt="vvaibsmusic"
            style={{ width: 30, height: 30, borderRadius: 6, objectFit: "cover" }}
          />
          <span className="symphony-brand" style={{ fontSize: "1.25rem" }}>
            symphony
          </span>
        </Link>
        <div className="nav-links">
          <Link href="/youtube" className={`nav-link ${youtubeActive ? "active-yt" : ""}`}>
            ▶ YouTube
          </Link>
          <Link href="/spotify" className={`nav-link ${spotifyActive ? "active-sp" : ""}`}>
            🎧 Spotify
          </Link>
        </div>
      </div>
    </nav>
  );
}
