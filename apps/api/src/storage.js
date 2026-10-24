import { randomUUID } from 'node:crypto';
import { env } from './config/env.js';
import { storageWritesAvailable } from './config/storage-policy.js';

export const MAX_COVER_BYTES = 2 * 1024 * 1024;

export const COVER_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const EXTENSION_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const UUID_SOURCE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const COVER_PATH = new RegExp(`^courses/(${UUID_SOURCE})/(${UUID_SOURCE})\\.(jpg|jpeg|png|webp)$`, 'i');

export function isAllowedCoverType(contentType) {
  return Object.hasOwn(COVER_TYPES, contentType);
}

export function createCoverPath(courseId, contentType) {
  return `courses/${courseId.toLowerCase()}/${randomUUID()}.${COVER_TYPES[contentType]}`;
}

export function isCourseCoverPath(path, courseId) {
  if (typeof path !== 'string' || typeof courseId !== 'string') return false;
  const match = COVER_PATH.exec(path);
  return Boolean(match && match[1].toLowerCase() === courseId.toLowerCase());
}

export function coverTypeMatchesPath(contentType, path) {
  if (typeof path !== 'string') return false;
  const extension = path.split('.').pop()?.toLowerCase();
  return EXTENSION_TYPES[extension] === contentType;
}

export function matchesCoverSignature(contentType, bytes) {
  const buffer = Buffer.from(bytes);
  if (contentType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (contentType === 'image/png') {
    return buffer.length >= 8
      && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (contentType === 'image/webp') {
    return buffer.length >= 12
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

export function storageApiBase(supabaseUrl) {
  if (!supabaseUrl) return '';
  const base = supabaseUrl.trim().replace(/\/+$/, '');
  return /\/storage\/v1$/i.test(base) ? base : `${base}/storage/v1`;
}

export function resolveStorageUploadUrl(supabaseUrl, value) {
  if (!value) throw new Error('Supabase Storage no devolvió una URL de subida');
  const raw = String(value).trim();
  let absolute;
  try {
    absolute = new URL(raw);
  } catch {
    absolute = null;
  }
  if (absolute) {
    if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') {
      throw new Error('Supabase Storage devolvió una URL de subida no válida');
    }
    return raw;
  }

  const apiBase = storageApiBase(supabaseUrl);
  const origin = new URL(apiBase).origin;
  const relative = raw.replace(/^\/+/, '');
  if (/^storage\/v1(\/|$)/i.test(relative)) return `${origin}/${relative}`;
  return `${apiBase}/${relative}`;
}

function createStorageClient() {
  const baseUrl = env.SUPABASE_URL?.replace(/\/+$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = env.SUPABASE_STORAGE_BUCKET;
  const available = storageWritesAvailable(env.NODE_ENV, baseUrl, serviceKey);

  const headers = () => ({ apikey: serviceKey, Authorization: `Bearer ${serviceKey}` });

  async function request(path, options = {}) {
    if (!available) {
      const error = new Error('Las escrituras de Storage no están disponibles en desarrollo o pruebas');
      error.status = 503;
      throw error;
    }
    const response = await fetch(`${storageApiBase(baseUrl)}${path}`, {
      ...options,
      headers: { ...headers(), ...options.headers },
    });
    if (!response.ok) {
      const error = new Error(`Supabase Storage respondió con el estado ${response.status}`);
      error.status = response.status === 404 ? 404 : 502;
      throw error;
    }
    return response;
  }

  return {
    available,
    publicUrl(path) {
      if (!baseUrl || !path) return null;
      return `${storageApiBase(baseUrl)}/object/public/${encodeURIComponent(bucket)}/${encodePath(path)}`;
    },
    async createSignedUpload(path) {
      const response = await request(`/object/upload/sign/${encodeURIComponent(bucket)}/${encodePath(path)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const body = await response.json().catch(() => ({}));
      const signed = body.url ?? body.signedUrl;
      if (!signed) throw new Error('Supabase Storage no devolvió una URL de subida');
      return {
        url: resolveStorageUploadUrl(baseUrl, signed),
        expiresIn: 60 * 60 * 2,
      };
    },
    async stat(path) {
      const response = await request(`/object/info/${encodeURIComponent(bucket)}/${encodePath(path)}`);
      const body = await response.json().catch(() => ({}));
      const contentType = body.contentType ?? body.content_type ?? body.metadata?.contentType ?? body.metadata?.mimetype ?? '';
      return {
        size: Number(body.size ?? body.metadata?.size ?? 0),
        contentType: String(contentType).split(';')[0].trim().toLowerCase(),
      };
    },
    async readHead(path) {
      const response = await request(`/object/authenticated/${encodeURIComponent(bucket)}/${encodePath(path)}`, {
        headers: { Range: 'bytes=0-15' },
      });
      return Buffer.from(await response.arrayBuffer()).subarray(0, 16);
    },
    async remove(path) {
      await request(`/object/${encodeURIComponent(bucket)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [path] }),
      });
    },
  };
}

export function createStorage() {
  return createStorageClient();
}
