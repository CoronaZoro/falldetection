"use client";

import { Volume2 } from "lucide-react";

interface Props {
  entries: string[];
}

export default function VoiceLog({ entries }: Props) {
  return (
    <div className='bg-surface border border-line rounded p-2.5 flex flex-col gap-1.5 h-full'>
      <div className='flex items-center gap-1.5 shrink-0'>
        <Volume2 size={11} className='text-info' />
        <span className='section-label'>Voice Log</span>
      </div>
      <div className='flex-1 min-h-0 overflow-y-auto flex flex-col gap-1'>
        {entries.length === 0 ? (
          <p className='text-[11px] text-fg-muted'>No voice alerts</p>
        ) : (
          entries.map((msg, i) => (
            <p
              key={i}
              className='text-[11px] text-fg py-1 px-2 bg-info/5 border-l-2 border-info/40 italic leading-snug'
            >
              &ldquo;{msg}&rdquo;
            </p>
          ))
        )}
      </div>
    </div>
  );
}
