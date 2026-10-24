import { spawnSync } from 'node:child_process';

process.env.NODE_ENV = 'test';
await import('../src/config/env.js');

const result = spawnSync(process.execPath, ['--test'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'test' },
});
process.exit(result.status ?? 1);
