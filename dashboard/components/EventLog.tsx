"use client";

import { AlertTriangle, Heart, CheckCircle } from "lucide-react";
import { colors } from "@/lib/colors";
import type { EventLogEntry } from "@/types";

const ICONS: Record<string, React.ReactNode> = {
  fall:     <AlertTriangle size={12} className='text-danger' />,
  recovery: <Heart         size={12} className='text-success' />,
  ack:      <CheckCircle   size={12} className='text-info' />,
};

const LEFT_COLOR: Record<string, string> = {
  fall:     colors.danger,
  recovery: colors.success,
  ack:      colors.info,
};

interface Props {
  entries: EventLogEntry[];
}

function fmt(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function EventLog({ entries }: Props) {
  return (
    <div className='w-full h-full overflow-y-auto flex flex-col'>
      {entries.length === 0 && (
        <div className='text-fg-muted text-xs text-center py-6 my-auto'>
          No events yet
        </div>
      )}
      {entries.map((entry) => (
        <div
          key={entry.id}
          className='animate-flash-in flex items-start gap-2 py-1.5 px-2'
          style={{
            borderLeft: `2px solid ${LEFT_COLOR[entry.type] ?? colors.line}`,
          }}
        >
          <span className='shrink-0 mt-px'>{ICONS[entry.type]}</span>
          <div className='flex-1 min-w-0'>
            <p className='text-xs text-fg leading-snug'>{entry.message}</p>
            <p className='font-mono text-[10px] text-fg-muted mt-0.5'>
              {fmt(entry.timestamp)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
