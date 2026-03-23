"use client";

import { AlertTriangle, Hand, Heart, Activity, Volume2, CheckCircle } from "lucide-react";
import type { EventLogEntry } from "@/types";

const ICONS: Record<string, React.ReactNode> = {
  fall:      <AlertTriangle size={12} className="text-[#ff3355]" />,
  sos:       <Hand          size={12} className="text-[#ffaa00]" />,
  recovery:  <Heart         size={12} className="text-[#00ff88]" />,
  heartbeat: <Activity      size={12} className="text-[#2a3040]"  />,
  voice:     <Volume2       size={12} className="text-[#3b82f6]" />,
  ack:       <CheckCircle   size={12} className="text-[#3b82f6]" />,
};

const LEFT_COLOR: Record<string, string> = {
  fall: "#ff3355", sos: "#ffaa00", recovery: "#00ff88",
  heartbeat: "#1e2229", voice: "#3b82f6", ack: "#3b82f6",
};

interface Props {
  entries: EventLogEntry[];
  maxHeight?: string;
}

function fmt(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

export default function EventLog({ entries, maxHeight = "200px" }: Props) {
  return (
    <div className="overflow-y-auto flex flex-col" style={{ maxHeight }}>
      {entries.length === 0 && (
        <div className="text-[#4a5568] text-xs text-center py-6">No events yet</div>
      )}
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="animate-flash-in flex items-start gap-2 py-1.5 px-2"
          style={{ borderLeft: `2px solid ${LEFT_COLOR[entry.type] ?? "#1e2229"}` }}
        >
          <span className="shrink-0 mt-px">{ICONS[entry.type]}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[#c9d1e0] leading-snug">{entry.message}</p>
            <p className="font-mono text-[10px] text-[#4a5568] mt-0.5">{fmt(entry.timestamp)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
