'use client';
import { useEffect, useState } from 'react';
import { Music2 } from 'lucide-react';
import type { Track } from '@vibebox/core';
import { api } from '@/lib/http';
const cache = new Map<string, { url: string; expires: number }>();
export default function Artwork({ track, size = 'md' }: { track: Track | null; size?: 'sm' | 'md' | 'lg' | 'hero' }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!track?.cover_key) return;
    let alive = true;
    const key = track.cover_key;
    const found = cache.get(key);
    if (found && found.expires > Date.now()) { setUrl(found.url); return; }
    api<{ url: string }>(`/api/tracks/${track.id}/cover-url`).then(result => {
      cache.set(key, { url: result.url, expires: Date.now() + 50 * 60 * 1000 });
      if (alive) setUrl(result.url);
    }).catch(() => {});
    return () => { alive = false; };
  }, [track?.id, track?.cover_key]);
  const palette = ['art-a','art-b','art-c','art-d','art-e','art-f'];
  const hue = track?.id ? parseInt(track.id.replaceAll('-', '').slice(0, 3), 16) % 6 : 0;
  const sizeClass = { sm: 'h-10 w-10 rounded-xl', md: 'h-12 w-12 rounded-[14px]', lg: 'h-16 w-16 rounded-2xl', hero: 'aspect-square w-full rounded-[30px]' }[size];
  return <div className={`artwork ${sizeClass} ${palette[hue]} relative flex shrink-0 items-center justify-center overflow-hidden`}>
    {url ? <img src={url} alt={track ? `Cover: ${track.title}` : 'Cover'} className="h-full w-full object-cover" /> : <Music2 className={`${size === 'hero' ? 'h-20 w-20' : size === 'lg' ? 'h-7 w-7' : 'h-5 w-5'} text-white/80`} />}
  </div>;
}
