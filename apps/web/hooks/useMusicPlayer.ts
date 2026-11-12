'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track, ListeningEventType } from '@vibebox/core';
import { api } from '@/lib/http';
type Repeat = 'off' | 'all' | 'one';
type EventHandler = (trackId: string, type: ListeningEventType, seconds: number) => void;
export function useMusicPlayer(onEvent: EventHandler, onError: (message: string) => void) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<Track | null>(null);
  const beginRef = useRef<number | null>(null);
  const requestRef = useRef(0);
  const eventRef = useRef(onEvent);
  const errorRef = useRef(onError);
  const [current, setCurrent] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeValue] = useState(0.84);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<Repeat>('all');
  useEffect(() => { eventRef.current = onEvent; errorRef.current = onError; }, [onEvent, onError]);
  const finishSegment = useCallback((type: 'pause' | 'skip' | 'complete') => {
    const start = beginRef.current;
    const t = trackRef.current;
    if (start != null && t) {
      const seconds = Math.max(0, Math.min(86400, Math.round((Date.now() - start) / 1000)));
      if (seconds >= 1 || type === 'complete') eventRef.current(t.id, type, seconds);
    }
    beginRef.current = null;
  }, []);
  const playTrack = useCallback(async (track: Track, list?: Track[]) => {
    const a = audioRef.current;
    if (!a) return;
    const generation = ++requestRef.current;
    finishSegment('skip');
    a.pause();
    a.removeAttribute('src');
    a.load();
    setPlaying(false);
    setPosition(0); setDuration(track.duration_seconds || 0);
    setCurrent(track);
    trackRef.current = track;
    if (list && list.length) setQueue(list);
    else setQueue(previous => previous.some(x => x.id === track.id) ? previous : [track]);
    try {
      const { url } = await api<{ url: string }>(`/api/tracks/${track.id}/stream-url`);
      if (generation !== requestRef.current) return;
      a.src = url;
      a.load();
      await a.play();
    } catch (e) { if (generation === requestRef.current) errorRef.current(e instanceof Error ? e.message : 'Unable to play track'); }
  }, [finishSegment]);
  const toggle = useCallback(async () => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) {
      if (!a.src && trackRef.current) await playTrack(trackRef.current);
      else try { await a.play(); } catch (e) { errorRef.current(e instanceof Error ? e.message : 'Playback blocked'); }
    } else a.pause();
  }, [playTrack]);
  const next = useCallback((fromEnd = false) => {
    if (!current || !queue.length) return;
    const index = Math.max(0, queue.findIndex(t => t.id === current.id));
    if (fromEnd && repeat === 'one') { void playTrack(current, queue); return; }
    if (fromEnd && repeat === 'off' && index === queue.length - 1) {
      audioRef.current?.pause(); setPlaying(false); return;
    }
    const target = shuffle && queue.length > 1
      ? queue[(index + 1 + Math.floor(Math.random() * (queue.length - 1))) % queue.length]
      : queue[(index + 1) % queue.length];
    void playTrack(target, queue);
  }, [current, queue, repeat, shuffle, playTrack]);
  const previous = useCallback(() => {
    const a = audioRef.current; if (!a || !current || !queue.length) return;
    if (a.currentTime > 3) { a.currentTime = 0; return; }
    const index = Math.max(0, queue.findIndex(t => t.id === current.id));
    void playTrack(queue[(index - 1 + queue.length) % queue.length], queue);
  }, [current, queue, playTrack]);
  const seek = useCallback((seconds: number) => {
    if (audioRef.current && Number.isFinite(seconds)) {
      audioRef.current.currentTime = Math.min(seconds, audioRef.current.duration || seconds);
      setPosition(audioRef.current.currentTime);
    }
  }, []);
  const changeVolume = useCallback((v: number) => {
    const value = Math.min(1, Math.max(0, v));
    setVolumeValue(value);
    if (audioRef.current) audioRef.current.volume = value;
  }, []);
  const cycleRepeat = useCallback(() => setRepeat(p => p === 'off' ? 'all' : p === 'all' ? 'one' : 'off'), []);
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return;
    if ('MediaMetadata' in window) navigator.mediaSession.metadata = new MediaMetadata({ title: current.title, artist: current.artist, album: current.album });
    navigator.mediaSession.setActionHandler('play', () => { void toggle(); });
    navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause());
    navigator.mediaSession.setActionHandler('previoustrack', previous);
    navigator.mediaSession.setActionHandler('nexttrack', () => next());
    navigator.mediaSession.setActionHandler('seekto', d => { if (d.seekTime !== undefined) seek(d.seekTime); });
    return () => { for (const action of ['play','pause','previoustrack','nexttrack','seekto'] as MediaSessionAction[]) navigator.mediaSession.setActionHandler(action, null); };
  }, [current, toggle, previous, next, seek]);
  useEffect(() => { return () => { requestRef.current++; audioRef.current?.pause(); }; }, []);
  const audio = {
    ref: audioRef,
    onTimeUpdate: () => { const a = audioRef.current; if (a) setPosition(a.currentTime); },
    onLoadedMetadata: () => { const a = audioRef.current; if (a && Number.isFinite(a.duration)) setDuration(a.duration); },
    onPlay: () => { setPlaying(true); if (beginRef.current == null && trackRef.current) { beginRef.current = Date.now(); eventRef.current(trackRef.current.id, 'play', 0); } },
    onPause: () => { setPlaying(false); finishSegment('pause'); },
    onEnded: () => { finishSegment('complete'); next(true); },
    onError: () => { if (audioRef.current?.getAttribute('src')) { audioRef.current.removeAttribute('src'); errorRef.current('Cannot play this audio format, or signed URL expired. Try playing again.'); } }
  };
  return { audio, current, queue, playing, position, duration, volume, shuffle, repeat, playTrack, toggle, next, previous, seek, changeVolume, setShuffle, cycleRepeat };
}
