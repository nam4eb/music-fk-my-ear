#!/usr/bin/env node
/** Verify server-side R2 credentials, object writes, reads and deletes without touching music. */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
async function main() {
  const env = process.env;
  if (![env.R2_ENDPOINT, env.R2_BUCKET, env.R2_ACCESS_KEY_ID, env.R2_SECRET_ACCESS_KEY].every(Boolean)) {
    throw new Error('R2 credentials missing from apps/api/.env');
  }
  const client = new S3Client({ region: 'auto', endpoint: env.R2_ENDPOINT, forcePathStyle: true,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } });
  const key = `diagnostics/${randomUUID()}.txt`;
  const original = Buffer.from('Music Fuq Me R2 private storage probe');
  let created = false;
  try {
    await client.send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Body: original,
      ContentLength: original.length, ContentType: 'text/plain' }));
    created = true;
    const head = await client.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
    if (head.ContentLength !== original.length) throw new Error('HEAD size mismatch');
    const data = await client.send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
    const bytes = Buffer.from(await data.Body.transformToByteArray());
    if (!bytes.equals(original)) throw new Error('GET bytes mismatch');
    console.log('PASS: R2 PUT / HEAD / GET. No credentials printed.');
  } finally {
    if (created) {
      await client.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
      console.log('PASS: R2 diagnostic object deleted.');
    }
  }
}
main().catch(err => { console.error(`FAIL R2 probe: ${err.message}`); process.exitCode = 1; });
