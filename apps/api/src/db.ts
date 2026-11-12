import pg from 'pg';
import { config } from './config.js';
export const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 8, idleTimeoutMillis: 15000 });
export async function rows<T = Record<string, unknown>>(sql: string, args: unknown[] = []): Promise<T[]> {
  const r = await pool.query(sql, args);
  return r.rows as T[];
}
