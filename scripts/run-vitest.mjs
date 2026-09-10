import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vitestCli = path.join(rootDir, 'node_modules', 'vitest', 'vitest.mjs');

const child = spawn(String(electronPath), [vitestCli, ...process.argv.slice(2)], {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
  },
  windowsHide: true,
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
