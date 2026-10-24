import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';

const appUrl = new URL('../src/app.js', import.meta.url).href;
function productionImport(secret) {
  const childEnv = {
    ...process.env,
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://postgres:unused@example.invalid:5432/unused',
    WEB_ORIGIN: 'https://frontend.example.invalid',
    DATABASE_SSL: 'true',
  };
  if (secret === undefined) delete childEnv.JWT_SECRET;
  else childEnv.JWT_SECRET = secret;
  return spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(appUrl)})`], {
    env: childEnv, encoding: 'utf8', timeout: 10000,
  });
}

test('app de producción exige un JWT_SECRET explícito y robusto al importar', () => {
  const missing = productionImport(undefined);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /JWT_SECRET/);

  for (const example of [
    'development-only-change-this-secret-before-deploying',
    'replace-with-at-least-32-random-characters',
    'a'.repeat(64),
  ]) {
    const result = productionImport(example);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /JWT_SECRET/);
    assert.doesNotMatch(result.stderr, new RegExp(example));
  }

  const valid = productionImport(randomBytes(48).toString('hex'));
  assert.equal(valid.status, 0, valid.stderr);
});

test('CSRF exige Origin exacto para toda mutación y conserva lecturas y preflight', async () => {
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      for (const origin of [undefined, 'null', 'https://malicioso.example', `${env.ALLOWED_ORIGINS[0]}.evil.test`]) {
        const response = await fetch(`${base}/inexistente`, {
          method, headers: origin === undefined ? {} : { Origin: origin },
        });
        assert.equal(response.status, 403, `${method} ${origin ?? 'sin Origin'}`);
      }
      const allowed = await fetch(`${base}/inexistente`, {
        method, headers: { Origin: env.ALLOWED_ORIGINS[0] },
      });
      assert.notEqual(allowed.status, 403);
    }
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/health`, { method: 'HEAD' })).status, 200);
    const refererOnly = await fetch(`${base}/inexistente`, {
      method: 'POST', headers: { Referer: `${env.ALLOWED_ORIGINS[0]}/` },
    });
    assert.equal(refererOnly.status, 403);
    const preflight = await fetch(`${base}/health`, {
      method: 'OPTIONS',
      headers: { Origin: env.ALLOWED_ORIGINS[0], 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), env.ALLOWED_ORIGINS[0]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
