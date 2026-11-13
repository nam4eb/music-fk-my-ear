#!/usr/bin/env node
/**
 * Idempotent local => R2 migration. DATABASE rows retain their identity and playlist links.
 * Default: inventory only. Apply requires both --apply and --confirm.
 * No local file is deleted. Run from the apps/api workspace with .env loaded.
 */
import 'dotenv/config';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { S3Client, HeadObjectCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { parseMigrationArgs, validateObjectKey, compareRemote, coverMime } from './r2MigrationPlan.mjs';

async function main() {
  const flags = parseMigrationArgs(process.argv.slice(2));
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL missing from apps/api/.env');
  const localRoot = path.resolve(process.env.LOCAL_STORAGE_DIR || './.music-uploads');
  const db = new pg.Client({ connectionString: dbUrl });
  await db.connect();
  try {
    const columns = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='tracks' AND column_name IN ('storage_driver','cover_storage_driver')");
    if (columns.rowCount !== 2) throw new Error('Apply SQL 003_r2_hybrid_storage.sql before migration');
    const { rows: audio } = await db.query(
      "SELECT id::text, storage_key AS key, mime_type AS mime, size_bytes::text AS declared, 'audio' AS kind FROM tracks WHERE storage_driver='local' ORDER BY created_at,id"
    );
    const { rows: covers } = await db.query(
      "SELECT id::text, cover_key AS key, '' AS mime, NULL::text AS declared, 'cover' AS kind FROM tracks WHERE cover_key IS NOT NULL AND cover_storage_driver='local' ORDER BY created_at,id"
    );
    const items = [...audio, ...covers].slice(0, flags.limit);
    console.log(`Local source: ${localRoot}\nPending: ${audio.length} tracks, ${covers.length} covers; selected: ${items.length}`);
    const cfg = process.env;
    if (flags.apply && !(cfg.R2_ENDPOINT && cfg.R2_BUCKET && cfg.R2_ACCESS_KEY_ID && cfg.R2_SECRET_ACCESS_KEY)) {
      throw new Error('Set R2_ENDPOINT/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY in the API .env first');
    }
    const s3 = flags.apply ? new S3Client({
      region: 'auto', endpoint: cfg.R2_ENDPOINT, forcePathStyle: true,
      credentials: { accessKeyId: cfg.R2_ACCESS_KEY_ID, secretAccessKey: cfg.R2_SECRET_ACCESS_KEY }
    }) : null;
    let totalBytes = 0, migrated = 0, missing = 0, errors = 0, already = 0;
    for (const [i, row] of items.entries()) {
      try {
        const key = validateObjectKey(row.key);
        const file = path.resolve(localRoot, key);
        if (!file.startsWith(localRoot + path.sep)) throw new Error('Unsafe source path');
        const st = await fs.stat(file);
        if (!st.isFile()) throw new Error('Not a regular file');
        if (row.kind === 'audio' && st.size !== Number(row.declared)) throw new Error('Local audio size differs from PostgreSQL');
        totalBytes += st.size;
        if (!flags.apply) { if ((i + 1) % 100 === 0) console.log(`Inventory ${i + 1}/${items.length}`); continue; }
        const sha256 = await checksumFile(file);
        let head;
        try { head = await s3.send(new HeadObjectCommand({ Bucket: cfg.R2_BUCKET, Key: key })); }
        catch (err) {
          if (!(err?.name === 'NotFound' || err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404)) throw err;
        }
        if (head && !compareRemote(head, st.size, sha256)) {
          throw new Error('Existing R2 object has an unexpected size/hash; refusing overwrite');
        }
        if (!head) {
          await s3.send(new PutObjectCommand({
            Bucket: cfg.R2_BUCKET, Key: key,
            ContentLength: st.size, ContentType: row.kind === 'audio' ? row.mime : coverMime(key),
            Metadata: { sha256 }, Body: createReadStream(file)
          }));
          head = await s3.send(new HeadObjectCommand({ Bucket: cfg.R2_BUCKET, Key: key }));
          if (!compareRemote(head, st.size, sha256)) throw new Error('R2 HEAD check failed after upload');
        } else already++;
        if (flags.verifyDownload) {
          const remote = await s3.send(new GetObjectCommand({ Bucket: cfg.R2_BUCKET, Key: key }));
          const digest = createHash('sha256'); let remoteBytes = 0;
          for await (const part of remote.Body) { digest.update(part); remoteBytes += part.length; }
          if (remoteBytes !== st.size || digest.digest('hex') !== sha256) throw new Error('R2 GET checksum mismatch');
        }
        // Update DB only after R2 verification; where-clause keeps concurrent edits safe.
        const sql = row.kind === 'audio'
          ? "UPDATE tracks SET storage_driver='r2',updated_at=now() WHERE id=$1 AND storage_driver='local' AND storage_key=$2"
          : "UPDATE tracks SET cover_storage_driver='r2',updated_at=now() WHERE id=$1 AND cover_storage_driver='local' AND cover_key=$2";
        const changed = await db.query(sql, [row.id, key]);
        if (changed.rowCount === 1) migrated++;
        console.log(`[${i + 1}/${items.length}] ${row.kind} ${row.id} => R2 verified (${st.size} bytes)`);
      } catch (err) {
        if (err?.code === 'ENOENT') missing++;
        errors++;
        console.error(`[${i + 1}/${items.length}] ${row.kind} ${row.id}: ${err.message}`);
      }
    }
    console.log(JSON.stringify({ mode: flags.apply ? 'APPLY' : 'DRY_RUN', examined: items.length,
      inventoryBytes: totalBytes, migrated, existingR2Verified: already, missing, errors,
      note: 'No local source files have been removed' }, null, 2));
    if (errors) process.exitCode = 1;
  } finally { await db.end(); }
}
async function checksumFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
main().catch(err => { console.error(`R2 MIGRATION FAILED: ${err.message}`); process.exitCode = 1; });
