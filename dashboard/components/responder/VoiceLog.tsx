"use client";

import { Volume2 } from "lucide-react";

interface Props {
  entries: string[];
}

export default function VoiceLog({ entries }: Props) {
  return (
    <div className="bg-[#111318] border border-[#1e2229] rounded-lg p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Volume2 size={14} className="text-[#3b82f6]" />
        <span className="text-sm font-semibold text-[#c8d0e0]">Voice Alerts</span>
      </div>
      <div className="overflow-y-auto max-h-36 flex flex-col gap-1.5">
        {entries.length === 0 ? (
          <p className="text-[13px] text-[#4a5568] italic">No voice alerts yet</p>
        ) : (
          entries.map((msg, i) => (
            <div
              key={i}
              className="text-[13px] text-[#c8d0e0] px-2.5 py-1.5 bg-[#3b82f6]/[0.06] border-l-2 border-[#3b82f6] rounded-r italic"
            >
              &ldquo;{msg}&rdquo;
            </div>
          ))
        )}
      </div>
    </div>
  );
}
