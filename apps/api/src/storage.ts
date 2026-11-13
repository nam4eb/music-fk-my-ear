import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { config } from './config.js';

const client = (config.R2_ENDPOINT && config.R2_BUCKET && config.R2_ACCESS_KEY_ID && config.R2_SECRET_ACCESS_KEY) ? new S3Client({
  region: 'auto', endpoint: config.R2_ENDPOINT!, forcePathStyle: true,
  credentials: { accessKeyId: config.R2_ACCESS_KEY_ID!, secretAccessKey: config.R2_SECRET_ACCESS_KEY! }
}) : null;
const root = path.resolve(config.LOCAL_STORAGE_DIR);
export type StorageBackend = 'local' | 'r2';
export function r2Client() {
  if (!client) throw new Error('Cloudflare R2 credentials are missing on the API host');
  return client;
}
const allowedKey = /^users\/[0-9a-f-]+\/(tracks|covers)\/[0-9a-f-]+\.(mp3|m4a|aac|wav|flac|ogg|opus|webm|png|jpg|jpeg|webp)$/;
export function newObjectKey(userId: string, kind: 'audio' | 'cover', extension: string) {
  return `users/${userId}/${kind === 'audio' ? 'tracks' : 'covers'}/${randomUUID()}.${extension}`;
}
function localFile(key: string) {
  if (!allowedKey.test(key)) throw new Error('Invalid storage key');
  const target = path.resolve(root, key);
  if (!target.startsWith(root + path.sep)) throw new Error('Unsafe path');
  return target;
}
function localToken(key: string, mime: string, purpose: 'put' | 'get') {
  return jwt.sign({ key, mime, purpose }, config.JWT_SECRET, { expiresIn: purpose === 'get' ? '1h' : '15m', issuer: 'vibebox-local-storage' });
}
function verifyLocal(token: string, purpose: 'put' | 'get', key: string) {
  const payload = jwt.verify(token, config.JWT_SECRET, { issuer: 'vibebox-local-storage' });
  if (!payload || typeof payload === 'string' || payload.purpose !== purpose || payload.key !== key) throw new Error('Invalid local storage token');
  return payload as { key: string; mime: string; purpose: string };
}
export async function signedUpload(key: string, mime: string, _size: number, backend: StorageBackend = config.STORAGE_DRIVER) {
  if (backend === 'local') return `${config.API_PUBLIC_URL}/api/storage/put/${encodeURIComponent(key)}?token=${encodeURIComponent(localToken(key, mime, 'put'))}`;
  return getSignedUrl(r2Client(), new PutObjectCommand({ Bucket: config.R2_BUCKET!, Key: key, ContentType: mime }), { expiresIn: 600 });
}
export async function signedRead(key: string, mime: string, backend: StorageBackend = config.STORAGE_DRIVER) {
  if (backend === 'local') return `${config.API_PUBLIC_URL}/api/storage/get/${encodeURIComponent(key)}?token=${encodeURIComponent(localToken(key, mime, 'get'))}`;
  return getSignedUrl(r2Client(), new GetObjectCommand({ Bucket: config.R2_BUCKET!, Key: key, ResponseContentType: mime }), { expiresIn: 3600 });
}
export async function objectSize(key: string, backend: StorageBackend = config.STORAGE_DRIVER): Promise<number> {
  if (backend === 'local') return (await fs.stat(localFile(key))).size;
  const head = await r2Client().send(new HeadObjectCommand({ Bucket: config.R2_BUCKET!, Key: key }));
  return head.ContentLength ?? 0;
}
export async function deleteObject(key: string, backend: StorageBackend = config.STORAGE_DRIVER) {
  if (backend === 'local') { await fs.rm(localFile(key), { force: true }); return; }
  await r2Client().send(new DeleteObjectCommand({ Bucket: config.R2_BUCKET!, Key: key }));
}
/** Only active with STORAGE_DRIVER=local, for local development without cloud credentials. */
export function localPut(req: Request, res: Response) {
  // Remains available for signed URLs issued before switching new uploads to R2.
  const key = req.params.key;
  try {
    const payload = verifyLocal(String(req.query.token ?? ''), 'put', key);
    if (req.get('content-type')?.split(';')[0] !== payload.mime) { res.status(415).json({ error: 'Content-Type mismatch' }); return; }
    const data = req.body as Buffer;
    if (!Buffer.isBuffer(data) || !data.length || data.length > config.MAX_UPLOAD_MB * 1048576) { res.status(413).json({ error: 'Invalid file size' }); return; }
    void (async () => {
      const file = localFile(key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, data, { flag: 'wx' });
      res.sendStatus(200);
    })().catch(() => res.status(409).json({ error: 'Upload failed or already exists' }));
  } catch { res.sendStatus(403); }
}
export function localGet(req: Request, res: Response) {
  // Remains available for signed URLs issued before switching new uploads to R2.
  const key = req.params.key;
  try {
    const payload = verifyLocal(String(req.query.token ?? ''), 'get', key);
    void (async () => {
      const file = localFile(key);
      const st = await fs.stat(file);
      const size = st.size;
      const headers = { 'Accept-Ranges': 'bytes', 'Content-Type': payload.mime, 'Cache-Control': 'private, no-store' };
      const match = /^bytes=(\d+)-(\d*)$/.exec(req.get('range') ?? '');
      if (match) {
        const start = Number(match[1]);
        const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
        if (start >= size || end < start) { res.set('Content-Range', `bytes */${size}`).sendStatus(416); return; }
        res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
        createReadStream(file, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { ...headers, 'Content-Length': size });
        createReadStream(file).pipe(res);
      }
    })().catch(() => { if (!res.headersSent) res.sendStatus(404); });
  } catch { res.sendStatus(403); }
}
