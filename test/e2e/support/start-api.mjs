import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { applicationEnvironment } from './environment.mjs';

const child = spawn(
  process.execPath,
  ['--import', fileURLToPath(new URL('./loopback-only.mjs', import.meta.url)), 'dist/main.js'],
  {
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
    env: applicationEnvironment(),
    stdio: 'inherit',
  },
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => child.kill(signal));
}

child.once('error', (error) => {
  console.error('Could not start the full-stack API:', error.message);
  process.exitCode = 1;
});

child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
