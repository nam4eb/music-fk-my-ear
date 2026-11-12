/** Lightweight, dependency-free ID3v2.3/v2.4 metadata reader for MP3 imports. */
export type BasicTags = { title?: string; artist?: string; album?: string; genre?: string; language?: string; duration?: number };
export async function readBasicTags(file: File): Promise<BasicTags> {
  if (!/\.mp3$/i.test(file.name)) return {};
  try {
    const bytes = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
    if (String.fromCharCode(...bytes.slice(0, 3)) !== 'ID3') return {};
    const version = bytes[3]; if (version !== 3 && version !== 4) return {};
    const synchsafe = (o: number) => ((bytes[o] & 127) << 21) | ((bytes[o + 1] & 127) << 14) | ((bytes[o + 2] & 127) << 7) | (bytes[o + 3] & 127);
    const tagEnd = Math.min(bytes.length, 10 + synchsafe(6));
    let pos = (bytes[5] & 0x40) ? 10 + (version === 4 ? synchsafe(10) : ((bytes[10] << 24) | (bytes[11] << 16) | (bytes[12] << 8) | bytes[13])) : 10;
    const tags: Record<string, string> = {};
    while (pos + 10 < tagEnd) {
      const name = String.fromCharCode(...bytes.slice(pos, pos + 4));
      if (!/^[A-Z0-9]{4}$/.test(name)) break;
      const size = version === 4 ? synchsafe(pos + 4) : ((bytes[pos + 4] << 24) | (bytes[pos + 5] << 16) | (bytes[pos + 6] << 8) | bytes[pos + 7]) >>> 0;
      if (size < 1 || pos + 10 + size > tagEnd) break;
      if (['TIT2', 'TPE1', 'TALB', 'TCON', 'TLAN', 'TLEN'].includes(name)) {
        const encoding = bytes[pos + 10];
        const codec = encoding === 3 ? 'utf-8' : encoding === 0 ? 'iso-8859-1' : encoding === 2 ? 'utf-16be' : 'utf-16';
        try { tags[name] = new TextDecoder(codec).decode(bytes.slice(pos + 11, pos + 10 + size)).replace(/\0/g, '').trim(); } catch { /* unsupported encoding */ }
      }
      pos += size + 10;
    }
    return { title: tags.TIT2, artist: tags.TPE1, album: tags.TALB, genre: tags.TCON, language: tags.TLAN, duration: tags.TLEN ? Number(tags.TLEN) / 1000 : undefined };
  } catch { return {}; }
}
export function normalizeLegacyGenre(value?: string): string {
  const map: Record<string, string> = { lofi:'Lo-fi', hiphop:'Hip-hop', edm:'EDM', rnb:'R&B', pop:'Pop', ballad:'Ballad', indie:'Indie', rock:'Rock', jazz:'Jazz', classical:'Classical', acoustic:'Acoustic', kpop:'K-pop', vpop:'V-pop' };
  if (!value) return 'Other';
  return map[value.trim().toLowerCase().replace(/[\s-]/g, '')] || (/^(?:Pop|Ballad|Indie|Rock|EDM|Lo-fi|Hip-hop|R&B|Jazz|Classical|Acoustic|K-pop|V-pop)$/i.test(value) ? value : 'Other');
}
export function normalizeLanguage(input?: string): string {
  const code = (input || '').toLowerCase().trim();
  const map: Record<string,string> = { vie:'vi', vietnamese:'vi', eng:'en', english:'en', kor:'ko', korean:'ko', jpn:'ja', japanese:'ja', chi:'zh', zho:'zh', chinese:'zh', fre:'fr', fra:'fr', french:'fr', spa:'es', spanish:'es' };
  return map[code] || (['vi','en','ko','ja','zh','fr','es','other'].includes(code) ? code : 'unknown');
}
