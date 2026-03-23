"use client";

import { Volume2 } from "lucide-react";

interface Props { entries: string[] }

export default function VoiceLog({ entries }: Props) {
  return (
    <div className="bg-[#111318] border border-[#1e2229] rounded p-3 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <Volume2 size={12} className="text-[#3b82f6]" />
        <span className="section-label">Voice Log</span>
      </div>
      <div className="overflow-y-auto max-h-32 flex flex-col gap-1">
        {entries.length === 0 ? (
          <p className="text-xs text-[#4a5568]">No voice alerts</p>
        ) : (
          entries.map((msg, i) => (
            <p key={i} className="text-xs text-[#c9d1e0] py-1 px-2 bg-[#3b82f6]/[0.05] border-l-2 border-[#3b82f6]/40 italic">
              &ldquo;{msg}&rdquo;
            </p>
          ))
        )}
      </div>
    </div>
  );
}
