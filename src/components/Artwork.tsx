'use client';
import { useState } from 'react';

export function Artwork({ src, size, title, className = '' }: { src?: string | null; size: number; title?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const initial = (title ?? '?').trim().charAt(0).toUpperCase();
  return (
    <div className={`shrink-0 overflow-hidden bg-hi flex items-center justify-center text-accent font-bold ${className}`} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : initial}
    </div>
  );
}
