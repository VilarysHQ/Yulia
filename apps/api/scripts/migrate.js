import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { pool } from '../src/db.js';
import { env } from '../src/config/env.js';
import { validateDatabaseTarget } from '../src/config/database-target.js';

if (env.NODE_ENV === 'production') {
  throw new Error('Las migraciones de producción requieren un procedimiento manual separado');
}
validateDatabaseTarget(env);

const directory = resolve(dirname(fileURLToPath(import.meta.url)), '../../../database/migrations');
const files = (await readdir(directory)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
const client = await pool.connect();
try {
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const baseline = await client.query("SELECT to_regclass('public.users') AS users, to_regclass('public.clinical_cases') AS cases");
  if (baseline.rows[0].users && baseline.rows[0].cases) {
    await client.query("INSERT INTO schema_migrations (name) VALUES ('001_initial_schema.sql') ON CONFLICT DO NOTHING");
  }
  const mvpTables = await client.query("SELECT to_regclass('public.courses') AS courses, to_regclass('public.enrollments') AS enrollments, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clinical_cases' AND column_name = 'course_id') AS case_course");
  if (mvpTables.rows[0].courses && mvpTables.rows[0].enrollments && mvpTables.rows[0].case_course) {
    await client.query("INSERT INTO schema_migrations (name) VALUES ('002_mvp_courses.sql') ON CONFLICT DO NOTHING");
  }
  for (const name of files) {
    if ((await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name])).rowCount) continue;
    await client.query('BEGIN');
    try {
      await client.query(await readFile(resolve(directory, name), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`Migración aplicada: ${name}`);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
} finally { client.release(); await pool.end(); }
