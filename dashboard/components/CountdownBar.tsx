"use client";

import { useEffect, useState } from "react";
import { CheckCircle } from "lucide-react";
import { colors } from "@/lib/colors";

interface Props {
  seconds: number;
  color?: string;
  /** When true the bar freezes green — person self-recovered before timer expired */
  stopped?: boolean;
}

export default function CountdownBar({
  seconds,
  color = colors.danger,
  stopped = false,
}: Props) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
  }, [seconds]);

  useEffect(() => {
    if (stopped) return;
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [stopped]);

  if (stopped) {
    return (
      <div
        className='flex items-center gap-2.5 rounded-lg px-3 py-2.5'
        style={{
          background: `${colors.success}12`,
          border: `1px solid ${colors.success}30`,
        }}
      >
        <div
          className='w-7 h-7 rounded-full flex items-center justify-center shrink-0'
          style={{ background: `${colors.success}20` }}
        >
          <CheckCircle size={14} style={{ color: colors.success }} />
        </div>
        <div>
          <p
            className='text-[11px] font-semibold'
            style={{ color: colors.success }}
          >
            Person self-recovered
          </p>
          <p className='text-[10px] text-fg-muted/60 mt-0.5'>
            Got up before the escalation window closed
          </p>
        </div>
      </div>
    );
  }

  const urgentColor =
    remaining <= 5
      ? colors.danger
      : remaining <= 10
        ? colors.warning
        : colors.accent;
  const urgent = remaining <= 5;

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex items-center justify-between'>
        <span className='text-[10px] uppercase tracking-widest font-semibold text-fg-muted/60'>
          Escalating in
        </span>
        <span
          className={`font-mono font-bold text-2xl leading-none tabular-nums ${urgent ? "animate-alarm" : ""}`}
          style={{ color: urgentColor }}
        >
          {remaining}
          <span className='text-xs font-normal ml-0.5 opacity-60'>s</span>
        </span>
      </div>

      {/* Segmented bar — one pip per second */}
      <div className='flex gap-[3px]'>
        {Array.from({ length: seconds }, (_, i) => (
          <div
            key={i}
            className='flex-1 rounded-full transition-all duration-1000'
            style={{
              height: 5,
              background: i < remaining ? urgentColor : `${urgentColor}20`,
              opacity: i < remaining ? 1 : 0.25,
            }}
          />
        ))}
      </div>
    </div>
  );
}
