import { z } from 'zod';
export const id = z.string().uuid();
export const trackMetadata = z.object({
  title: z.string().trim().min(1).max(300), artist: z.string().trim().max(300).default('Unknown artist'),
  album: z.string().trim().max(300).default(''), genre: z.string().trim().max(60).default('Other'),
  language: z.string().trim().max(32).default('unknown'),
  moods: z.array(z.string().trim().max(30)).max(10).default([]),
  duration_seconds: z.number().int().min(0).max(86400).default(0),
  year: z.number().int().min(1900).max(2100).nullable().default(null)
});
export const uploadInitSchema = z.object({
  filename: z.string().trim().min(1).max(300), mimeType: z.string().max(100),
  size: z.number().int().positive()
});
export const playlistSchema = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).default('') });
export function extensionAndMime(name: string, supplied: string, kind: 'audio' | 'cover') {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const allowed: Record<string, string[]> = kind === 'audio' ? {
    mp3: ['audio/mpeg', 'audio/mp3'], m4a: ['audio/mp4', 'audio/x-m4a', 'audio/m4a'],
    aac: ['audio/aac', 'audio/x-aac'], wav: ['audio/wav', 'audio/x-wav', 'audio/wave'],
    flac: ['audio/flac', 'audio/x-flac'], ogg: ['audio/ogg'], opus: ['audio/opus', 'audio/ogg'], webm: ['audio/webm']
  } : { png: ['image/png'], jpg: ['image/jpeg'], jpeg: ['image/jpeg'], webp: ['image/webp'] };
  const matches = allowed[ext];
  if (!matches) return null;
  const mime = supplied === 'application/octet-stream' || supplied === '' ? matches[0] : supplied.toLowerCase();
  return matches.includes(mime) ? { ext, mime } : null;
}
