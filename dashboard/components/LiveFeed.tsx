"use client";

import { useState, useEffect } from "react";
import { CameraOff } from "lucide-react";

const FEED_URL = process.env.NEXT_PUBLIC_FEED_URL ?? "http://localhost:8765/video";

interface Props {
  online?: boolean;
}

export default function LiveFeed({ online = true }: Props) {
  const [imgError, setImgError] = useState(false);

  // When WS reconnects, retry the feed
  useEffect(() => {
    if (online) setImgError(false);
  }, [online]);

  if (!online || imgError) {
    return (
      <div className='w-full aspect-video bg-[#0a0c10] border border-[#1e2229] rounded flex flex-col items-center justify-center gap-2 text-[#4a5568]'>
        <CameraOff size={28} />
        <span className='text-xs'>Feed unavailable</span>
        <span className='font-mono text-[10px] text-[#2a3040]'>{FEED_URL}</span>
      </div>
    );
  }

  return (
    <div className='relative w-full'>
      <div className='absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-[#0a0c10]/85 rounded px-2 py-1'>
        <span className='w-1.5 h-1.5 rounded-full bg-[#ff3355] animate-pulse' />
        <span className='section-label text-[#ff3355]'>live</span>
      </div>
      <img
        src={FEED_URL}
        alt='Live feed'
        onError={() => setImgError(true)}
        className='w-full block rounded border border-[#1e2229]'
      />
    </div>
  );
}
