/** Import music from VibeBox v1 IndexedDB if opened from the same browser origin. No data is erased. */
export type LegacyTrack = { id: string; title: string; artist?: string; album?: string; genre?: string; language?: string; moods?: string[]; duration?: number; filename?: string; mime?: string; hasLocalFile?: boolean; size?: number };
export type LegacyPlaylist = { id: string; name: string; trackIds?: string[] };
export type LegacyData = { tracks: LegacyTrack[]; files: Map<string, Blob>; playlists: LegacyPlaylist[] };
function all<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}
export async function loadLegacy(): Promise<LegacyData | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await new Promise<IDBDatabase | null>(resolve => {
    const request = indexedDB.open('vibebox-local-v1', 1);
    request.onupgradeneeded = () => { request.transaction?.abort(); resolve(null); };
    request.onerror = () => resolve(null);
    request.onsuccess = () => resolve(request.result);
  });
  if (!db) return null;
  try {
    if (!['tracks','files','playlists'].every(store => db.objectStoreNames.contains(store))) return null;
    const [tracks, entries, playlists] = await Promise.all([
      all<LegacyTrack>(db, 'tracks'), all<{id:string; blob:Blob}>(db,'files'), all<LegacyPlaylist>(db,'playlists')
    ]);
    return { tracks, files: new Map(entries.filter(e => e.blob instanceof Blob).map(e=>[e.id,e.blob])), playlists };
  } finally { db.close(); }
}
