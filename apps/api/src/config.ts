import { z } from 'zod';
const env = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  SETUP_TOKEN: z.string().min(16),
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
export const config = env;
export const allowedOrigins = env.CORS_ORIGINS.split(',').map(x => x.trim()).filter(Boolean);
