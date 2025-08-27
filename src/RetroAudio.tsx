// src/RetroAudio.tsx
import React, { useEffect, useRef, useState } from "react";

type Props = {
  src?: string;        // default: /audio/retro.mp3
  startMuted?: boolean; // default: true
};

export default function RetroAudio({
  src = "/audio/retro.mp3",
  startMuted = true,
}: Props) {
  console.log("[RetroAudio] mounted");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [ready, setReady] = useState(false);

  // Remember mute across visits
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("bg_audio_muted");
      return saved !== null ? saved === "true" : startMuted;
    } catch {
      return startMuted;
    }
  });

  // Create the audio element ONCE per src (not on mute changes!)
  useEffect(() => {
    console.log("[RetroAudio] creating audio", src);
    const el = new Audio(src);
    el.loop = true;
    el.preload = "auto";
    el.muted = true;           // start muted so autoplay is permitted
    audioRef.current = el;

    // Try to start immediately (muted autoplay usually allowed)
    el.play().catch(() => {
      // If blocked, a user gesture will start it (handler below)
    });

    setReady(true);

    // If tab becomes visible and we're unmuted, ensure it's playing
    const onVis = () => {
      if (document.visibilityState === "visible" && audioRef.current) {
        audioRef.current.play().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      el.pause();
      el.src = "";
      audioRef.current = null;
    };
  }, [src]); // <-- only src here

  // Apply mute without pausing (keeps track position)
  useEffect(() => {
    try {
      localStorage.setItem("bg_audio_muted", String(muted));
    } catch {}
    const el = audioRef.current;
    if (!el) return;
    el.muted = muted;
    // Make sure it's playing (especially after first unmute)
    el.play().catch(() => {});
  }, [muted]);

  // Ensure playback can start after first user gesture in case autoplay was blocked
  useEffect(() => {
    const tryStart = () => {
      const el = audioRef.current;
      if (!el) return;
      el.play().catch(() => {});
      window.removeEventListener("pointerdown", tryStart);
      window.removeEventListener("keydown", tryStart);
      window.removeEventListener("touchstart", tryStart);
    };
    window.addEventListener("pointerdown", tryStart, { once: true });
    window.addEventListener("keydown", tryStart, { once: true });
    window.addEventListener("touchstart", tryStart, { once: true });
    return () => {
      window.removeEventListener("pointerdown", tryStart);
      window.removeEventListener("keydown", tryStart);
      window.removeEventListener("touchstart", tryStart);
    };
  }, []);

  // Force-visible UI (avoid CSS/z-index surprises)
  const shellStyle: React.CSSProperties = {
  position: "fixed",
  top: 16,
  left: 16,
  zIndex: 2147483647,
  display: "flex",
  gap: 8,
  alignItems: "center",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
  };

  const btnStyle: React.CSSProperties = {
    padding: "10px 14px",
    background: "rgba(0,0,0,0.7)",
    color: "#fff",
    border: 0,
    borderRadius: 14,
    cursor: "pointer",
    boxShadow: "0 6px 18px rgba(0,0,0,0.3)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
  };

  if (!ready) {
    return (
      <div style={shellStyle}>
        <div style={btnStyle}>Loading audio…</div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <button
        type="button"
        onClick={() => setMuted(m => !m)}
        aria-label={muted ? "Unmute background music" : "Mute background music"}
        title={muted ? "Unmute" : "Mute"}
        style={btnStyle}
      >
        {muted ? "🔇 Music Off" : "🔊 Music On"}
      </button>
    </div>
  );
}
