"use client";

import { useEffect, useState } from "react";
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
    if (stopped) return; // freeze — person got up

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
      <div className='flex flex-col gap-2'>
        <div className='flex items-baseline justify-between'>
          <span className='section-label'>person self-recovered</span>
          <span className='font-mono font-bold text-2xl leading-none' style={{ color: colors.success }}>
            ✓
          </span>
        </div>
        <div className='h-1 bg-line rounded-full overflow-hidden'>
          <div className='h-full w-full rounded-full' style={{ background: colors.success }} />
        </div>
      </div>
    );
  }

  const pct         = (remaining / seconds) * 100;
  const urgentColor = remaining <= 5 ? colors.danger : remaining <= 10 ? colors.warning : color;
  const urgent      = remaining <= 5;

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex items-baseline justify-between'>
        <span className='section-label'>escalating to active incident in</span>
        <span
          className={`font-mono font-bold text-2xl leading-none ${urgent ? "animate-alarm" : ""}`}
          style={{ color: urgentColor }}
        >
          {remaining}
          <span className='text-sm font-medium ml-0.5'>s</span>
        </span>
      </div>
      <div className='h-1 bg-line rounded-full overflow-hidden'>
        <div
          className='h-full rounded-full transition-[width] duration-1000 linear'
          style={{ width: `${pct}%`, background: urgentColor }}
        />
      </div>
    </div>
  );
}
