import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import electronPath from 'electron';

const rootDir = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'local-erp-electron-smoke-'));
const appDir = path.join(tempRoot, 'app');
const userDataDir = path.join(tempRoot, 'user-data');
const backupDir = path.join(tempRoot, 'backups');
let electronProcess;
let reportReceived = false;
let fileViewerContractVerified = false;
let rendererReport = null;

function copyFile(relativePath) {
  const sourcePath = path.join(rootDir, relativePath);
  const destinationPath = path.join(appDir, relativePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

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
  if (!resolvedTempRoot.startsWith(resolvedSystemTemp) || !path.basename(resolvedTempRoot).startsWith('local-erp-electron-smoke-')) {
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
  copyFile('electron/main.js');
  copyFile('dist-electron-app/preload.js');
  copyFile('resources/icon.ico');
  const viewerFixturePath = path.join(appDir, 'viewer-fixture.png');
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(viewerFixturePath, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ));
  fs.symlinkSync(path.join(rootDir, 'node_modules'), path.join(appDir, 'node_modules'), 'junction');
  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({
    name: 'local-erp-electron-smoke',
    version: '1.1.19',
    main: 'electron/main.js',
  }));
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(userDataDir, 'config.json'), JSON.stringify({
    backupDir,
    backupEnabled: false,
  }));

  const server = http.createServer((request, response) => {
    if (request.url?.startsWith('/report')) {
      const requestUrl = new URL(request.url, 'http://127.0.0.1');
      rendererReport = Object.fromEntries(requestUrl.searchParams);
      reportReceived = requestUrl.searchParams.get('preload') === 'true';
      fileViewerContractVerified = requestUrl.searchParams.get('type') === 'image'
        && requestUrl.searchParams.get('data') === 'true';
      response.writeHead(204);
      response.end();
      return;
    }

    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><script>
      const report = (details) => {
        const query = new URLSearchParams({
          preload: String(Boolean(window.electronAPI)),
          ...details,
        });
        return fetch('/report?' + query);
      };

      if (!window.electronAPI) {
        report({ error: 'preload bridge unavailable' });
      } else {
        Promise.all([
          window.electronAPI.getFileType(${JSON.stringify(viewerFixturePath)}),
          window.electronAPI.getFileDataUrl(${JSON.stringify(viewerFixturePath)}),
        ]).then(([type, data]) => report({
          type,
          data: String(typeof data === 'string' && data.startsWith('data:image/png;base64,')),
        })).catch((error) => report({ error: String(error) }));
      }
    </script>`);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const devServerUrl = `http://127.0.0.1:${address.port}`;
  const electronEnv = { ...process.env };
  delete electronEnv.ELECTRON_RUN_AS_NODE;
  electronProcess = spawn(electronPath, [appDir, `--user-data-dir=${userDataDir}`, '--no-sandbox'], {
    cwd: appDir,
    env: {
      ...electronEnv,
      NODE_PATH: path.join(rootDir, 'node_modules'),
      VITE_DEV_SERVER_URL: devServerUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  electronProcess.stdout.on('data', (chunk) => { output += chunk; });
  electronProcess.stderr.on('data', (chunk) => { output += chunk; });

  const deadline = Date.now() + 15000;
  while (!reportReceived && electronProcess.exitCode === null && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  await stopElectron();
  await new Promise((resolve) => server.close(resolve));

  if (!reportReceived) {
    throw new Error(`Electron renderer did not confirm the preload bridge: ${JSON.stringify(rendererReport)}\n${output}`);
  }
  if (!fileViewerContractVerified) {
    throw new Error(`Electron renderer could not classify and load the viewer fixture: ${JSON.stringify(rendererReport)}\n${output}`);
  }
  if (!fs.existsSync(path.join(appDir, 'save', 'erp.db'))) {
    throw new Error('Electron main did not create the isolated development database fixture.');
  }

  console.log('Electron runtime smoke test passed with an isolated DB, preload bridge, and viewer file fixture.');
} finally {
  await stopElectron();
  try {
    cleanup();
  } catch (error) {
    console.warn(`Could not remove the isolated smoke directory ${tempRoot}: ${error.message}`);
  }
}
