"use client";

import { useEffect, useState } from "react";

interface Props {
  seconds: number;
  onExpire?: () => void;
  color?: string;
}

export default function CountdownBar({ seconds, onExpire, color = "#ff3355" }: Props) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onExpire?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [seconds, onExpire]);

  const pct = (remaining / seconds) * 100;
  const urgentColor = remaining <= 5 ? "#ff3355" : remaining <= 10 ? "#ffaa00" : color;
  const textColor = remaining <= 5 ? "text-[#ff3355]" : remaining <= 10 ? "text-[#ffaa00]" : "text-[#c8d0e0]";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#4a5568]">Auto-escalate in</span>
        <span className={`font-mono text-lg font-bold ${textColor}`}>{remaining}s</span>
      </div>
      <div className="h-1 bg-[#1e2229] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-1000 linear"
          style={{ width: `${pct}%`, background: urgentColor }}
        />
      </div>
    </div>
  );
}
