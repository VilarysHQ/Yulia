import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateDatabaseTarget } from '../src/config/database-target.js';

const config = (mode, url, ssl = false) => ({ NODE_ENV: mode, DATABASE_URL: url, DATABASE_SSL: ssl });
const local = (host, database) => `postgresql://postgres:example@${host}:5432/${database}`;

test('development accepts only loopback yulia_dev without SSL', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    assert.doesNotThrow(() => validateDatabaseTarget(config('development', local(host, 'yulia_dev'))));
  }
  for (const url of [local('remote.example', 'yulia_dev'), local('localhost', 'yulia_test'),
    `${local('localhost', 'yulia_dev')}?host=remote.example`, 'postgresql://postgres@localhost:5432/yulia_dev']) {
    assert.throws(() => validateDatabaseTarget(config('development', url)));
  }
  assert.throws(() => validateDatabaseTarget(config('development', local('localhost', 'yulia_dev'), true)));
});

test('test mode accepts only local yulia_test and fails without configuration', () => {
  assert.doesNotThrow(() => validateDatabaseTarget(config('test', local('127.0.0.1', 'yulia_test'))));
  assert.throws(() => validateDatabaseTarget(config('test', local('127.0.0.1', 'yulia_dev'))));
  assert.throws(() => validateDatabaseTarget(config('test', local('db.supabase.com', 'yulia_test'))));
  assert.throws(() => validateDatabaseTarget(config('test', undefined)));
});

test('production keeps its existing destination policy', () => {
  assert.doesNotThrow(() => validateDatabaseTarget(config('production', 'postgresql://postgres:example@remote.example:6543/postgres', true)));
});
