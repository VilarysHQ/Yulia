import pg from 'pg';
import { env } from './config/env.js';
import { validateDatabaseTarget } from './config/database-target.js';

validateDatabaseTarget(env);

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: true } : false,
});

export async function query(sql, values = []) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL no está configurada');
  return pool.query(sql, values);
}
