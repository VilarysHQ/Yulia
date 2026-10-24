import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';
import { validateDatabaseTarget } from './database-target.js';

const mode = process.env.NODE_ENV ?? 'development';
const file = resolve(dirname(fileURLToPath(import.meta.url)), mode === 'test' ? '../../.env.test' : '../../.env');
let fileValues = {};
if (mode !== 'production') {
  try { fileValues = dotenv.parse(readFileSync(file)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

if (mode !== 'production' && process.env.DATABASE_URL && fileValues.DATABASE_URL
  && process.env.DATABASE_URL !== fileValues.DATABASE_URL) {
  throw new Error('DATABASE_URL heredada difiere del archivo local; elimina la variable del proceso antes de continuar');
}
if (mode !== 'production') dotenv.config({ path: file });
if (mode === 'test' && !fileValues.DATABASE_URL) {
  throw new Error('Falta apps/api/.env.test con DATABASE_URL para yulia_test');
}

const optionalBoolean = z.enum(['true', 'false']).default('false').transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  WEB_ORIGINS: z.string().optional(),
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_SSL: optionalBoolean,
  JWT_SECRET: z.string().optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-3.5-flash-lite'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/).default('course-covers'),
}).superRefine((value, context) => {
  if (value.NODE_ENV === 'production' && Boolean(value.SUPABASE_URL) !== Boolean(value.SUPABASE_SERVICE_ROLE_KEY)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben configurarse juntas', path: ['SUPABASE_URL'] });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Configuración de entorno inválida: ${parsed.error.message}`);
}

export const env = parsed.data;
const exampleSecrets = new Set([
  'development-only-change-this-secret-before-deploying',
  'replace-with-at-least-32-random-characters',
]);
if (env.NODE_ENV === 'production') {
  const secret = env.JWT_SECRET?.trim();
  if (!secret || secret.length < 32 || exampleSecrets.has(secret)
    || /^(.)\1+$|^(.{2,8})\2+$/.test(secret)
    || /(?:change.?me|replace.?me|your.?secret|example|placeholder)/i.test(secret)) {
    throw new Error('JWT_SECRET de producción debe configurarse explícitamente con al menos 32 caracteres aleatorios');
  }
} else if (!env.JWT_SECRET) {
  env.JWT_SECRET = 'development-only-change-this-secret-before-deploying';
}

const configuredOrigins = env.WEB_ORIGINS === undefined ? env.WEB_ORIGIN : env.WEB_ORIGINS;
if (env.NODE_ENV === 'production' && env.WEB_ORIGINS === undefined && !process.env.WEB_ORIGIN) {
  throw new Error('Configura WEB_ORIGIN o WEB_ORIGINS explícitamente en producción');
}
env.ALLOWED_ORIGINS = [...new Set(configuredOrigins.split(',').map((value) => value.trim()))];
for (const origin of env.ALLOWED_ORIGINS) {
  let url;
  try { url = new URL(origin); }
  catch { throw new Error('WEB_ORIGIN/WEB_ORIGINS contiene un origen inválido'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('WEB_ORIGIN/WEB_ORIGINS debe contener orígenes HTTP(S) exactos, separados por coma');
  }
}
validateDatabaseTarget(env);
