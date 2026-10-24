import assert from 'node:assert/strict';
import { test } from 'node:test';
import { storageWritesAvailable } from '../src/config/storage-policy.js';

test('Storage never writes in development or test, even with a service key', () => {
  for (const mode of ['development', 'test']) {
    assert.equal(storageWritesAvailable(mode, 'https://project.supabase.co', 'service-key'), false);
  }
});

test('Storage writes in production only with complete configuration', () => {
  assert.equal(storageWritesAvailable('production', 'https://project.supabase.co', 'service-key'), true);
  assert.equal(storageWritesAvailable('production', 'https://project.supabase.co', undefined), false);
});
