import { createApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './db.js';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL es necesaria para iniciar la API');
await pool.query('SELECT 1');
createApp().listen(env.API_PORT, () => {
  console.log(`API disponible en http://localhost:${env.API_PORT}`);
});
