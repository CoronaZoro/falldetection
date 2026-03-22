"use client";

import { useState } from "react";
import { CameraOff } from "lucide-react";

interface Props {
  feedUrl?: string;
  online?: boolean;
}

export default function LiveFeed({ feedUrl = "http://localhost:8765/video", online = true }: Props) {
  const [imgError, setImgError] = useState(false);

  if (!online || imgError) {
    return (
      <div className="w-full aspect-video bg-[#0a0c10] border border-[#1e2229] rounded-lg flex flex-col items-center justify-center gap-3 text-[#4a5568]">
        <CameraOff size={36} />
        <span className="text-sm">Camera feed unavailable</span>
        <span className="text-xs text-[#2a3040]">{feedUrl}</span>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {/* Live badge */}
      <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5 bg-[#0a0c10]/80 border border-[#1e2229] rounded-md px-2 py-1">
        <span className="inline-block w-2 h-2 rounded-full bg-[#ff3355] animate-pulse-red" />
        <span className="text-[11px] font-bold font-mono tracking-widest text-[#ff3355]">LIVE</span>
      </div>
      <img
        src={feedUrl}
        alt="Live camera feed with AI detection overlay"
        onError={() => setImgError(true)}
        className="w-full rounded-lg border border-[#1e2229] block"
      />
    </div>
  );
}
