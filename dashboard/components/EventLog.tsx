"use client";

import { AlertTriangle, Hand, Heart, Activity, Volume2, CheckCircle } from "lucide-react";
import type { EventLogEntry } from "@/types";

const ICONS: Record<string, React.ReactNode> = {
  fall:      <AlertTriangle size={14} className="text-[#ff3355]" />,
  sos:       <Hand          size={14} className="text-[#ffaa00]" />,
  recovery:  <Heart         size={14} className="text-[#00ff88]" />,
  heartbeat: <Activity      size={14} className="text-[#4a5568]" />,
  voice:     <Volume2       size={14} className="text-[#3b82f6]" />,
  ack:       <CheckCircle   size={14} className="text-[#3b82f6]" />,
};

const BORDER_COLORS: Record<string, string> = {
  fall:      "#ff3355",
  sos:       "#ffaa00",
  recovery:  "#00ff88",
  heartbeat: "#4a5568",
  voice:     "#3b82f6",
  ack:       "#3b82f6",
};

interface Props {
  entries: EventLogEntry[];
  maxHeight?: string;
}

function fmt(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

export default function EventLog({ entries, maxHeight = "200px" }: Props) {
  return (
    <div className="overflow-y-auto flex flex-col gap-px" style={{ maxHeight }}>
      {entries.length === 0 && (
        <div className="text-[#4a5568] text-sm text-center py-4">No events yet</div>
      )}
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="animate-flash-in flex items-start gap-2 px-2.5 py-2 rounded bg-[#111318]/50"
          style={{ borderLeft: `2px solid ${BORDER_COLORS[entry.type] ?? "#4a5568"}` }}
        >
          <span className="shrink-0 mt-px">{ICONS[entry.type]}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-[#c8d0e0] leading-snug break-words">{entry.message}</p>
            <p className="text-[11px] text-[#4a5568] font-mono mt-0.5">{fmt(entry.timestamp)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
