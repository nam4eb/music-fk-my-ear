'use client';
import { useEffect, useMemo, useState, useCallback, type ReactNode, type ChangeEvent } from 'react';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, Check, ChevronDown, CircleHelp, Cloud,
  Compass, Disc3, FolderHeart, Headphones, Heart, Home, Library, ListMusic, LoaderCircle, LogOut,
  Menu, MoreHorizontal, Music, Music2, Pause, Pencil, Play, Plus, Repeat, Repeat1, Search,
  Settings, Shuffle, SkipBack, SkipForward, SlidersHorizontal, Sparkles, Trash2, UploadCloud, CheckSquare,
  Volume2, VolumeX, X
} from 'lucide-react';
import { dailyMix, computeInsights, daypart, fallbackTitle, formatTime, GENRES, LANGUAGES, MOODS, suggestTags, type Track, type Playlist, type ListeningEvent } from '@vibebox/core';
import Artwork from './Artwork';
import AuthScreen from './AuthScreen';
import { api, json, getToken, setToken, sendSignedFile, API_URL, HttpError, type AppConfig, type AuthResult } from '@/lib/http';
import { UI, MOOD_LABELS, LANGUAGE_LABELS, type UiLanguage } from '@/lib/labels';
import { useMusicPlayer } from '@/hooks/useMusicPlayer';
import { readBasicTags, normalizeLegacyGenre, normalizeLanguage } from '@/lib/musicTags';
import { loadLegacy } from '@/lib/legacyImport';
import { toggleTrackSelection, toggleVisibleSelection, chunkTrackIds } from '@/lib/bulkSelection';

type Tab = 'discover' | 'library' | 'playlists' | 'insights' | 'settings';
type Bootstrap = { tracks: Track[]; playlists: Playlist[]; events: ListeningEvent[] };
type StorageSummary = { newUploads: 'local' | 'r2'; tracks: { storage_driver: 'local' | 'r2'; count: string; bytes: string }[]; covers: { cover_storage_driver: 'local' | 'r2'; count: string }[] };

type EditTrack = Pick<Track, 'id' | 'title' | 'artist' | 'album' | 'genre' | 'language' | 'moods' | 'year' | 'duration_seconds'>;
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const iconSet = { discover: Compass, library: Library, playlists: ListMusic, insights: Activity, settings: Settings };
function SectionHeading({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div>{eyebrow && <p className="mb-1 text-[11px] font-bold tracking-[.18em] text-[#6ac6bc] uppercase">{eyebrow}</p>}<h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2></div>{right}</div>;
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop fixed inset-0 z-[70] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label={title} className="modal-content max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#162923] p-5 shadow-2xl sm:max-w-[550px] sm:rounded-[26px] sm:p-7">
      <div className="mb-6 flex items-center justify-between gap-3"><h3 className="text-xl font-bold">{title}</h3><button className="icon-button" aria-label="Close" onClick={onClose}><X size={20}/></button></div>
      {children}
    </section>
  </div>;
}
function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.035] px-3 text-xs text-[#6ecbc3]">
    <SlidersHorizontal size={15}/><span className="sr-only">{label}</span><select aria-label={label} className="min-w-0 bg-transparent py-3 text-sm text-[#e3e1f3] outline-none" value={value} onChange={e=>onChange(e.target.value)}>
      {options.map(o => <option className="bg-[#1d332d]" key={o.value} value={o.value}>{o.label}</option>)}
    </select><ChevronDown size={12}/>
  </label>;
}
export default function MusicFuqMeApp() {
  const [lang, setLang] = useState<UiLanguage>('vi');
  const [booting, setBooting] = useState(true);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [storageSummary, setStorageSummary] = useState<StorageSummary | null>(null);
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [bootError, setBootError] = useState('');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [events, setEvents] = useState<ListeningEvent[]>([]);
  const [tab, setTab] = useState<Tab>('discover');
  const [query, setQuery] = useState('');
  const [moodFilter, setMoodFilter] = useState<string>('all');
  const [genreFilter, setGenreFilter] = useState('all');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'upload' | 'edit' | 'createPlaylist' | 'addPlaylist' | 'bulkPlaylist' | 'bulkDelete' | 'player' | null>(null);
  const [editing, setEditing] = useState<EditTrack | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [targetTrack, setTargetTrack] = useState<Track | null>(null);
  const [newPlaylist, setNewPlaylist] = useState({ name: '', description: '' });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [createFromBulk, setCreateFromBulk] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [legacyCount, setLegacyCount] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const t = UI[lang];
  useEffect(() => {
    if (tab !== 'settings' || !user) return;
    let active = true;
    void api<StorageSummary>('/api/storage/status').then(result => { if (active) setStorageSummary(result); }).catch(() => { if (active) setStorageSummary(null); });
    return () => { active = false; };
  }, [tab, user]);
  const onError = useCallback((message: string) => setError(message), []);
  const refresh = useCallback(async () => {
    const data = await api<Bootstrap>('/api/bootstrap');
    setTracks(data.tracks); setPlaylists(data.playlists); setEvents(data.events);
    const availableIds = new Set(data.tracks.map(track => track.id));
    setSelectedIds(previous => previous.filter(trackId => availableIds.has(trackId)));
  }, []);
  const recordEvent = useCallback((trackId: string, type: 'play' | 'pause' | 'skip' | 'complete', seconds: number) => {
    const event: ListeningEvent = { track_id: trackId, event_type: type, listened_seconds: seconds, created_at: new Date().toISOString() };
    setEvents(e => [event, ...e].slice(0, 3000));
    void api('/api/events', json({ trackId, type, listenedSeconds: seconds })).catch(() => {});
  }, []);
  const player = useMusicPlayer(recordEvent, onError);
  const mix = useMemo(() => dailyMix(tracks, events, new Date(), 30), [tracks, events]);
  const insights = useMemo(() => computeInsights(tracks, events), [tracks, events]);
  const featured = tracks.slice(0, 6);
  const selectedPlaylist = playlists.find(p => p.id === playlistId) ?? null;
  const playlistSongs = selectedPlaylist ? selectedPlaylist.track_ids.map(id => tracks.find(t => t.id === id)).filter((t): t is Track => Boolean(t)) : [];
  const filtered = useMemo(() => tracks.filter(track => {
    const text = `${track.title} ${track.artist} ${track.album} ${track.genre}`.toLocaleLowerCase();
    return (!query || text.includes(query.toLocaleLowerCase())) &&
      (moodFilter === 'all' || track.moods.includes(moodFilter)) &&
      (genreFilter === 'all' || track.genre === genreFilter) &&
      (languageFilter === 'all' || track.language === languageFilter);
  }), [tracks, query, moodFilter, genreFilter, languageFilter]);
  const favoriteTracks = tracks.filter(track => track.is_favorite);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  // A filter or a change of screen must not leave invisible tracks selected for deletion.
  useEffect(() => { setSelectedIds([]); }, [tab, playlistId, query, moodFilter, genreFilter, languageFilter]);
  const toast = (value: string) => { setNotice(value); setError(''); window.setTimeout(() => setNotice(''), 4200); };
  useEffect(() => {
    const stored = window.localStorage.getItem('vibebox-language');
    setLang(stored === 'vi' || stored === 'en' ? stored : navigator.language.startsWith('vi') ? 'vi' : 'en');
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) void navigator.serviceWorker.register(`${BASE}/sw.js`).catch(() => {});
    void init();
    async function init() {
      try {
        const c = await api<AppConfig>('/api/config'); setConfig(c);
        if (getToken()) {
          try {
            const u = await api<{ user: { id: string; email: string } }>('/api/auth/me');
            setUser(u.user); await refresh();
          } catch (err) { if (err instanceof HttpError && err.status === 401) setToken(null); else throw err; }
        }
      } catch (err) { setBootError(err instanceof Error ? err.message : 'Cannot reach API'); }
      finally { setBooting(false); }
    }
  }, [refresh]);
  function switchLanguage(value: UiLanguage) { setLang(value); window.localStorage.setItem('vibebox-language', value); }
  async function afterLogin(result: AuthResult) {
    setUser(result.user); setBootError('');
    try { await refresh(); } catch (err) { onError(err instanceof Error ? err.message : 'Cannot load library'); }
  }
  async function runTask(task: () => Promise<void>, success?: string) {
    setSaving(true); setError('');
    try { await task(); await refresh(); if (success) toast(success); }
    catch (err) { onError(err instanceof Error ? err.message : 'Unexpected error'); }
    finally { setSaving(false); }
  }
  async function toggleFavorite(track: Track) {
    await runTask(async () => { await api(`/api/tracks/${track.id}`, json({ is_favorite: !track.is_favorite }, 'PATCH')); }, t.saved);
  }
  function openEdit(track: Track) {
    setEditing({ id: track.id, title: track.title, artist: track.artist, album: track.album, genre: track.genre, language: track.language, moods: [...track.moods], year: track.year, duration_seconds: track.duration_seconds });
    setCoverFile(null); setDialog('edit');
  }
  async function uploadOne(file: File, kind: 'audio' | 'cover', trackId?: string, migrationTags?: {title:string;artist:string;album:string;genre:string;language:string;moods:string[];duration_seconds:number;year:null}) {
    const { uploadId, uploadUrl, contentType } = await api<{ uploadId: string; uploadUrl: string; contentType: string }>('/api/uploads/init', json({ filename: file.name, mimeType: file.type, size: file.size, kind, trackId }));
    await sendSignedFile(uploadUrl, file, contentType, setUploadProgress);
    const guessed = fallbackTitle(file.name), tags = suggestTags(file.name);
    const id3 = kind === 'audio' ? await readBasicTags(file) : {};
    let duration = kind === 'audio' ? Math.round(id3.duration || 0) : 0;
    if (kind === 'audio' && !duration) duration = await probeDuration(file);
    const metadata = migrationTags ?? { title: id3.title || guessed.title, artist: id3.artist || guessed.artist, album: id3.album || '', genre: id3.genre ? normalizeLegacyGenre(id3.genre) : tags.genre, language: normalizeLanguage(id3.language), moods: tags.moods, duration_seconds: duration, year: null };
    const result = await api<{item:{id:string}}>('/api/uploads/complete', json({ uploadId, ...(kind === 'audio' ? { metadata } : {}) }));
    return result.item.id;
  }
  async function startUpload() {
    if (!selectedFiles.length) return;
    setSaving(true); setError(''); let succeeded = 0;
    try {
      for (const [i, file] of selectedFiles.entries()) {
        setUploadStatus(`${i + 1}/${selectedFiles.length}: ${file.name}`); setUploadProgress(0);
        try { await uploadOne(file, 'audio'); succeeded++; }
        catch (err) { onError(`${file.name}: ${err instanceof Error ? err.message : 'Upload failed'}`); break; }
      }
      await refresh();
      if (succeeded === selectedFiles.length) { setDialog(null); setSelectedFiles([]); toast(`${t.uploaded}: ${succeeded}`); }
      else if (succeeded > 0) setSelectedFiles(files => files.slice(succeeded));
    } catch (err) { onError(err instanceof Error ? err.message : 'Upload failed'); }
    finally { setSaving(false); setUploadStatus(''); }
  }
  async function saveEdit() {
    if (!editing) return;
    await runTask(async () => {
      const { id, ...body } = editing;
      await api(`/api/tracks/${id}`, json(body, 'PATCH'));
      if (coverFile) await uploadOne(coverFile, 'cover', id);
      setDialog(null); setEditing(null);
    }, t.saved);
  }
  async function deleteTrack(track: Track) {
    if (!window.confirm(t.confirmDelete)) return;
    await runTask(async () => {
      await api(`/api/tracks/${track.id}`, { method: 'DELETE' });
      if (player.current?.id === track.id) player.audio.ref.current?.pause();
    }, t.deleted);
  }
  async function createPlaylist() {
    await runTask(async () => {
      const result = await api<{ playlist: Playlist }>('/api/playlists', json(newPlaylist));
      if (createFromBulk && selectedIds.length) {
        await appendTracksInBatches(result.playlist.id, selectedIds);
        setSelectedIds([]);
      }
      setCreateFromBulk(false); setPlaylistId(result.playlist.id); setNewPlaylist({ name: '', description: '' }); setDialog(null); setTab('playlists');
    }, t.saved);
  }
  async function addToPlaylist(id: string, trackId: string) {
    await runTask(async () => {
      await api(`/api/playlists/${id}/tracks`, json({ trackId })); setDialog(null);
    }, t.added);
  }
  function toggleSelected(id: string) {
    setSelectedIds(previous => toggleTrackSelection(previous, id));
  }
  function toggleAllVisible(list: Track[]) {
    const ids = list.map(track => track.id);
    setSelectedIds(previous => toggleVisibleSelection(previous, ids));
  }
  async function appendTracksInBatches(playlistId: string, trackIds: string[]) {
    let added = 0, skipped = 0;
    for (const batch of chunkTrackIds(trackIds, 1000)) {
      const result = await api<{ added: number; skipped: number }>(`/api/playlists/${playlistId}/tracks/bulk`,
        json({ trackIds: batch }));
      added += result.added; skipped += result.skipped;
    }
    return { added, skipped };
  }
  async function bulkAddToPlaylist(id: string) {
    const trackIds = [...selectedIds];
    if (!trackIds.length || saving) return;
    await runTask(async () => {
      const result = await appendTracksInBatches(id, trackIds);
      setSelectedIds([]); setDialog(null);
      toast(`${t.added}: ${result.added}${result.skipped ? ` · ${t.bulkDuplicates}: ${result.skipped}` : ''}`);
    });
  }
  async function bulkRemoveFromPlaylist(id: string) {
    if (!selectedIds.length || saving) return;
    await runTask(async () => {
      let removed = 0;
      for (const batch of chunkTrackIds(selectedIds, 1000)) {
        const result = await api<{ removed: number }>(`/api/playlists/${id}/tracks/bulk`, {
          ...json({ trackIds: batch }), method: 'DELETE'
        });
        removed += result.removed;
      }
      setSelectedIds([]); toast(`${t.bulkRemoved}: ${removed}`);
    });
  }
  async function bulkDeleteTracks() {
    if (!selectedIds.length || saving || (selectedIds.length >= 100 && deletePhrase !== 'DELETE')) return;
    const all = [...selectedIds];
    const completed: string[] = [];
    let orphanFiles = 0;
    setSaving(true); setError('');
    try {
      // One request is bounded by the API. Process larger libraries in safe chunks.
      for (const batch of chunkTrackIds(all, 100)) {
        setUploadStatus(`${completed.length + batch.length}/${all.length}`);
        const result = await api<{ deleted: number; orphanFiles: number }>('/api/tracks/bulk', {
          ...json({ trackIds: batch }), method: 'DELETE'
        });
        completed.push(...batch);
        orphanFiles += result.orphanFiles;
      }
      setDialog(null);
      toast(`${t.bulkDeleted}: ${completed.length}${orphanFiles ? ` · ${t.bulkOrphanWarning}: ${orphanFiles}` : ''}`);
    } catch (err) {
      onError(`${t.bulkPartial}: ${completed.length}/${all.length}. ${err instanceof Error ? err.message : 'Request failed'}`);
      setDialog(null);
    } finally {
      if (completed.length) {
        player.forgetTracks(completed);
        setSelectedIds(previous => previous.filter(id => !completed.includes(id)));
      }
      try { await refresh(); } catch (err) { onError(err instanceof Error ? err.message : 'Refresh failed'); }
      setUploadStatus(''); setSaving(false);
    }
  }
  async function deletePlaylist(id: string) {
    if (!window.confirm(t.confirmPlaylistDelete)) return;
    await runTask(async () => {
      await api(`/api/playlists/${id}`, { method: 'DELETE' }); setPlaylistId(null);
    }, t.deleted);
  }
  async function inspectV1() {
    try {
      const old = await loadLegacy();
      setLegacyCount(old?.tracks.filter(x=>x.hasLocalFile && old.files.has(x.id)).length ?? 0);
      if (!old) toast(lang === 'vi' ? 'Không tìm thấy dữ liệu V1 trên cùng origin trình duyệt.' : 'No v1 browser data found on this origin.');
    } catch (e) { onError(e instanceof Error ? e.message : 'Cannot inspect V1'); }
  }
  async function migrateV1() {
    const old = await loadLegacy();
    if (!old) { onError('legacy VibeBox v1 IndexedDB not available on this origin.'); return; }
    setSaving(true); setError('');
    const key = `vibebox-v1-idmap-${user?.id}`;
    const map: Record<string,string> = JSON.parse(window.localStorage.getItem(key) || '{}');
    try {
      const items = old.tracks.filter(x=>x.hasLocalFile && old.files.has(x.id));
      for (const [i, item] of items.entries()) {
        if (map[item.id]) continue;
        const blob = old.files.get(item.id)!;
        const filename = item.filename || `${item.title || 'music'}.mp3`;
        const file = new File([blob], filename, {type:item.mime || blob.type || 'audio/mpeg'});
        setUploadStatus(`V1 ${i+1}/${items.length}: ${filename}`); setUploadProgress(0);
        const moods = (item.moods || []).map(m=>m==='love'?'romantic':m==='nostalgia'?'nostalgic':m);
        const id = await uploadOne(file, 'audio', undefined, { title:item.title || fallbackTitle(filename).title, artist:item.artist || 'Unknown artist', album:item.album || '', genre:normalizeLegacyGenre(item.genre), language:normalizeLanguage(item.language), moods, duration_seconds:Math.max(0,Math.round(item.duration||0)), year:null });
        map[item.id] = id;
        window.localStorage.setItem(key, JSON.stringify(map));
      }
      const migratedListKey = `vibebox-v1-playlist-map-${user?.id}`;
      const playlistMap: Record<string,string> = JSON.parse(window.localStorage.getItem(migratedListKey) || '{}');
      for (const p of old.playlists) {
        let newId = playlistMap[p.id];
        if (!newId) {
          const created = await api<{playlist:{id:string}}>('/api/playlists', json({name:p.name||'V1 Playlist',description:'Imported from VibeBox v1'}));
          newId = created.playlist.id;
          playlistMap[p.id] = newId;
          window.localStorage.setItem(migratedListKey, JSON.stringify(playlistMap));
        }
        for (const oldTrackId of p.trackIds || []) if (map[oldTrackId]) await api(`/api/playlists/${newId}/tracks`, json({trackId:map[oldTrackId]}));
      }
      await refresh();
      toast(lang==='vi'?'Đã nhập V1 thành công, dữ liệu cũ được giữ nguyên.':'V1 imported. Original data was preserved.');
      setLegacyCount(null);
    } catch (e) { onError(`V1 import interrupted: ${e instanceof Error?e.message:'unknown'}. Retry to resume.`); }
    finally {setSaving(false);setUploadStatus('');}
  }
  const openAdd = (track: Track) => { setTargetTrack(track); setDialog('addPlaylist'); };
  const nav = (Object.keys(iconSet) as Tab[]).map(key => ({ key, Icon: iconSet[key], label: t[key] }));
  const songList = (list: Track[], opts?: { playlistId?: string; selectable?: boolean }) => <div className="overflow-hidden rounded-[20px] border border-white/[.065] bg-[#19352d]/75">
    {list.length === 0 ? <div className="px-6 py-12 text-center text-sm text-[#99bcb4]">{t.noResults}</div> : list.map((track, i) => <div key={track.id} className={`song-row group flex items-center gap-2 border-b border-white/[.05] px-2 py-2.5 last:border-0 sm:gap-3 sm:px-4 ${opts?.selectable && selectedSet.has(track.id) ? 'song-selected' : ''}`}>
      {opts?.selectable && <label className="flex h-10 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-white/[.06]" title={`${t.bulkSelect} ${track.title}`}>
        <input type="checkbox" className="music-checkbox" aria-label={`${t.bulkSelect} ${track.title}`} checked={selectedSet.has(track.id)} disabled={saving} onChange={() => toggleSelected(track.id)}/>
      </label>}
      <span className="hidden w-6 shrink-0 text-center text-xs text-[#8aaba4] sm:block">{String(i + 1).padStart(2, '0')}</span>
      <button title={t.play} aria-label={`${t.play} ${track.title}`} onClick={() => void player.playTrack(track, list)} className="relative shrink-0"><Artwork track={track} size="md"/><span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/55 opacity-0 transition group-hover:opacity-100"><Play size={18} fill="white"/></span></button>
      <button className="min-w-0 flex-1 text-left" onClick={() => void player.playTrack(track, list)}><p className={`truncate text-sm font-semibold ${player.current?.id === track.id ? 'text-[#6ac6bc]' : 'text-[#effaf7]'}`}>{track.title}</p><p className="mt-0.5 truncate text-xs text-[#a1bab3]">{track.artist} · {track.album || track.genre}</p></button>
      <span className="hidden max-w-[90px] truncate rounded-full bg-white/[.06] px-2.5 py-1 text-[11px] text-[#a7c3bc] md:block">{track.genre}</span>
      <span className="hidden w-[50px] text-right text-xs text-[#8eaaa3] sm:block">{formatTime(track.duration_seconds)}</span>
      <button onClick={() => void toggleFavorite(track)} className={`icon-button ${track.is_favorite ? 'text-[#f19bad]' : ''}`} aria-label={t.liked} title={t.liked}><Heart size={17} fill={track.is_favorite ? 'currentColor' : 'none'}/></button>
      <button onClick={() => openAdd(track)} className="icon-button" title={t.addPlaylist} aria-label={t.addPlaylist}><Plus size={17}/></button>
      {opts?.playlistId ? <button onClick={() => void runTask(async () => { await api(`/api/playlists/${opts.playlistId}/tracks/${track.id}`, { method: 'DELETE' }); }, t.deleted)} className="icon-button" aria-label={t.bulkRemovePlaylist}><X size={16}/></button> : <button onClick={() => openEdit(track)} className="icon-button" title={t.edit} aria-label={t.edit}><MoreHorizontal size={18}/></button>}
    </div>)}
  </div>;
  const bulkToolbar = (list: Track[], playlistContext?: string) => {
    const count = list.filter(track => selectedSet.has(track.id)).length;
    const allSelected = list.length > 0 && count === list.length;
    return <div className="bulk-toolbar sticky top-[68px] z-[9] mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[#6ac6bc]/30 bg-[#122822]/95 p-3 shadow-xl backdrop-blur-xl">
      <label className="flex cursor-pointer items-center gap-2 px-1 text-xs font-semibold text-[#c5e7e1] sm:text-sm">
        <input type="checkbox" className="music-checkbox" checked={allSelected} disabled={saving || !list.length} onChange={() => toggleAllVisible(list)}/>
        {t.bulkSelectAll} ({list.length})
      </label>
      <span className="rounded-full bg-[#20534a] px-2.5 py-1 text-xs font-bold text-[#b7f4e9]">{count} {t.bulkSelected}</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {count > 0 && <><button className="btn-primary px-3 py-2 text-xs" disabled={saving} onClick={() => setDialog('bulkPlaylist')}><ListMusic size={15}/>{t.bulkAddPlaylist}</button>
          {playlistContext && <button className="btn-muted px-3 py-2 text-xs" disabled={saving} onClick={() => void bulkRemoveFromPlaylist(playlistContext)}><X size={15}/>{t.bulkRemovePlaylist}</button>}
          <button className="btn-danger px-3 py-2 text-xs" disabled={saving} onClick={() => {setDeletePhrase('');setDialog('bulkDelete');}}><Trash2 size={15}/>{t.bulkDelete}</button>
          <button className="icon-button" disabled={saving} onClick={() => setSelectedIds([])} title={t.bulkClear} aria-label={t.bulkClear}><X size={17}/></button></>}
      </div>
    </div>;
  };
  const simpleEmpty = <div className="flex flex-col items-center justify-center rounded-[24px] border border-dashed border-white/15 bg-white/[.015] px-5 py-16 text-center"><div className="mb-5 rounded-3xl bg-teal-500/10 p-5 text-[#8cdcd1]"><Music2 size={40}/></div><h2 className="text-xl font-semibold">{t.noSongs}</h2><p className="mt-2 max-w-sm text-sm text-[#69c2bb]">{t.noSongsTip}</p><button onClick={() => setDialog('upload')} className="btn-primary mt-6"><UploadCloud size={17}/>{t.upload}</button></div>;
  if (booting) return <div className="flex min-h-dvh items-center justify-center gap-3 bg-[#0b1715] text-[#d2f4ed]"><LoaderCircle className="animate-spin"/>{t.loading}</div>;
  if (bootError || !config) return <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-[#0b1715] p-6 text-center text-white"><Cloud size={46} className="text-[#6ac6bc]"/><h1 className="text-2xl font-bold">{t.errorTitle}</h1><p className="max-w-lg text-[#70cfc8]">{bootError || `API: ${API_URL}`}</p><code className="rounded-xl border border-white/10 p-3 text-sm text-[#9ae2d8]">{API_URL}</code><button className="btn-primary" onClick={() => window.location.reload()}>{t.retry}</button></div>;
  if (!user) return <AuthScreen config={config} lang={lang} onLogin={afterLogin}/>;
  return <div className="app-shell min-h-dvh text-[#f1fcf8]">
    <audio ref={player.audio.ref} preload="metadata" onTimeUpdate={player.audio.onTimeUpdate} onLoadedMetadata={player.audio.onLoadedMetadata} onPlay={player.audio.onPlay} onPause={player.audio.onPause} onEnded={player.audio.onEnded} onError={player.audio.onError} className="hidden" />
    <aside className="sidebar fixed inset-y-0 left-0 z-20 hidden w-[245px] flex-col border-r border-white/[.055] bg-[#10211d] px-4 pb-28 pt-8 md:flex">
      <div className="mb-11 flex items-center gap-3 px-3"><div className="rounded-[14px] bg-[#20534a] p-2.5"><Disc3 size={23}/></div><div><div className="text-[25px] font-black tracking-tight leading-none">music <span className="text-[#6ac6bc]">fuq me</span></div><div className="mt-1 text-[9px] tracking-[.2em] text-[#58a29b]">YOUR PERSONAL SOUND</div></div></div>
      <div className="px-3 pb-3 text-[10px] font-bold tracking-[.18em] text-[#799d93] uppercase">MENU</div>
      <nav className="space-y-1">{nav.map(item => <button key={item.key} onClick={() => { setTab(item.key); if (item.key !== 'playlists') setPlaylistId(null); }} className={`side-link ${tab === item.key ? 'side-active' : ''}`}><item.Icon size={19}/><span>{item.label}</span>{tab === item.key && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#6ac6bc]"/>}</button>)}</nav>
      <div className="mt-10 px-3 pb-3 text-[10px] font-bold tracking-[.18em] text-[#799d93] uppercase">YOUR LIBRARY</div>
      <button onClick={() => { setTab('library'); setMoodFilter('all'); setGenreFilter('all'); setLanguageFilter('all'); setQuery(''); }} className="side-link"><Music2 size={19}/>{t.allSongs}<span className="ml-auto text-xs text-[#799d93]">{tracks.length}</span></button>
      <button onClick={() => { setTab('library'); setMoodFilter('all'); setGenreFilter('all'); setLanguageFilter('all'); setQuery(''); }} className="side-link"><Heart size={19}/>{t.liked}<span className="ml-auto text-xs text-[#799d93]">{favoriteTracks.length}</span></button>
      <div className="mt-auto rounded-[18px] border border-[#20534a]/20 bg-gradient-to-br from-[#20534a] to-[#142e27] p-4"><Sparkles className="mb-3 text-[#ccfff9]" size={21}/><p className="text-sm font-semibold">{t.daily}</p><p className="mt-1 text-xs leading-relaxed text-[#70d0c7]">{t.dailyInfo}</p><button onClick={() => { if (mix.length) void player.playTrack(mix[0], mix); }} className="mt-4 flex items-center gap-1.5 text-xs font-bold text-[#ccfffa]">{t.playMix}<ArrowRight size={14}/></button></div>
    </aside>
    <div className="md:ml-[245px]">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/[.04] bg-[#0b1715]/90 px-4 py-4 backdrop-blur-xl sm:px-8 lg:px-10">
        <div className="flex items-center gap-3 md:hidden"><div className="rounded-[11px] bg-[#20534a] p-2"><Disc3 size={20}/></div><span className="text-xl font-black tracking-tight">music <span className="text-[#82d5cc]">fuq me</span></span></div>
        <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex"><span className="text-sm text-[#5aa6a0]">Your space</span><span className="text-[#39726d]">/</span><span className="text-sm font-medium">{t[tab]}</span></div>
        <div className="flex items-center gap-2 sm:gap-3"><button className="icon-button md:hidden" aria-label={t.search} onClick={() => setTab('library')}><Search size={20}/></button><span className="hidden rounded-full border border-white/[.08] bg-white/[.035] px-3 py-2 text-xs text-[#a6cfcc] sm:block">{lang === 'vi' ? 'Xin chào' : 'Welcome'} 👋</span><button onClick={() => setDialog('upload')} className="btn-primary py-2.5 text-xs sm:text-sm"><Plus size={17}/><span>{t.upload}</span></button><button onClick={() => setTab('settings')} className="user-avatar" title={user.email}>{user.email.charAt(0).toUpperCase()}</button></div>
      </header>
      <main className="mx-auto max-w-[1350px] px-4 pb-[180px] pt-7 sm:px-8 sm:pt-9 md:pb-[145px] lg:px-10">
        {tab === 'discover' && <>
          <div className="mb-7 flex items-center justify-between"><div><p className="mb-2 text-xs font-medium text-[#6ac6bc]">✦ {t.recommended}</p><h1 className="text-[27px] font-extrabold tracking-tight sm:text-4xl">{t.greeting} <span className="inline-block">✌️</span></h1><p className="mt-2 text-sm text-[#67bfb8]">{t.subheading}</p></div><div className="hidden rounded-2xl border border-white/10 bg-[#18312b] p-3 text-center sm:block"><Headphones className="mx-auto mb-1 text-[#82d5cc]" size={22}/><span className="text-xs text-[#6cc9c1]">{tracks.length} {t.songs}</span></div></div>
          <div className="hero-gradient relative mb-9 min-h-[215px] overflow-hidden rounded-[26px] p-6 sm:min-h-[245px] sm:p-9">
            <div className="relative z-10 max-w-[60%] sm:max-w-[58%]"><span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-bold tracking-widest"><Sparkles size={12}/> SMART PLAYLIST</span><h2 className="text-[26px] font-black leading-[1.1] tracking-tight sm:text-[43px]">{t.daily}</h2><p className="mt-2 hidden text-sm leading-relaxed text-[#ccfffb]/80 sm:block">{t.dailyInfo}</p><button disabled={!mix.length} onClick={() => void player.playTrack(mix[0], mix)} className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-bold text-[#397168] transition hover:scale-[1.03] disabled:opacity-50 sm:text-sm"><Play size={17} fill="currentColor"/>{t.playMix}</button></div>
            <div className="hero-record pointer-events-none absolute -bottom-[50px] -right-[80px] h-[300px] w-[300px] rounded-full sm:-bottom-[100px] sm:right-[35px] sm:h-[420px] sm:w-[420px]"><div className="hero-record-center absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full sm:h-28 sm:w-28"><div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#162321]"/></div></div>
          </div>
          <SectionHeading eyebrow="MATCH YOUR FEELING" title={t.moods} />
          <div className="mood-scroll mb-10 flex gap-3 overflow-x-auto pb-3">{MOODS.map((m, i) => <button key={m} onClick={() => { setMoodFilter(m); setTab('library'); }} className={`mood-card mood-${i % 6} flex min-w-[142px] flex-col justify-between rounded-[20px] p-4 text-left sm:min-w-[172px] sm:p-5`}><span className="text-[28px]">{MOOD_LABELS[m].emoji}</span><div><span className="block text-base font-semibold">{MOOD_LABELS[m][lang]}</span><span className="mt-1 block text-[11px] text-white/55">{tracks.filter(track => track.moods.includes(m)).length} {t.songs}</span></div></button>)}</div>
          <SectionHeading eyebrow="FRESH IN YOUR COLLECTION" title={t.recentlyAdded} right={<button className="text-sm font-semibold text-[#6ac6bc]" onClick={() => setTab('library')}>{t.allSongs} <ArrowRight size={14} className="inline"/></button>}/>
          {tracks.length ? songList(featured) : simpleEmpty}
          {!!favoriteTracks.length && <div className="mt-10"><SectionHeading title={`❤️ ${t.liked}`}/>{songList(favoriteTracks.slice(0, 5))}</div>}
        </>}
        {tab === 'library' && <>
          <SectionHeading eyebrow="YOUR COLLECTION" title={t.library} right={<span className="rounded-full bg-[#1d3b33] px-3 py-1.5 text-xs text-[#93dcd2]">{filtered.length} {t.songs}</span>}/>
          <div className="mb-5 flex flex-wrap gap-3"><div className="relative min-w-[200px] flex-1"><Search size={18} className="absolute left-4 top-3.5 text-[#5caba3]"/><input className="form-input pl-11" placeholder={t.search} value={query} onChange={e=>setQuery(e.target.value)}/></div>
            <FilterSelect label={t.genre} value={genreFilter} onChange={setGenreFilter} options={[{value:'all',label:t.allGenres}, ...GENRES.map(g=>({value:g,label:g}))]}/>
            <FilterSelect label={t.language} value={languageFilter} onChange={setLanguageFilter} options={[{value:'all',label:t.allLanguages},...LANGUAGES.map(l=>({value:l,label:`${LANGUAGE_LABELS[l].emoji} ${LANGUAGE_LABELS[l][lang]}`}))]}/>
            <FilterSelect label={t.mood} value={moodFilter} onChange={setMoodFilter} options={[{value:'all',label:t.moods}, ...MOODS.map(m=>({value:m,label:MOOD_LABELS[m][lang]}))]}/>
          </div>{tracks.length ? <>{bulkToolbar(filtered)}{songList(filtered, {selectable:true})}</> : simpleEmpty}
        </>}
        {tab === 'playlists' && <>
          {selectedPlaylist ? <><button className="mb-6 inline-flex items-center gap-2 text-sm text-[#a8d2ce] hover:text-white" onClick={()=>setPlaylistId(null)}><ArrowLeft size={17}/>{t.playlists}</button><div className="mb-7 flex items-center gap-5"><div className="flex h-24 w-24 items-center justify-center rounded-[22px] bg-gradient-to-br from-[#246b5c] to-[#153b33]"><ListMusic size={42}/></div><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-widest text-[#6ac6bc]">PLAYLIST</p><h1 className="mt-1 truncate text-2xl font-bold sm:text-4xl">{selectedPlaylist.name}</h1><p className="mt-1 text-sm text-[#68c0b9]">{playlistSongs.length} {t.songs} · {selectedPlaylist.description}</p></div></div><div className="mb-5 flex flex-wrap gap-3"><button className="btn-primary" disabled={!playlistSongs.length} onClick={()=>void player.playTrack(playlistSongs[0], playlistSongs)}><Play size={18} fill="currentColor"/>{t.play}</button><button className="btn-muted text-red-300" onClick={()=>void deletePlaylist(selectedPlaylist.id)}><Trash2 size={16}/>{t.remove}</button></div>{playlistSongs.length ? <>{bulkToolbar(playlistSongs, selectedPlaylist.id)}{songList(playlistSongs, {playlistId:selectedPlaylist.id,selectable:true})}</> : <p className="rounded-xl border border-white/10 p-8 text-center text-[#68c0b9]">{t.emptyPlaylist}</p>}</> : <><SectionHeading eyebrow="COLLECT YOUR FAVORITES" title={t.playlists} right={<button className="btn-primary" onClick={()=>{setCreateFromBulk(false);setDialog('createPlaylist');}}><Plus size={17}/>{t.createPlaylist}</button>}/>{playlists.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{playlists.map((p, i)=><button key={p.id} onClick={()=>setPlaylistId(p.id)} className="playlist-card flex items-center gap-4 rounded-[20px] border border-white/[.075] p-4 text-left"><div className={`artwork art-${['a','b','c','d','e','f'][i%6]} flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl`}><ListMusic size={27}/></div><div className="min-w-0"><p className="truncate font-bold">{p.name}</p><p className="mt-1 truncate text-xs text-[#66bdb6]">{p.description || `${p.track_ids.length} ${t.songs}`}</p><p className="mt-2 text-xs text-[#ccfff9]">{p.track_ids.length} {t.songs}</p></div></button>)}</div> : <div className="rounded-[20px] border border-dashed border-white/10 p-14 text-center text-sm text-[#69c2bb]">{t.emptyPlaylistList}</div>}</>}
        </>}
        {tab === 'insights' && <>
          <SectionHeading eyebrow="YOUR MUSIC IN NUMBERS" title={t.listening}/><p className="mb-7 text-sm text-[#66bdb6]">{t.week}</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
            { name:t.plays, value:insights.plays, icon:Play, shade:'from-[#20534a]/25 to-[#53998e]/15' },
            { name:t.minutes, value:insights.minutes, icon:Headphones, shade:'from-[#f08a99]/20 to-[#2c4b47]/15' },
            { name:t.favoriteGenre, value:insights.favoriteGenre || '—', icon:Disc3, shade:'from-[#4ebeb4]/20 to-[#22504c]/15' },
            { name:t.favoriteLanguage, value:LANGUAGE_LABELS[insights.favoriteLanguage || 'unknown']?.[lang] || '—', icon:Music, shade:'from-[#e5aa64]/20 to-[#4e3624]/15' }
          ].map(item=><div key={item.name} className={`rounded-[20px] border border-white/[.08] bg-gradient-to-br ${item.shade} p-5`}><item.icon size={23} className="mb-5 text-[#b5ebe2]"/><p className="text-2xl font-black sm:text-3xl">{item.value}</p><p className="mt-2 text-xs text-[#6ac5bd]">{item.name}</p></div>)}</div>
          <div className="mt-6 rounded-[24px] border border-white/[.07] bg-[#162923] p-6"><h3 className="mb-6 font-semibold">{lang === 'vi' ? 'Lượt phát theo ngày' : 'Plays by day'}</h3><div className="flex h-48 items-end gap-3">{Array.from({length:7},(_,i)=>{
            const day = new Date(); day.setHours(0,0,0,0); day.setDate(day.getDate()-(6-i));
            const number = events.filter(e=> e.event_type==='play' && new Date(e.created_at).toDateString() === day.toDateString()).length;
            const max = Math.max(1,...Array.from({length:7},(_,j)=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-(6-j));return events.filter(e=>e.event_type==='play'&&new Date(e.created_at).toDateString()===d.toDateString()).length;}));
            return <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"><span className="text-xs text-[#a9d3d0]">{number || ''}</span><div className="w-full max-w-16 rounded-t-lg bg-gradient-to-t from-[#20534a] to-[#6ac6bc]" style={{height:`${Math.max(5,number/max*145)}px`}}/><span className="text-[10px] text-[#66bcb5]">{day.toLocaleDateString(lang==='vi'?'vi-VN':'en-US',{weekday:'short'})}</span></div>;
          })}</div></div>
        </>}
        {tab === 'settings' && <>
          <SectionHeading eyebrow="PERSONAL SPACE" title={t.settings}/>
          <div className="max-w-[690px] space-y-4"><div className="settings-panel"><h3 className="mb-4 flex items-center gap-2 font-semibold"><Headphones size={20} className="text-[#6ac6bc]"/>{t.account}</h3><p className="text-sm text-[#a9c9c0]">{user.email}</p><button className="btn-muted mt-5" onClick={()=>{ player.audio.ref.current?.pause(); window.google?.accounts.id.disableAutoSelect(); setToken(null); setUser(null); setTracks([]); setPlaylists([]); setEvents([]); }}><LogOut size={17}/>{t.logout}</button></div>
            <div className="settings-panel"><h3 className="mb-4 font-semibold">Language / Ngôn ngữ</h3><div className="inline-flex rounded-xl bg-[#0b1715] p-1"><button onClick={()=>switchLanguage('vi')} className={`rounded-lg px-4 py-2 text-sm ${lang==='vi'?'bg-[#20534a] text-white':'text-[#6fcec6]'}`}>🇻🇳 Tiếng Việt</button><button onClick={()=>switchLanguage('en')} className={`rounded-lg px-4 py-2 text-sm ${lang==='en'?'bg-[#20534a] text-white':'text-[#6fcec6]'}`}>🇬🇧 English</button></div></div>
            <div className="settings-panel"><h3 className="mb-4 flex items-center gap-2 font-semibold"><Cloud size={20} className="text-[#6ac6bc]"/> Backend & Storage</h3><div className="space-y-3 text-sm"><div className="flex justify-between gap-4"><span className="text-[#93afa7]">{t.API}</span><span className="max-w-[65%] break-all text-right text-xs text-[#c4f5f1]">{API_URL}</span></div><div className="flex justify-between"><span className="text-[#93afa7]">{t.storage}</span><span className="rounded-lg bg-[#21453c] px-2.5 py-1 text-xs font-bold uppercase text-[#ccfffa]">{config.storageDriver}</span></div><div className="flex justify-between"><span className="text-[#93afa7]">Max / file</span><span>{config.maxUploadMB} MB</span></div>{storageSummary && <div className="rounded-xl border border-[#6ac6bc]/20 bg-[#6ac6bc]/5 p-3 text-xs" aria-label="Cloud storage migration status"><p className="mb-2 font-semibold text-[#b7fff5]">{lang==='vi'?'Vị trí lưu nhạc':'Audio storage location'}</p>{(['r2','local'] as const).map(d => { const row = storageSummary.tracks.find(x=>x.storage_driver===d); return <div key={d} className="flex justify-between py-1"><span>{d==='r2'?'Cloudflare R2':'Local disk'}</span><span>{row?.count??'0'} {lang==='vi'?'bài':'tracks'} · {(Number(row?.bytes??0)/1073741824).toFixed(2)} GB</span></div>; })}<p className="mt-2 text-[#8fcfc7]">{lang==='vi'?'Bài cũ vẫn phát được khi chuyển lên R2. Việc chuyển file chạy bằng lệnh riêng trên API host.':'Local tracks remain playable during migration. File transfer runs separately on the API host.'}</p></div>}</div><button className="btn-muted mt-5" onClick={()=>void refresh().then(()=>toast(t.saved)).catch(e=>onError(e.message))}><ArrowDownToLine size={16}/>{t.refresh}</button></div>
            <div className="settings-panel"><h3 className="mb-3 font-semibold">{lang==='vi'?'Chuyển dữ liệu VibeBox V1':'Import VibeBox V1'}</h3><p className="mb-4 text-xs leading-relaxed text-[#6dcac2]">{lang==='vi'?'Chỉ dùng được khi bản V1 và V2 chạy trên cùng origin, trên chính trình duyệt đã lưu nhạc. Chép file MP3 và playlist lên server, không xóa dữ liệu V1.':'Requires V1/V2 on the same browser origin. Imports local files and playlists, leaving V1 data unchanged.'}</p><div className="flex flex-wrap items-center gap-3"><button disabled={saving} className="btn-muted" onClick={()=>void inspectV1()}><Search size={16}/>{lang==='vi'?'Kiểm tra V1':'Find V1 data'}</button>{legacyCount!==null && <span className="text-xs text-[#cbfef9]">{legacyCount} {t.songs}</span>}{legacyCount!==null && legacyCount>0 && <button disabled={saving} className="btn-primary" onClick={()=>void migrateV1()}><ArrowDownToLine size={16}/>{lang==='vi'?'Nhập lên server':'Import to cloud'}</button>}</div>{!!uploadStatus && <p className="mt-3 text-xs text-[#ccfffa]">{uploadStatus} — {uploadProgress}%</p>}</div>
            <p className="px-2 text-xs leading-6 text-[#59a59e]">{t.about}. Web player may pause in the background on some iOS versions. Keep backups of original audio files.</p></div>
        </>}
      </main>
    </div>
    {player.current && <div className="player-shell fixed bottom-[66px] left-0 right-0 z-30 border-t border-white/[.08] bg-[#102620]/95 backdrop-blur-xl md:bottom-0 md:left-[245px]">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-white/10 md:hidden"><div className="h-full bg-[#ccfff9]" style={{width:`${player.duration ? player.position/player.duration*100 : 0}%`}}/></div>
      <div className="flex h-[71px] items-center gap-3 px-3 sm:px-6 md:h-[94px] md:gap-5 md:px-8">
        <button className="shrink-0" onClick={()=>setDialog('player')}><Artwork track={player.current} size="md"/></button>
        <button onClick={()=>setDialog('player')} className="min-w-0 max-w-[275px] flex-1 text-left"><p className="truncate text-sm font-semibold">{player.current.title}</p><p className="mt-0.5 truncate text-xs text-[#65bbb4]">{player.current.artist}</p></button>
        <div className="flex items-center gap-2 md:hidden"><button className="icon-button" onClick={()=>void player.toggle()} aria-label={player.playing?'Pause':'Play'}>{player.playing?<Pause size={22} fill="currentColor"/>:<Play size={22} fill="currentColor"/>}</button><button className="icon-button" onClick={()=>player.next()} aria-label="Next"><SkipForward size={22} fill="currentColor"/></button></div>
        <div className="hidden flex-1 flex-col items-center gap-2 md:flex"><div className="flex items-center gap-5"><button className={`icon-button ${player.shuffle?'text-[#ccfff9]':''}`} title="Shuffle" onClick={()=>player.setShuffle(v=>!v)}><Shuffle size={18}/></button><button className="icon-button" aria-label="Previous" onClick={player.previous}><SkipBack size={21} fill="currentColor"/></button><button className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#2e4f4b] transition hover:scale-105" aria-label={player.playing?'Pause':'Play'} onClick={()=>void player.toggle()}>{player.playing?<Pause size={19} fill="currentColor"/>:<Play size={19} fill="currentColor"/>}</button><button className="icon-button" aria-label="Next" onClick={()=>player.next()}><SkipForward size={21} fill="currentColor"/></button><button className={`icon-button ${player.repeat!=='off'?'text-[#ccfff9]':''}`} title={t[player.repeat==='one'?'repeatOne':player.repeat==='all'?'repeatAll':'repeatOff']} onClick={player.cycleRepeat}>{player.repeat==='one'?<Repeat1 size={18}/>:<Repeat size={18}/>}</button></div>
          <div className="flex w-full max-w-xl items-center gap-3 text-[10px] text-[#61b4ad]"><span>{formatTime(player.position)}</span><input type="range" min={0} max={player.duration||1} step={1} value={Math.min(player.position,player.duration||1)} onChange={e=>player.seek(Number(e.target.value))} className="progress-slider flex-1" aria-label="Seek"/><span>{formatTime(player.duration)}</span></div></div>
        <div className="hidden w-[135px] items-center gap-2 lg:flex"><Volume2 size={18} className="text-[#6dcac2]"/><input type="range" min={0} max={1} step={0.05} value={player.volume} onChange={e=>player.changeVolume(Number(e.target.value))} className="progress-slider w-full" aria-label="Volume"/></div>
      </div>
    </div>}
    <nav className="mobile-nav fixed bottom-0 left-0 right-0 z-30 flex h-[67px] items-center justify-around border-t border-white/[.09] bg-[#10211d]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">{nav.map(item=><button key={item.key} onClick={()=>{setTab(item.key);if(item.key!=='playlists')setPlaylistId(null);}} className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] ${tab===item.key?'text-[#6ac6bc]':'text-[#5eaea7]'}`}><item.Icon size={20}/><span>{item.label}</span></button>)}</nav>
    {(notice || error) && <div role="status" className={`fixed bottom-[149px] left-1/2 z-[90] w-[min(94vw,490px)] -translate-x-1/2 rounded-xl border p-3 text-center text-sm shadow-2xl md:bottom-28 ${error ? 'border-red-500/40 bg-[#2a4944] text-red-100' : 'border-green-500/30 bg-[#263c38] text-green-100'}`}>{error || notice}<button aria-label="Dismiss" className="ml-4 inline-flex" onClick={()=>{setError('');setNotice('');}}><X size={14}/></button></div>}
    {dialog === 'upload' && <Modal title={t.upload} onClose={()=>{if(!saving)setDialog(null);}}><p className="mb-5 text-sm leading-relaxed text-[#6ecbc3]">{t.uploadInstructions}</p><label className="mb-4 flex cursor-pointer flex-col items-center gap-3 rounded-[20px] border-2 border-dashed border-[#20534a]/40 bg-[#20534a]/[.06] p-8 text-center"><UploadCloud size={34} className="text-[#ccfff9]"/><span className="text-sm text-[#c0f1ed]">{selectedFiles.length ? `${selectedFiles.length} ${t.songs}` : t.upload}</span><input type="file" accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg,.opus,.webm,.aac" multiple className="sr-only" onChange={e=>setSelectedFiles(Array.from(e.target.files??[]))}/></label><p className="mb-5 text-xs text-[#5fb0a8]">{t.uploadTip} Max: {config.maxUploadMB} MB / file.</p>{!!uploadStatus && <div className="mb-4 space-y-2"><p className="truncate text-xs text-[#ccfffa]">{t.uploading} {uploadStatus}</p><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#6ac6bc] transition-all" style={{width:`${uploadProgress}%`}}/></div></div>}<button disabled={!selectedFiles.length||saving} onClick={()=>void startUpload()} className="btn-primary w-full justify-center py-3">{saving?<LoaderCircle className="animate-spin" size={18}/>:<UploadCloud size={18}/>} {t.upload}</button></Modal>}
    {dialog === 'edit' && editing && <Modal title={t.edit} onClose={()=>setDialog(null)}><div className="space-y-4">{(['title','artist','album'] as const).map(key=><label key={key} className="block text-xs text-[#a4c3ba]">{t[key]}<input className="form-input mt-1.5" value={editing[key]} onChange={e=>setEditing(v=>v?{...v,[key]:e.target.value}:v)}/></label>)}<div className="grid grid-cols-2 gap-3"><label className="block text-xs text-[#a4c3ba]">{t.genre}<select className="form-input mt-1.5" value={editing.genre} onChange={e=>setEditing(v=>v?{...v,genre:e.target.value}:v)}>{GENRES.map(g=><option className="bg-[#1c302a]" key={g}>{g}</option>)}</select></label><label className="block text-xs text-[#a4c3ba]">{t.language}<select className="form-input mt-1.5" value={editing.language} onChange={e=>setEditing(v=>v?{...v,language:e.target.value}:v)}>{LANGUAGES.map(l=><option className="bg-[#1c302a]" key={l} value={l}>{LANGUAGE_LABELS[l][lang]}</option>)}</select></label></div><label className="block text-xs text-[#a4c3ba]">{t.year}<input className="form-input mt-1.5" type="number" min="1900" max="2100" value={editing.year??''} onChange={e=>setEditing(v=>v?{...v,year:e.target.value?Number(e.target.value):null}:v)}/></label><p className="text-xs text-[#6fcdc5]">{t.mood}</p><div className="flex flex-wrap gap-2">{MOODS.map(m=><button key={m} onClick={()=>setEditing(v=>v?{...v,moods:v.moods.includes(m)?v.moods.filter(x=>x!==m):[...v.moods,m]}:v)} className={`rounded-full border px-3 py-2 text-xs ${editing.moods.includes(m)?'border-[#6ac6bc] bg-[#20534a] text-white':'border-white/10 bg-white/[.035] text-[#6bc7bf]'}`}>{MOOD_LABELS[m].emoji} {MOOD_LABELS[m][lang]}</button>)}</div><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/15 p-3 text-sm text-[#abd5d1]"><UploadCloud size={19}/>{coverFile?.name||t.cover}<input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" onChange={e=>setCoverFile(e.target.files?.[0]??null)}/></label><div className="flex gap-3 pt-2"><button className="btn-primary flex-1 justify-center" disabled={saving} onClick={()=>void saveEdit()}>{saving?<LoaderCircle className="animate-spin" size={17}/>:<Check size={17}/>} {t.save}</button><button className="btn-muted" disabled={saving} onClick={()=>setDialog(null)}>{t.cancel}</button></div><button onClick={()=>{ const found=tracks.find(x=>x.id===editing.id);setDialog(null);if(found)void deleteTrack(found); }} className="flex items-center gap-2 text-sm text-[#f29bab]"><Trash2 size={15}/>{t.remove}</button></div></Modal>}
    {dialog === 'createPlaylist' && <Modal title={t.createPlaylist} onClose={()=>setDialog(null)}><form onSubmit={e=>{e.preventDefault();void createPlaylist();}} className="space-y-4"><label className="block text-xs text-[#a9c9c0]">{t.playlistName}<input required maxLength={120} className="form-input mt-2" value={newPlaylist.name} onChange={e=>setNewPlaylist(v=>({...v,name:e.target.value}))}/></label><label className="block text-xs text-[#a9c9c0]">{t.description}<textarea rows={3} maxLength={500} className="form-input mt-2 resize-none" value={newPlaylist.description} onChange={e=>setNewPlaylist(v=>({...v,description:e.target.value}))}/></label><button type="submit" disabled={saving} className="btn-primary w-full justify-center">{saving?<LoaderCircle size={18} className="animate-spin"/>:<Plus size={18}/>} {t.createPlaylist}</button></form></Modal>}
    {dialog === 'addPlaylist' && targetTrack && <Modal title={t.addPlaylist} onClose={()=>setDialog(null)}><p className="mb-5 text-sm text-[#71d2ca]">{targetTrack.title} · {targetTrack.artist}</p>{playlists.length ? <div className="space-y-2">{playlists.map(p=><button key={p.id} onClick={()=>void addToPlaylist(p.id,targetTrack.id)} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[.04] p-4 text-left text-sm hover:bg-white/[.08]"><span>{p.name}</span><Plus size={17}/></button>)}</div>:<p className="mb-5 text-sm text-[#68c1ba]">{t.emptyPlaylistList}</p>}<button onClick={()=>{setCreateFromBulk(false);setDialog('createPlaylist');}} className="btn-muted mt-4 w-full justify-center"><Plus size={17}/>{t.createPlaylist}</button></Modal>}
    {dialog === 'bulkPlaylist' && <Modal title={t.bulkAddPlaylist} onClose={()=>{if(!saving)setDialog(null);}}>
      <p className="mb-5 text-sm text-[#badcd4]">{selectedIds.length} {t.bulkSelected}. {t.bulkChoosePlaylist}</p>
      <div className="max-h-[48dvh] space-y-2 overflow-y-auto">
        {playlists.map(p => <button key={p.id} disabled={saving} onClick={()=>void bulkAddToPlaylist(p.id)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[.04] p-4 text-left hover:border-[#6ac6bc]/50 hover:bg-[#20534a]/30">
          <span className="min-w-0"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="mt-1 block text-xs text-[#a6c9c0]">{p.track_ids.length} {t.songs}</span></span>
          {saving?<LoaderCircle size={17} className="animate-spin"/>:<Plus size={17} className="shrink-0 text-[#6ac6bc]"/>}
        </button>)}
      </div>
      <button className="btn-muted mt-4 w-full justify-center" disabled={saving} onClick={()=>{setCreateFromBulk(true);setDialog('createPlaylist');}}><Plus size={17}/>{t.createPlaylist}</button>
    </Modal>}
    {dialog === 'bulkDelete' && <Modal title={t.bulkDeleteTitle} onClose={()=>{if(!saving)setDialog(null);}}>
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
        <p className="font-semibold">{t.bulkDeleteWarning.replace('{count}',String(selectedIds.length))}</p>
        <p className="mt-2 text-xs text-red-200/85">{t.bulkDeleteIrreversible}</p>
      </div>
      <ul className="mt-4 max-h-32 list-disc space-y-1 overflow-auto pl-5 text-xs text-[#bdd9d2]">{tracks.filter(track=>selectedSet.has(track.id)).slice(0,5).map(track=><li key={track.id} className="truncate">{track.title}</li>)}</ul>
      {selectedIds.length >= 100 && <label className="mt-4 block text-sm text-[#d4efe7]">{t.bulkTypeToDelete}
        <input className="form-input mt-2" autoComplete="off" value={deletePhrase} disabled={saving} onChange={e=>setDeletePhrase(e.target.value)} placeholder="DELETE" aria-label={t.bulkTypeToDelete}/>
      </label>}
      {saving && <p className="mt-3 text-xs text-[#92dacc]">{t.bulkDeleting} {uploadStatus}</p>}
      <div className="mt-6 flex flex-wrap gap-3"><button className="btn-danger flex-1 justify-center" disabled={saving || (selectedIds.length >= 100 && deletePhrase !== 'DELETE')} onClick={()=>void bulkDeleteTracks()}>{saving?<LoaderCircle size={17} className="animate-spin"/>:<Trash2 size={17}/>} {t.bulkConfirmDelete}</button><button className="btn-muted justify-center" disabled={saving} onClick={()=>setDialog(null)}>{t.cancel}</button></div>
    </Modal>}
    {dialog === 'player' && player.current && <Modal title={t.nowPlaying} onClose={()=>setDialog(null)}><div className="mx-auto max-w-[340px]"><Artwork track={player.current} size="hero"/><h3 className="mt-6 truncate text-center text-2xl font-bold">{player.current.title}</h3><p className="mt-2 truncate text-center text-sm text-[#afccc4]">{player.current.artist}</p><div className="mt-8"><input className="progress-slider w-full" aria-label="Seek" type="range" min={0} max={player.duration||1} step={1} value={Math.min(player.position,player.duration||1)} onChange={e=>player.seek(Number(e.target.value))}/><div className="mt-2 flex justify-between text-xs text-[#66bcb5]"><span>{formatTime(player.position)}</span><span>{formatTime(player.duration)}</span></div></div><div className="mt-7 flex items-center justify-between"><button className={`icon-button ${player.shuffle?'text-[#6ac6bc]':''}`} onClick={()=>player.setShuffle(v=>!v)} aria-label="Shuffle"><Shuffle size={21}/></button><button className="icon-button" onClick={player.previous} aria-label="Previous"><SkipBack size={26} fill="currentColor"/></button><button className="flex h-16 w-16 items-center justify-center rounded-full bg-[#6ac6bc] text-[#0c2821]" onClick={()=>void player.toggle()} aria-label={player.playing?'Pause':'Play'}>{player.playing?<Pause size={29} fill="currentColor"/>:<Play size={29} fill="currentColor"/>}</button><button className="icon-button" onClick={()=>player.next()} aria-label="Next"><SkipForward size={26} fill="currentColor"/></button><button className={`icon-button ${player.repeat!=='off'?'text-[#6ac6bc]':''}`} onClick={player.cycleRepeat} aria-label="Repeat">{player.repeat==='one'?<Repeat1 size={21}/>:<Repeat size={21}/>}</button></div><div className="mt-6 flex items-center gap-3"><VolumeX size={17} className="text-[#afccc4]"/><input type="range" min={0} max={1} step={0.05} className="progress-slider flex-1" value={player.volume} onChange={e=>player.changeVolume(Number(e.target.value))}/><Volume2 size={17} className="text-[#afccc4]"/></div></div></Modal>}
  </div>;
}
async function probeDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const a = new Audio(); let finished = false;
    const done = (seconds: number) => { if (finished) return; finished = true; a.src = ''; URL.revokeObjectURL(url); resolve(seconds); };
    a.preload = 'metadata';
    a.addEventListener('loadedmetadata', () => done(Number.isFinite(a.duration) ? Math.round(a.duration) : 0), { once: true });
    a.addEventListener('error', () => done(0), { once: true });
    a.src = url;
    window.setTimeout(() => done(0), 6500);
  });
}
