"use client";

import { useState, useEffect } from "react";
import { CameraOff } from "lucide-react";

const FEED_URL =
  process.env.NEXT_PUBLIC_FEED_URL ?? "http://localhost:8765/video";

interface Props {
  online?: boolean;
}

export default function LiveFeed({ online = true }: Props) {
  const [imgError, setImgError] = useState(false);

  // Retry feed when WS reconnects
  useEffect(() => {
    if (online) setImgError(false);
  }, [online]);

  if (!online || imgError) {
    return (
      <div className='w-full max-w-2xl mx-auto aspect-video bg-page border border-line rounded flex flex-col items-center justify-center gap-2 text-fg-muted'>
        <CameraOff size={28} />
        <span className='text-xs'>Video Feed unavailable</span>
        {/* <span className='font-mono text-[10px] text-line-muted'>
          {FEED_URL}
        </span> */}
      </div>
    );
  }

  return (
    <div className='relative w-full aspect-video'>
      <div className='absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-page/85 rounded px-2 py-1'>
        <span className='w-1.5 h-1.5 rounded-full bg-danger animate-pulse' />
        <span className='section-label text-danger'>live</span>
      </div>
      <img
        src={FEED_URL}
        alt='Live feed'
        onError={() => setImgError(true)}
        className='w-full h-full block rounded border border-line object-cover'
      />
    </div>
  );
}
