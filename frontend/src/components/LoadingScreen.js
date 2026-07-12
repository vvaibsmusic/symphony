"use client";
import { useEffect, useState } from "react";

export default function LoadingScreen({ isLoading }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let timer;
    if (isLoading) {
      // Show loading screen if loading takes more than 500ms
      timer = setTimeout(() => setShow(true), 500);
    } else {
      setShow(false);
    }
    return () => clearTimeout(timer);
  }, [isLoading]);

  if (!show) return null;

  return (
    <div style={{
      position: "fixed",
      top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(8, 8, 14, 0.9)",
      backdropFilter: "blur(10px)",
      zIndex: 9999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#E9E9F2",
      fontFamily: "'Space Grotesk', system-ui, sans-serif"
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: "40px", height: "40px",
          border: "3px solid rgba(255,255,255,0.1)",
          borderTopColor: "#FF3B30",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
          margin: "0 auto 16px"
        }}></div>
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes spin { to { transform: rotate(360deg); } }
        `}} />
        <div style={{ fontWeight: 600, letterSpacing: "1px", fontSize: "14px" }}>LOADING...</div>
      </div>
    </div>
  );
}
