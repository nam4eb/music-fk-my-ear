/** Shared domain logic: can be imported into Next.js and a future Expo app. */
export const GENRES = ['Pop', 'Ballad', 'Indie', 'Rock', 'EDM', 'Lo-fi', 'Hip-hop', 'R&B', 'Jazz', 'Classical', 'Acoustic', 'K-pop', 'V-pop', 'Other'] as const;
export const LANGUAGES = ['vi', 'en', 'ko', 'ja', 'zh', 'fr', 'es', 'other', 'unknown'] as const;
export const MOODS = ['chill', 'focus', 'happy', 'sad', 'energy', 'romantic', 'sleep', 'nostalgic', 'party', 'rainy'] as const;
export type Mood = typeof MOODS[number];
export type Language = typeof LANGUAGES[number];
export type ListeningEventType = 'play' | 'pause' | 'skip' | 'complete';
export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  language: string;
  moods: string[];
  duration_seconds: number;
  size_bytes: number;
  mime_type: string;
  year: number | null;
  is_favorite: boolean;
  cover_key: string | null;
  created_at: string;
}
export interface Playlist {
  id: string;
  name: string;
  description: string;
  track_ids: string[];
  created_at: string;
}
export interface ListeningEvent {
  track_id: string;
  event_type: ListeningEventType;
  listened_seconds: number;
  created_at: string;
}
export function fallbackTitle(filename: string): { title: string; artist: string } {
  const stem = filename.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
  const match = stem.match(/^(.+?)\s[-–—]\s(.+)$/);
  return match ? { artist: match[1].trim(), title: match[2].trim() } : { title: stem || 'Unknown track', artist: 'Unknown artist' };
}
/** Conservative keyword suggestions. User always has final say. */
export function suggestTags(filename: string): { genre: string; language: string; moods: string[] } {
  const x = filename.toLowerCase();
  const genre = (/lo.?fi/.test(x) ? 'Lo-fi' : /k.?pop/.test(x) ? 'K-pop' : /v.?pop/.test(x) ? 'V-pop' : /jazz/.test(x) ? 'Jazz' : /classical/.test(x) ? 'Classical' : /hip.?hop/.test(x) ? 'Hip-hop' : /edm|house|techno/.test(x) ? 'EDM' : /rock/.test(x) ? 'Rock' : /acoustic/.test(x) ? 'Acoustic' : 'Other');
  const moods = MOODS.filter(mood => new RegExp(`(^|[^a-z])${mood}([^a-z]|$)`, 'i').test(x));
  return { genre, language: 'unknown', moods: [...moods] };
}
export function daypart(date: Date): 'morning' | 'afternoon' | 'evening' | 'night' {
  const h = date.getHours();
  return h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 17 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : 'night';
}
const timeMood: Record<ReturnType<typeof daypart>, string[]> = {
  morning: ['happy', 'energy', 'focus'],
  afternoon: ['focus', 'chill'],
  evening: ['chill', 'romantic', 'nostalgic'],
  night: ['sleep', 'rainy', 'chill']
};
/** Deterministic personalized ordering; no AI API and no fabricated classification. */
export function dailyMix(tracks: Track[], events: ListeningEvent[], now = new Date(), limit = 24): Track[] {
  if (!tracks.length || limit <= 0) return [];
  const cutoff = now.getTime() - 30 * 86400000;
  const relevant = events.filter(e => Number.isFinite(Date.parse(e.created_at)) && Date.parse(e.created_at) >= cutoff && Date.parse(e.created_at) <= now.getTime());
  const preferences = { genre: new Map<string, number>(), language: new Map<string, number>(), mood: new Map<string, number>() };
  const recentPlays = new Map<string, { weight: number; last: number }>();
  const trackById = new Map(tracks.map(t => [t.id, t]));
  for (const e of relevant) {
    const t = trackById.get(e.track_id); if (!t) continue;
    const age = (now.getTime() - Date.parse(e.created_at)) / 86400000;
    const recency = Math.exp(-age / 14);
    const w = (e.event_type === 'complete' ? 2 : e.event_type === 'play' ? 0.3 : e.event_type === 'skip' ? -1.5 : 0) * recency;
    const inc = (map: Map<string, number>, tag: string) => map.set(tag, (map.get(tag) ?? 0) + w);
    inc(preferences.genre, t.genre);
    if (t.language !== 'unknown') inc(preferences.language, t.language);
    for (const m of t.moods) inc(preferences.mood, m);
    const prev = recentPlays.get(t.id);
    recentPlays.set(t.id, { weight: (prev?.weight ?? 0) + w, last: Math.max(prev?.last ?? 0, Date.parse(e.created_at)) });
  }
  const desired = timeMood[daypart(now)];
  const ordered = tracks.map(t => {
    const recent = recentPlays.get(t.id);
    const ageDays = (now.getTime() - Date.parse(t.created_at)) / 86400000;
    const freshness = Number.isFinite(ageDays) && ageDays < 14 ? 0.6 : 0;
    const score =
      1 + (t.is_favorite ? 2 : 0) + freshness +
      Math.min(3, (preferences.genre.get(t.genre) ?? 0) * 0.3) +
      Math.min(2, (preferences.language.get(t.language) ?? 0) * 0.25) +
      t.moods.reduce((n, m) => n + Math.min(1.5, (preferences.mood.get(m) ?? 0) * 0.18), 0) +
      t.moods.reduce((n, m) => n + (desired.includes(m) ? 1.15 : 0), 0) -
      (recent && now.getTime() - recent.last < 3 * 3600000 ? 2.5 : 0) -
      Math.max(0, -(recent?.weight ?? 0)) * 0.6;
    return { t, score };
  });
  return ordered.sort((a, b) => b.score - a.score || a.t.id.localeCompare(b.t.id)).slice(0, limit).map(x => x.t);
}
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function computeInsights(tracks: Track[], events: ListeningEvent[], now = new Date()) {
  const last7 = events.filter(e => Date.parse(e.created_at) >= now.getTime() - 7 * 86400000 && Date.parse(e.created_at) <= now.getTime());
  const plays = last7.filter(e => e.event_type === 'play').length;
  const minutes = Math.round(last7.reduce((n, e) => n + (e.event_type !== 'play' ? Math.max(0, e.listened_seconds) : 0), 0) / 60);
  const byId = new Map(tracks.map(t => [t.id, t]));
  const count = (key: 'genre' | 'language') => {
    const scores = new Map<string, number>();
    for (const e of last7.filter(e => e.event_type === 'play')) {
      const t = byId.get(e.track_id); if (!t) continue;
      scores.set(t[key], (scores.get(t[key]) ?? 0) + 1);
    }
    return [...scores].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  return { plays, minutes, favoriteGenre: count('genre'), favoriteLanguage: count('language') };
}
