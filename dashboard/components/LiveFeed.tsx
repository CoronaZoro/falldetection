"use client";

import { useState, useEffect } from "react";
import { CameraOff, Scan, Square, PanelTop } from "lucide-react";

const FEED_URL =
  process.env.NEXT_PUBLIC_FEED_URL ?? "http://localhost:8765/video";

const API_URL = (
  process.env.NEXT_PUBLIC_DETECTION_WS_URL ?? "ws://localhost:8765/ws"
)
  .replace("wss://", "https://")
  .replace("ws://", "http://")
  .replace("/ws", "");

interface Props {
  online?: boolean;
}

interface VizFlags {
  skeleton: boolean;
  bbox: boolean;
  status_bar: boolean;
}

function VizBtn({
  label,
  active,
  icon,
  onClick,
}: {
  label: string;
  active: boolean;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={`${active ? "Hide" : "Show"} ${label}`}
      className='flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium border-none cursor-pointer transition-all'
      style={{
        background: active ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.55)",
        color: active ? "#fff" : "rgba(255,255,255,0.45)",
        backdropFilter: "blur(4px)",
        outline: active
          ? "1px solid rgba(255,255,255,0.3)"
          : "1px solid rgba(255,255,255,0.1)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

export default function LiveFeed({ online = true }: Props) {
  const [imgError, setImgError] = useState(false);
  const [viz, setViz] = useState<VizFlags>({
    skeleton: true,
    bbox: true,
    status_bar: true,
  });

  // Sync initial state from server
  useEffect(() => {
    fetch(`${API_URL}/visualization`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setViz(d);
      })
      .catch(() => {});
  }, []);

  // Retry feed when WS reconnects
  useEffect(() => {
    if (online) setImgError(false);
  }, [online]);

  async function toggle(key: keyof VizFlags) {
    const next = { ...viz, [key]: !viz[key] };
    setViz(next); // optimistic update
    try {
      const res = await fetch(`${API_URL}/visualization`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next[key] }),
      });
      if (res.ok) setViz(await res.json()); // confirm with server state
    } catch {
      setViz(viz); // revert on error
    }
  }

  if (!online || imgError) {
    return (
      <div className='w-full max-w-2xl mx-auto aspect-video bg-page border border-line rounded flex flex-col items-center justify-center gap-2 text-fg-muted'>
        <CameraOff size={28} />
        <span className='text-xs'>Video Feed unavailable</span>
      </div>
    );
  }

  return (
    <div className='relative w-full aspect-video'>
      {/* LIVE badge — top left */}
      <div className='absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-page/85 rounded px-2 py-1'>
        <span className='w-1.5 h-1.5 rounded-full bg-danger animate-pulse' />
        <span className='section-label text-danger'>live</span>
      </div>

      {/* Visualizer toggles — top right */}
      <div className='absolute top-2 right-2 z-10 flex items-center gap-1.5'>
        <VizBtn
          label='Skeleton'
          active={viz.skeleton}
          icon={<Scan size={11} />}
          onClick={() => toggle("skeleton")}
        />
        <VizBtn
          label='Box'
          active={viz.bbox}
          icon={<Square size={11} />}
          onClick={() => toggle("bbox")}
        />
        <VizBtn
          label='Status'
          active={viz.status_bar}
          icon={<PanelTop size={11} />}
          onClick={() => toggle("status_bar")}
        />
      </div>

      <img
        src={FEED_URL}
        alt='Live feed'
        onError={() => setImgError(true)}
        className='w-full h-full block rounded border border-line object-cover'
      />
    </div>
  );
}
