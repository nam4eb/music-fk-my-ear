import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z, ZodError } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { dailyMix, computeInsights, type Track, type ListeningEvent } from '@vibebox/core';
import { config, allowedOrigins } from './config.js';
import { pool, rows } from './db.js';
import { issueToken, requireAuth, type AuthorizedRequest } from './auth.js';
import { newObjectKey, signedUpload, signedRead, objectSize, deleteObject, localPut, localGet, type StorageBackend } from './storage.js';
import { id, trackMetadata, uploadInitSchema, playlistSchema, extensionAndMime } from './validate.js';
import { ownerDenial } from './ownerPolicy.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin(origin, callback) {
  if (!origin || allowedOrigins.includes(origin)) callback(null, true);
  else callback(new Error('Origin not allowed'));
}, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'], allowedHeaders: ['Authorization', 'Content-Type'] }));
// Raw body for signed legacy-local storage. New R2 uploads bypass the API process.
app.put('/api/storage/put/:key', express.raw({ type: '*/*', limit: `${config.MAX_UPLOAD_MB}mb` }), localPut);
app.get('/api/storage/get/:key', localGet);
app.use(express.json({ limit: '256kb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }));
app.get('/health', (_req, res) => res.json({ ok: true, name: 'Music Fuq Me API', storage: config.STORAGE_DRIVER }));
// Readiness is intentionally separate from liveness. Do not report ready when DB is unreachable.
app.get('/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.setHeader('Cache-Control', 'no-store').status(200).json({ ready: true });
  } catch (error) {
    console.error('[readiness] PostgreSQL unavailable');
    res.setHeader('Cache-Control', 'no-store').status(503).json({ ready: false });
  }
});
type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
const wrap = (handler: AsyncRoute) => (req: Request, res: Response, next: NextFunction) => { Promise.resolve(handler(req, res, next)).catch(next); };
const uid = (req: Request) => (req as AuthorizedRequest).userId;
const googleClient = new OAuth2Client(config.GOOGLE_CLIENT_ID);
const googleLoginSchema = z.object({ credential: z.string().min(100).max(12000) });

app.get('/api/config', wrap(async (_req, res) => {
  const [{ count }] = await rows<{ count: string }>('SELECT count(*)::text AS count FROM users');
  res.json({
    needsSetup: Number(count) === 0,
    googleClientId: config.GOOGLE_CLIENT_ID,
    maxUploadMB: config.MAX_UPLOAD_MB,
    storageDriver: config.STORAGE_DRIVER
  });
}));

// Google Identity Services sends a short-lived ID token from the browser. Never trust
// a client-supplied email: use Google's verified identity and its stable subject ID.
app.post('/api/auth/google', wrap(async (req, res) => {
  const { credential } = googleLoginSchema.parse(req.body);
  let identity: { sub: string; email: string };
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: config.GOOGLE_CLIENT_ID });
    const profile = ticket.getPayload();
    if (!profile?.sub || !profile.email || profile.email_verified !== true) throw new Error('Unverified identity');
    identity = { sub: profile.sub, email: profile.email.toLowerCase() };
  } catch {
    res.status(401).json({ error: 'Google sign-in verification failed. Select your Google account again.' });
    return;
  }

  if (ownerDenial(identity, config.GOOGLE_OWNER_EMAIL, null)) {
    res.status(403).json({ error: 'This Google account is not the configured VibeBox owner.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize first-login owner creation and linking. Never reassign existing music.
    await client.query('SELECT pg_advisory_xact_lock(987659321)');
    const existing = await client.query<{ id: string; email: string; google_sub: string | null }>(
      'SELECT id,email,google_sub FROM users ORDER BY created_at ASC LIMIT 1 FOR UPDATE'
    );
    let user: { id: string; email: string };
    if (existing.rows.length) {
      const owner = existing.rows[0];
      if (ownerDenial(identity, config.GOOGLE_OWNER_EMAIL, owner)) {
        await client.query('ROLLBACK');
        res.status(403).json({ error: 'An existing owner uses a different Google account. Database was not changed.' });
        return;
      }
      if (!owner.google_sub) {
        await client.query('UPDATE users SET google_sub=$1 WHERE id=$2', [identity.sub, owner.id]);
      }
      user = { id: owner.id, email: owner.email };
    } else {
      const created = await client.query<{ id: string; email: string }>(
        'INSERT INTO users(email,google_sub,password_hash) VALUES ($1,$2,NULL) RETURNING id,email',
        [identity.email, identity.sub]
      );
      user = created.rows[0];
    }
    await client.query('COMMIT');
    res.json({ token: issueToken(user.id), user });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

app.use('/api', requireAuth);
app.get('/api/auth/me', wrap(async (req, res) => {
  const users = await rows('SELECT id, email FROM users WHERE id=$1', [uid(req)]);
  if (!users.length) { res.status(401).json({ error: 'Owner account removed' }); return; }
  res.json({ user: users[0] });
}));
const playlistQuery = `SELECT p.id,p.name,p.description,p.created_at,COALESCE(array_agg(pt.track_id::text ORDER BY pt.position) FILTER (WHERE pt.track_id IS NOT NULL), '{}') AS track_ids
  FROM playlists p LEFT JOIN playlist_tracks pt ON pt.playlist_id=p.id WHERE p.owner_id=$1 GROUP BY p.id ORDER BY p.created_at DESC`;
const tracksQuery = `SELECT id,title,artist,album,genre,language,moods,duration_seconds,size_bytes,mime_type,year,is_favorite,cover_key,created_at FROM tracks WHERE owner_id=$1 ORDER BY created_at DESC`;
const eventsQuery = `SELECT track_id::text,event_type,listened_seconds,created_at FROM listening_events WHERE owner_id=$1 AND created_at >= now() - interval '30 days' ORDER BY created_at DESC LIMIT 3000`;
app.get('/api/bootstrap', wrap(async (req, res) => {
  const [tracks, playlists, events] = await Promise.all([
    rows<Track>(tracksQuery, [uid(req)]), rows(playlistQuery, [uid(req)]), rows<ListeningEvent>(eventsQuery, [uid(req)])
  ]);
  res.json({ tracks, playlists, events, insights: computeInsights(tracks, events) });
}));
// Owner-only storage visibility; never returns credentials, secret URLs or object keys.
app.get('/api/storage/status', wrap(async (req, res) => {
  const counts = await rows<{ storage_driver: StorageBackend; count: string; bytes: string }>(
    `SELECT storage_driver, count(*)::text AS count, coalesce(sum(size_bytes),0)::text AS bytes
     FROM tracks WHERE owner_id=$1 GROUP BY storage_driver`, [uid(req)]);
  const covers = await rows<{ cover_storage_driver: StorageBackend; count: string }>(
    `SELECT cover_storage_driver, count(*)::text AS count
     FROM tracks WHERE owner_id=$1 AND cover_key IS NOT NULL GROUP BY cover_storage_driver`, [uid(req)]);
  res.setHeader('Cache-Control', 'no-store').json({ newUploads: config.STORAGE_DRIVER, tracks: counts, covers });
}));
app.get('/api/mixes/daily', wrap(async (req, res) => {
  const [tracks, events] = await Promise.all([rows<Track>(tracksQuery, [uid(req)]), rows<ListeningEvent>(eventsQuery, [uid(req)])]);
  res.json({ tracks: dailyMix(tracks, events, new Date(), 30) });
}));
const audioLimit = config.MAX_UPLOAD_MB * 1048576;
const pendingSchema = uploadInitSchema.extend({ kind: z.enum(['audio', 'cover']).default('audio'), trackId: id.optional() });
app.post('/api/uploads/init', wrap(async (req, res) => {
  const input = pendingSchema.parse(req.body);
  const isCover = input.kind === 'cover';
  const allowed = extensionAndMime(input.filename, input.mimeType, input.kind);
  if (!allowed) { res.status(415).json({ error: 'Unsupported file extension or MIME type' }); return; }
  const max = isCover ? 5 * 1048576 : audioLimit;
  if (input.size > max) { res.status(413).json({ error: `File exceeds ${isCover ? 5 : config.MAX_UPLOAD_MB} MB` }); return; }
  if (isCover && (!input.trackId || !(await rows('SELECT id FROM tracks WHERE id=$1 AND owner_id=$2', [input.trackId, uid(req)])).length)) {
    res.status(404).json({ error: 'Track not found' }); return;
  }
  const key = newObjectKey(uid(req), input.kind, allowed.ext);
  const inserted = await rows<{ id: string }>(`INSERT INTO pending_uploads (owner_id,object_key,filename,mime_type,size_bytes,kind,track_id,storage_driver)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [uid(req), key, input.filename, allowed.mime, input.size, input.kind, input.trackId ?? null, config.STORAGE_DRIVER]);
  try {
    const uploadUrl = await signedUpload(key, allowed.mime, input.size, config.STORAGE_DRIVER);
    res.status(201).json({ uploadId: inserted[0].id, uploadUrl, contentType: allowed.mime, maxBytes: max });
  } catch (error) {
    await pool.query('DELETE FROM pending_uploads WHERE id=$1', [inserted[0].id]);
    throw error;
  }
}));
app.post('/api/uploads/complete', wrap(async (req, res) => {
  const input = z.object({ uploadId: id, metadata: trackMetadata.optional() }).parse(req.body);
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    const find = await conn.query(`SELECT * FROM pending_uploads WHERE id=$1 AND owner_id=$2 AND expires_at > now() FOR UPDATE`, [input.uploadId, uid(req)]);
    if (!find.rows.length) { await conn.query('ROLLBACK'); res.status(404).json({ error: 'Upload expired or not found' }); return; }
    const pending = find.rows[0];
    let size: number;
    try { size = await objectSize(pending.object_key, pending.storage_driver); }
    catch { await conn.query('ROLLBACK'); res.status(409).json({ error: 'File not found in storage; upload it first' }); return; }
    if (size !== Number(pending.size_bytes)) { await conn.query('ROLLBACK'); res.status(409).json({ error: 'Uploaded byte length differs from declared size' }); return; }
    let result;
    if (pending.kind === 'audio') {
      if (!input.metadata) { await conn.query('ROLLBACK'); res.status(422).json({ error: 'Missing audio metadata' }); return; }
      const m = input.metadata;
      result = await conn.query(`INSERT INTO tracks(owner_id,title,artist,album,genre,language,moods,duration_seconds,size_bytes,mime_type,year,storage_key,storage_driver)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id,title,artist,album,genre,language,moods,duration_seconds,size_bytes,mime_type,year,is_favorite,cover_key,created_at`,
        [uid(req), m.title, m.artist, m.album, m.genre, m.language, m.moods, m.duration_seconds, size, pending.mime_type, m.year, pending.object_key, pending.storage_driver]);
    } else {
      const original = await conn.query('SELECT cover_key FROM tracks WHERE id=$1 AND owner_id=$2 FOR UPDATE', [pending.track_id, uid(req)]);
      if (!original.rows.length) { await conn.query('ROLLBACK'); res.status(404).json({ error: 'Track removed' }); return; }
      result = await conn.query('UPDATE tracks SET cover_key=$1,cover_storage_driver=$2,updated_at=now() WHERE id=$3 AND owner_id=$4 RETURNING id', [pending.object_key, pending.storage_driver, pending.track_id, uid(req)]);
      // Old covers are retained for now if changed; cleanup can be scheduled later.
    }
    await conn.query('DELETE FROM pending_uploads WHERE id=$1', [input.uploadId]);
    await conn.query('COMMIT');
    res.status(201).json({ item: result.rows[0] });
  } catch (error) { await conn.query('ROLLBACK'); throw error; }
  finally { conn.release(); }
}));
app.get('/api/tracks/:id/stream-url', wrap(async (req, res) => {
  const trackId = id.parse(req.params.id);
  const found = await rows<{ storage_key: string; mime_type: string; storage_driver: StorageBackend }>('SELECT storage_key,mime_type,storage_driver FROM tracks WHERE id=$1 AND owner_id=$2', [trackId, uid(req)]);
  if (!found.length) { res.sendStatus(404); return; }
  res.setHeader('Cache-Control', 'no-store').json({ url: await signedRead(found[0].storage_key, found[0].mime_type, found[0].storage_driver), expiresIn: 3600 });
}));
app.get('/api/tracks/:id/cover-url', wrap(async (req, res) => {
  const trackId = id.parse(req.params.id);
  const found = await rows<{ cover_key: string | null; cover_storage_driver: StorageBackend }>('SELECT cover_key,cover_storage_driver FROM tracks WHERE id=$1 AND owner_id=$2', [trackId, uid(req)]);
  if (!found.length || !found[0].cover_key) { res.sendStatus(404); return; }
  const ext = found[0].cover_key.split('.').pop();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  res.setHeader('Cache-Control', 'no-store').json({ url: await signedRead(found[0].cover_key, mime, found[0].cover_storage_driver), expiresIn: 3600 });
}));
app.patch('/api/tracks/:id', wrap(async (req, res) => {
  const trackId = id.parse(req.params.id);
  const patch = trackMetadata.partial().extend({ is_favorite: z.boolean().optional() }).strict().parse(req.body);
  const fields = Object.keys(patch);
  if (!fields.length) { res.status(400).json({ error: 'No changes' }); return; }
  const vals = fields.map(f => patch[f as keyof typeof patch]);
  const expr = fields.map((f, i) => `${f}=$${i + 3}`).join(', ');
  const data = await rows(`UPDATE tracks SET ${expr},updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING id`, [trackId, uid(req), ...vals]);
  if (!data.length) { res.sendStatus(404); return; }
  res.json({ ok: true });
}));
// Destructive batch operation is owner-scoped and bounded. Metadata deletion is atomic;
// storage cleanup follows, and any failed object removals are reported explicitly.
const bulkTrackIds = z.object({ trackIds: z.array(id).min(1).max(1000) }).strict();
app.delete('/api/tracks/bulk', wrap(async (req, res) => {
  const requested = [...new Set(bulkTrackIds.parse(req.body).trackIds)];
  if (requested.length > 200) { res.status(422).json({ error: 'Maximum 200 tracks per delete request' }); return; }
  const removed = await rows<{ id: string; storage_key: string; storage_driver: StorageBackend; cover_key: string | null; cover_storage_driver: StorageBackend }>(
    `DELETE FROM tracks WHERE owner_id=$1 AND id=ANY($2::uuid[])
     RETURNING id, storage_key, storage_driver, cover_key, cover_storage_driver`, [uid(req), requested]
  );
  const keys: { key: string; driver: StorageBackend }[] = removed.flatMap(track => [
    { key: track.storage_key, driver: track.storage_driver },
    ...(track.cover_key ? [{ key: track.cover_key, driver: track.cover_storage_driver }] : [])
  ]);
  let orphanFiles = 0;
  // Bound concurrent object deletion, particularly important for remote R2 requests.
  for (let i = 0; i < keys.length; i += 8) {
    await Promise.all(keys.slice(i, i + 8).map(async item => {
      try { await deleteObject(item.key, item.driver); } catch { orphanFiles++; console.error('[storage cleanup] unable to remove an object'); }
    }));
  }
  res.json({ ok: true, deleted: removed.length, missing: requested.length - removed.length,
    orphanFiles, warning: orphanFiles ? 'Some file objects could not be removed from storage' : undefined });
}));

app.delete('/api/tracks/:id', wrap(async (req, res) => {
  const trackId = id.parse(req.params.id);
  const gone = await rows<{ storage_key: string; storage_driver: StorageBackend; cover_key: string | null; cover_storage_driver: StorageBackend }>('DELETE FROM tracks WHERE id=$1 AND owner_id=$2 RETURNING storage_key,storage_driver,cover_key,cover_storage_driver', [trackId, uid(req)]);
  if (!gone.length) { res.sendStatus(404); return; }
  const failed: string[] = [];
  const targets = [{key: gone[0].storage_key, driver: gone[0].storage_driver},
    ...(gone[0].cover_key ? [{key: gone[0].cover_key, driver: gone[0].cover_storage_driver}] : [])];
  for (const item of targets) {
    try { await deleteObject(item.key, item.driver); } catch { failed.push(item.key); }
  }
  res.json({ ok: true, orphanFiles: failed.length, warning: failed.length ? 'Metadata deleted; some storage objects require manual cleanup' : undefined });
}));
app.get('/api/playlists', wrap(async (req, res) => res.json({ playlists: await rows(playlistQuery, [uid(req)]) })));
app.post('/api/playlists', wrap(async (req, res) => {
  const m = playlistSchema.parse(req.body);
  const created = await rows('INSERT INTO playlists(owner_id,name,description) VALUES ($1,$2,$3) RETURNING id,name,description,created_at', [uid(req), m.name, m.description]);
  res.status(201).json({ playlist: { ...created[0], track_ids: [] } });
}));
app.patch('/api/playlists/:id', wrap(async (req, res) => {
  const playlistId = id.parse(req.params.id); const m = playlistSchema.partial().parse(req.body);
  if (!Object.keys(m).length) { res.sendStatus(400); return; }
  const found = await rows('UPDATE playlists SET name=COALESCE($3,name),description=COALESCE($4,description) WHERE id=$1 AND owner_id=$2 RETURNING id', [playlistId, uid(req), m.name ?? null, m.description ?? null]);
  res.status(found.length ? 200 : 404).json({ ok: Boolean(found.length) });
}));
app.delete('/api/playlists/:id', wrap(async (req, res) => {
  const deleted = await rows('DELETE FROM playlists WHERE id=$1 AND owner_id=$2 RETURNING id', [id.parse(req.params.id), uid(req)]);
  res.status(deleted.length ? 200 : 404).json({ ok: Boolean(deleted.length) });
}));
app.post('/api/playlists/:id/tracks', wrap(async (req, res) => {
  const playlistId = id.parse(req.params.id);
  const { trackId } = z.object({ trackId: id }).parse(req.body);
  const added = await rows(`INSERT INTO playlist_tracks(playlist_id,track_id,position)
    SELECT p.id,t.id,COALESCE((SELECT max(position)+1 FROM playlist_tracks WHERE playlist_id=p.id),0)
    FROM playlists p JOIN tracks t ON t.id=$3 AND t.owner_id=p.owner_id WHERE p.id=$1 AND p.owner_id=$2
    ON CONFLICT (playlist_id,track_id) DO NOTHING RETURNING track_id`, [playlistId, uid(req), trackId]);
  const exists = await rows('SELECT id FROM playlists WHERE id=$1 AND owner_id=$2', [playlistId, uid(req)]);
  if (!exists.length) { res.sendStatus(404); return; }
  res.json({ ok: true, added: added.length > 0 });
}));
// One owner-scoped request appends many tracks, preserving input order and skipping duplicates.
// The playlist row lock serializes concurrent bulk adds to keep positions predictable.
app.post('/api/playlists/:id/tracks/bulk', wrap(async (req, res) => {
  const playlistId = id.parse(req.params.id);
  const trackIds = [...new Set(bulkTrackIds.parse(req.body).trackIds)];
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    const playlist = await conn.query('SELECT id FROM playlists WHERE id=$1 AND owner_id=$2 FOR UPDATE', [playlistId, uid(req)]);
    if (!playlist.rowCount) { await conn.query('ROLLBACK'); res.status(404).json({ error: 'Playlist not found' }); return; }
    const owned = await conn.query<{ id: string }>('SELECT id FROM tracks WHERE owner_id=$1 AND id=ANY($2::uuid[])', [uid(req), trackIds]);
    if (owned.rows.length !== trackIds.length) {
      await conn.query('ROLLBACK'); res.status(422).json({ error: 'One or more tracks are not in your library' }); return;
    }
    const offset = await conn.query<{ next_position: number }>(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM playlist_tracks WHERE playlist_id=$1', [playlistId]
    );
    const inserted = await conn.query<{ track_id: string }>(
      `INSERT INTO playlist_tracks(playlist_id,track_id,position)
       SELECT $1, incoming.track_id, $3 + incoming.ordinal::int - 1
       FROM unnest($2::uuid[]) WITH ORDINALITY AS incoming(track_id, ordinal)
       ON CONFLICT (playlist_id,track_id) DO NOTHING RETURNING track_id`,
      [playlistId, trackIds, offset.rows[0].next_position]
    );
    await conn.query('COMMIT');
    res.json({ ok: true, added: inserted.rows.length, skipped: trackIds.length - inserted.rows.length });
  } catch (error) { await conn.query('ROLLBACK'); throw error; }
  finally { conn.release(); }
}));

// Removing from a playlist never deletes the library track or its audio object.
app.delete('/api/playlists/:id/tracks/bulk', wrap(async (req, res) => {
  const playlistId = id.parse(req.params.id);
  const trackIds = [...new Set(bulkTrackIds.parse(req.body).trackIds)];
  const existing = await rows('SELECT id FROM playlists WHERE id=$1 AND owner_id=$2', [playlistId, uid(req)]);
  if (!existing.length) { res.status(404).json({ error: 'Playlist not found' }); return; }
  const removed = await rows<{ track_id: string }>(
    `DELETE FROM playlist_tracks WHERE playlist_id=$1 AND track_id=ANY($3::uuid[])
     AND EXISTS (SELECT 1 FROM playlists WHERE id=$1 AND owner_id=$2) RETURNING track_id`,
    [playlistId, uid(req), trackIds]
  );
  res.json({ ok: true, removed: removed.length });
}));

app.delete('/api/playlists/:id/tracks/:trackId', wrap(async (req, res) => {
  const deleted = await rows(`DELETE FROM playlist_tracks WHERE playlist_id=$1 AND track_id=$3
    AND EXISTS (SELECT 1 FROM playlists WHERE id=$1 AND owner_id=$2) RETURNING track_id`, [id.parse(req.params.id), uid(req), id.parse(req.params.trackId)]);
  res.json({ ok: true, removed: deleted.length > 0 });
}));
app.post('/api/events', wrap(async (req, res) => {
  const event = z.object({ trackId: id, type: z.enum(['play', 'pause', 'skip', 'complete']), listenedSeconds: z.number().int().min(0).max(86400).default(0) }).parse(req.body);
  await pool.query(`INSERT INTO listening_events(owner_id,track_id,event_type,listened_seconds)
    SELECT $1,id,$3,$4 FROM tracks WHERE id=$2 AND owner_id=$1`, [uid(req), event.trackId, event.type, event.listenedSeconds]);
  res.status(202).json({ ok: true });
}));
app.get('/api/insights', wrap(async (req, res) => {
  const [tracks, events] = await Promise.all([rows<Track>(tracksQuery, [uid(req)]), rows<ListeningEvent>(eventsQuery, [uid(req)])]);
  res.json(computeInsights(tracks, events));
}));
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) { res.status(422).json({ error: 'Invalid input', details: err.flatten() }); return; }
  if (err instanceof Error && err.message === 'Origin not allowed') { res.status(403).json({ error: 'CORS origin not allowed' }); return; }
  console.error('[API error]', err);
  res.status(500).json({ error: 'Internal server error' });
});
const server = app.listen(config.PORT, '0.0.0.0', () => console.log(`Music Fuq Me API listening on ${config.PORT} (${config.STORAGE_DRIVER})`));
function shutdown() { server.close(() => void pool.end()); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
