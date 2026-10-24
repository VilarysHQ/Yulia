import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['--watch', 'src/server.js'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development' },
});
process.exit(result.status ?? 1);
