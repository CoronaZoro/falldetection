"use client";

import { AlertTriangle, Heart, CheckCircle, Activity } from "lucide-react";
import { colors } from "@/lib/colors";
import type { EventLogEntry } from "@/types";

const ICON: Record<string, React.ReactNode> = {
  fall: <AlertTriangle size={10} className='text-danger' />,
  recovery: <Heart size={10} className='text-success' />,
  ack: <CheckCircle size={10} className='text-info' />,
};

const DOT_COLOR: Record<string, string> = {
  fall: colors.danger,
  recovery: colors.success,
  ack: colors.info,
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
  if (entries.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center h-full gap-2.5 text-center bg-page rounded '>
        <div
          className='w-8 h-8 rounded-full flex items-center justify-center'
          style={{
            background: `${colors.line}80`,
            border: `1px solid ${colors.line}`,
          }}
        >
          <Activity size={13} className='text-fg-muted/40' />
        </div>
        <p className='text-[10px] uppercase tracking-widest text-fg/70 font-semibold'>
          No events
        </p>
      </div>
    );
  }

  return (
    <div className='w-full h-full overflow-y-auto flex flex-col gap-0 pr-1'>
      {entries.map((entry, idx) => {
        const dotColor = DOT_COLOR[entry.type] ?? colors.fgMuted;
        const isLast = idx === entries.length - 1;

        return (
          <div
            key={entry.id}
            className='flex items-stretch gap-0 animate-flash-ib'
          >
            {/* ── Timeline rail ── */}
            <div className='flex flex-col items-center w-6 shrink-0'>
              {/* Connector line above dot (hidden for first item) */}
              <div
                className='w-px flex-1'
                style={{
                  minHeight: idx === 0 ? 0 : 8,
                  background:
                    idx === 0
                      ? "transparent"
                      : `linear-gradient(to bottom, ${dotColor}30, ${dotColor}18)`,
                }}
              />
              {/* Dot */}
              <div
                className='w-4 h-4 rounded-full shrink-0 flex items-center justify-center z-10'
                style={{
                  background: `${dotColor}18`,
                  border: `1px solid ${dotColor}50`,
                  boxShadow:
                    idx === entries.length - 1
                      ? `0 0 6px ${dotColor}40`
                      : "none",
                }}
              >
                {ICON[entry.type]}
              </div>
              {/* Connector line below dot (hidden for last item) */}
              <div
                className='w-px flex-1'
                style={{
                  minHeight: isLast ? 0 : 8,
                  background: isLast
                    ? "transparent"
                    : `linear-gradient(to bottom, ${dotColor}18, ${dotColor}08)`,
                }}
              />
            </div>

            {/* ── Entry content ── */}
            <div className='flex-1 min-w-0 py-1.5 pl-2 pr-1'>
              <p className='text-[11px] text-fg leading-snug'>
                {entry.message}
              </p>
              <p
                className='font-mono text-[9px] mt-0.5'
                style={{ color: `${dotColor}80` }}
              >
                {fmt(entry.timestamp)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
