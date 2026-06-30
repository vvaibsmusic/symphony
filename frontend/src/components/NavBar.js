"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "";

export default function NavBar() {
    const pathname = usePathname() || "/";
    const [tickerData, setTickerData] = useState([]);

    useEffect(() => {
        // Fetch viral alerts for ticker
        const fetchTicker = async () => {
            try {
                const res = await fetch(`${API}/api/dashboard`).then(r => r.json());
                if (res.viral) {
                    const formattedTicker = (res.viral?.viral || []).map(v => ({
                        mult: v.growth_factor ? `${v.growth_factor}x` : '2.1x', // fallback if none
                        title: (v.title || "").split(' (')[0] // Clean title
                    }));
                    setTickerData(formattedTicker);
                }
            } catch (e) {
                console.error("Failed to fetch ticker:", e);
            }
        };
        fetchTicker();
    }, []);

    // Create a duplicated list for seamless looping if we have data
    const tickerList = tickerData.length ? [...tickerData, ...tickerData, ...tickerData, ...tickerData, ...tickerData].slice(0, 20) : [];

    return (
        <div style={{ minHeight: "0", background: "#08080E", color: "#E9E9F2", fontSize: "13px" }}>
            {/* viral ticker */}
            <div style={{
                height: "32px", background: "#101019", borderBottom: "1px solid rgba(255,59,48,.22)",
                overflow: "hidden", display: "flex", alignItems: "center"
            }}>
                <div style={{
                    display: "flex", gap: "38px", whiteSpace: "nowrap",
                    animation: "tick 26s linear infinite", paddingLeft: "24px",
                    font: "600 11px ui-monospace, Menlo, monospace", letterSpacing: ".3px"
                }}>
                    {tickerList.length > 0 ? tickerList.map((t, idx) => (
                        <span key={idx} style={{ color: "rgba(255,255,255,.55)" }}>
                            <span style={{ color: "#FF5238" }}>▲ {t.mult}</span> {t.title}
                        </span>
                    )) : (
                        <span style={{ color: "rgba(255,255,255,.55)" }}>Loading viral signals...</span>
                    )}
                </div>
            </div>

            {/* top nav */}
            <div style={{
                position: "sticky", top: 0, zIndex: 20, background: "rgba(8,8,14,.82)",
                backdropFilter: "blur(14px)", borderBottom: "1px solid rgba(255,255,255,.06)"
            }}>
                <div style={{
                    maxWidth: "1200px", margin: "0 auto", padding: "14px 28px",
                    display: "flex", alignItems: "center", gap: "20px"
                }}>
                    <Link href="/youtube" style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", textDecoration: "none", color: "inherit" }}>
                        <div style={{
                            width: "28px", height: "28px", borderRadius: "8px",
                            background: "linear-gradient(135deg,#FF3B30,#9b1d16)", display: "flex",
                            alignItems: "center", justifyContent: "center", fontSize: "14px", color: "white"
                        }}>▶</div>
                        <span style={{ fontWeight: 700, fontSize: "19px", letterSpacing: "-.5px" }}>symphony</span>
                    </Link>
                    <div style={{
                        display: "flex", gap: "6px", background: "#14141F", padding: "4px",
                        borderRadius: "11px", border: "1px solid rgba(255,255,255,.06)"
                    }}>
                        <Link href="/youtube" style={{
                            padding: "7px 15px", borderRadius: "8px",
                            background: pathname.includes("youtube") || pathname === "/" ? "#E50914" : "transparent",
                            color: pathname.includes("youtube") || pathname === "/" ? "#fff" : "rgba(255,255,255,.5)",
                            fontWeight: 600, fontSize: "12.5px", textDecoration: "none"
                        }}>
                            ▶ YouTube
                        </Link>
                        <Link href="/spotify" style={{
                            padding: "7px 15px", borderRadius: "8px",
                            background: pathname.includes("spotify") ? "#1DB954" : "transparent",
                            color: pathname.includes("spotify") ? "#fff" : "rgba(255,255,255,.5)",
                            fontSize: "12.5px", cursor: "pointer", textDecoration: "none", fontWeight: 600
                        }}>
                            ♫ Spotify
                        </Link>
                    </div>
                    <div style={{ flex: 1 }}></div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", font: "600 10px ui-monospace, Menlo, monospace", color: "rgba(255,255,255,.4)" }}>
                        <span style={{
                            width: "7px", height: "7px", borderRadius: "50%", background: "#34C759",
                            boxShadow: "0 0 8px #34C759", animation: "pulseDot 2s ease-in-out infinite"
                        }}></span>LIVE
                    </div>
                </div>
            </div>
        </div>
    );
}
