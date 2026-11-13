import { z } from 'zod';
const env = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(15).refine(value => value.endsWith('.apps.googleusercontent.com'), 'Invalid Google OAuth client ID'),
  GOOGLE_OWNER_EMAIL: z.string().trim().email().transform(value => value.toLowerCase()),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  MAX_UPLOAD_MB: z.coerce.number().min(1).max(500).default(100),
  STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
  LOCAL_STORAGE_DIR: z.string().default('./.music-uploads'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  R2_ENDPOINT: z.string().optional(), R2_BUCKET: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(), R2_SECRET_ACCESS_KEY: z.string().optional()
}).parse(process.env);
if (env.STORAGE_DRIVER === 'r2' && (!env.R2_ENDPOINT || !env.R2_BUCKET || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY)) {
  throw new Error('R2 storage selected: configure R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY');
}
if (env.STORAGE_DRIVER === 'r2' && env.R2_ENDPOINT && !/^https:\/\/[a-z0-9-]+(?:\.(?:eu|us))?\.r2\.cloudflarestorage\.com\/?$/i.test(env.R2_ENDPOINT)) {
  throw new Error('R2_ENDPOINT must use your HTTPS Cloudflare R2 S3 endpoint');
}
if (env.STORAGE_DRIVER === 'r2' && env.R2_BUCKET && !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(env.R2_BUCKET)) {
  throw new Error('R2_BUCKET must be a valid R2 bucket name');
}
if (env.NODE_ENV === 'production') {
  if (env.STORAGE_DRIVER !== 'r2') throw new Error('Production requires STORAGE_DRIVER=r2; finish media migration first');
  if (new URL(env.API_PUBLIC_URL).protocol !== 'https:') throw new Error('Production API_PUBLIC_URL must use HTTPS');
  if (allowedProductionOriginIsInvalid(env.CORS_ORIGINS)) throw new Error('Production CORS_ORIGINS must contain HTTPS origins only, with no paths or wildcards');
  if (env.JWT_SECRET.includes('REPLACE_') || env.JWT_SECRET.includes('YOUR_')) throw new Error('Replace JWT_SECRET with a random value');
}
function allowedProductionOriginIsInvalid(origins: string) {
  return origins.split(',').some(raw => {
    try {
      const origin = raw.trim();
      const url = new URL(origin);
      return !origin || url.protocol !== 'https:' || url.origin !== origin;
    } catch { return true; }
  });
}
export const config = env;
export const allowedOrigins = env.CORS_ORIGINS.split(',').map(x => x.trim()).filter(Boolean);
