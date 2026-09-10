import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootDir = path.resolve(process.cwd());
const outputDir = path.resolve(rootDir, 'dist-electron-app');

if (path.dirname(outputDir) !== rootDir || path.basename(outputDir) !== 'dist-electron-app') {
  throw new Error(`Refusing to clean unexpected Electron output path: ${outputDir}`);
}

fs.rmSync(outputDir, { recursive: true, force: true });
console.log(`Cleaned ${path.relative(rootDir, outputDir)}/`);
