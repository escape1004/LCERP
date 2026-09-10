import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import AdmZip from 'adm-zip';

const rootDir = process.cwd();
const unpackedDir = path.join(rootDir, 'release', 'win-unpacked');
const exeName = 'Local ERP.exe';
const sourceExePath = path.join(unpackedDir, exeName);

if (!fs.existsSync(sourceExePath)) {
  console.log(`Packaged media/update smoke skipped: ${path.relative(rootDir, sourceExePath)} is not present.`);
  console.log('Build it with `npx electron-builder --dir` (or `npm run electron:build`) then rerun `npm run smoke:electron-packaged`.');
  process.exit(0);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'local-erp-electron-packaged-smoke-'));
const userDataDir = path.join(tempRoot, 'user-data');
const dataDir = path.join(tempRoot, 'app-data');
const backupDir = path.join(tempRoot, 'backups');
const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
let electronProcess;
let reportReceived = false;
let rendererReport = null;

async function stopElectron() {
  if (!electronProcess || electronProcess.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    electronProcess.kill('SIGTERM');
  }

  if (electronProcess.exitCode === null) {
    await Promise.race([
      new Promise((resolve) => electronProcess.once('close', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  }
}

function cleanup() {
  const resolvedTempRoot = path.resolve(tempRoot);
  const resolvedSystemTemp = `${path.resolve(os.tmpdir())}${path.sep}`;
  if (!resolvedTempRoot.startsWith(resolvedSystemTemp) || !path.basename(resolvedTempRoot).startsWith('local-erp-electron-packaged-smoke-')) {
    throw new Error(`Refusing to remove unexpected smoke directory: ${resolvedTempRoot}`);
  }
  fs.rmSync(resolvedTempRoot, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
}

try {
  const exePath = sourceExePath;
  const pngPath = path.join(tempRoot, 'viewer-fixture.png');
  const zipPath = path.join(tempRoot, 'viewer-fixture.zip');
  const videoPath = path.join(tempRoot, 'viewer-fixture.mp4');
  fs.writeFileSync(pngPath, pngBytes);
  fs.writeFileSync(videoPath, Buffer.from('ftypisom'));
  const zip = new AdmZip();
  zip.addFile('inside.png', pngBytes);
  zip.writeZip(zipPath);
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(userDataDir, 'config.json'), JSON.stringify({
    backupDir,
    backupEnabled: false,
  }));

  const server = http.createServer((request, response) => {
    if (request.url === '/report' && request.method === 'POST') {
      const chunks = [];
      request.on('data', (chunk) => chunks.push(chunk));
      request.on('end', () => {
        try {
          rendererReport = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        } catch (error) {
          rendererReport = { error: String(error) };
        }
        reportReceived = rendererReport?.preload === true;
        response.writeHead(204);
        response.end();
      });
      return;
    }

    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><script>
      const report = (details) => fetch('/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preload: Boolean(window.electronAPI), ...details }),
      });

      const run = async () => {
        if (!window.electronAPI) {
          await report({ error: 'preload bridge unavailable' });
          return;
        }

        const pngType = await window.electronAPI.getFileType(${JSON.stringify(pngPath)});
        const videoType = await window.electronAPI.getFileType(${JSON.stringify(videoPath)});
        const zipType = await window.electronAPI.getFileType(${JSON.stringify(zipPath)});
        const archiveFiles = await window.electronAPI.getArchiveFiles(${JSON.stringify(zipPath)});
        const archiveData = await window.electronAPI.getArchiveFileDataUrl(${JSON.stringify(zipPath)}, 'inside.png');
        const updateState = await window.electronAPI.getAppUpdateState();
        const updateCheck = await window.electronAPI.checkForAppUpdates();

        await report({
          pngType,
          videoType,
          zipType,
          archiveName: archiveFiles?.[0]?.name || '',
          archiveData: String(typeof archiveData === 'string' && archiveData.startsWith('data:image/png;base64,')),
          updateStatus: updateCheck?.status || updateState?.status || '',
          updateError: updateCheck?.error || updateState?.error || '',
          packaged: String(updateCheck?.status !== 'disabled'),
          currentVersion: updateState?.currentVersion || '',
        });
      };

      run().catch((error) => report({ error: String(error) }));
    </script>`);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const electronEnv = { ...process.env };
  delete electronEnv.ELECTRON_RUN_AS_NODE;
  electronProcess = spawn(exePath, [
    `--user-data-dir=${userDataDir}`,
    `--data-dir=${dataDir}`,
    `--smoke-url=http://127.0.0.1:${address.port}`,
    '--no-sandbox',
  ], {
    cwd: unpackedDir,
    env: {
      ...electronEnv,
      ELECTRON_ENABLE_LOGGING: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  electronProcess.stdout.on('data', (chunk) => { output += chunk; });
  electronProcess.stderr.on('data', (chunk) => { output += chunk; });

  const deadline = Date.now() + 60000;
  while (!reportReceived && electronProcess.exitCode === null && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  await stopElectron();
  await new Promise((resolve) => server.close(resolve));

  if (!reportReceived) {
    throw new Error(`Packaged app did not confirm the preload bridge: ${JSON.stringify(rendererReport)}\n${output}`);
  }
  if (rendererReport?.error) {
    throw new Error(`Packaged smoke renderer error: ${rendererReport.error}\n${output}`);
  }
  if (rendererReport?.pngType !== 'image' || rendererReport?.videoType !== 'video' || rendererReport?.zipType !== 'archive') {
    throw new Error(`Packaged media fixtures were not classified: ${JSON.stringify(rendererReport)}`);
  }
  if (rendererReport?.archiveName !== 'inside.png' || rendererReport?.archiveData !== 'true') {
    throw new Error(`Packaged archive fixture could not be read: ${JSON.stringify(rendererReport)}`);
  }
  if (rendererReport?.updateStatus === 'disabled') {
    throw new Error(`Packaged update check should not be disabled: ${JSON.stringify(rendererReport)}`);
  }

  console.log(`Packaged media/update smoke passed (${rendererReport.currentVersion}, status=${rendererReport.updateStatus}${rendererReport.updateError ? `, error=${rendererReport.updateError}` : ''}).`);
} finally {
  await stopElectron();
  try {
    cleanup();
  } catch (error) {
    console.warn(`Could not remove the isolated packaged smoke directory ${tempRoot}: ${error.message}`);
  }
}
