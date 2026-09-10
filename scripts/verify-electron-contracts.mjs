import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const rootDir = process.cwd();
const mainPath = path.join(rootDir, 'electron', 'main.js');
const preloadPath = path.join(rootDir, 'src', 'main', 'preload.ts');
const baselinePath = path.join(rootDir, 'docs', 'electron-runtime-baseline.json');

function parseSource(filePath, scriptKind) {
  return ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
}

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

function getStaticString(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
    ? node.text
    : null;
}

function getIpcCall(node, objectName) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
  if (!ts.isIdentifier(node.expression.expression) || node.expression.expression.text !== objectName) return null;

  const method = node.expression.name.text;
  if (!['handle', 'on', 'invoke', 'send'].includes(method)) return null;
  return {
    method,
    channel: getStaticString(node.arguments[0]) ?? '<dynamic>',
  };
}

function extractMainRegistrations(sourceFile) {
  const registrations = [];
  walk(sourceFile, (node) => {
    const call = getIpcCall(node, 'ipcMain');
    if (call) registrations.push(call);
  });
  return registrations;
}

function getPropertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return null;
}

function findApiObject(sourceFile) {
  let apiObject = null;
  walk(sourceFile, (node) => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || node.name.text !== 'api') return;
    if (node.initializer && ts.isObjectLiteralExpression(node.initializer)) apiObject = node.initializer;
  });
  return apiObject;
}

function extractPreloadApi(sourceFile) {
  const apiObject = findApiObject(sourceFile);
  if (!apiObject) throw new Error(`Could not find the preload api object in ${preloadPath}`);

  return apiObject.properties
    .map((property) => {
      if (!ts.isPropertyAssignment(property) && !ts.isMethodDeclaration(property)) return null;
      const name = getPropertyName(property.name);
      if (!name) return null;

      const calls = [];
      walk(property, (node) => {
        const call = getIpcCall(node, 'ipcRenderer');
        if (call) calls.push(`${call.method}:${call.channel}`);
      });

      return { name, calls: [...new Set(calls)].sort() };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function findDuplicates(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

function listRendererUsage() {
  const sourceRoot = path.join(rootDir, 'src');
  const result = new Set();
  const pending = [sourceRoot];

  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        const source = fs.readFileSync(entryPath, 'utf8');
        for (const match of source.matchAll(/electronAPI(?:\?\.|\.|\s+as\s+any\)\.)\s*([A-Za-z_$][\w$]*)/g)) {
          result.add(match[1]);
        }
      }
    }
  }

  return [...result].sort();
}

function listRendererSendChannels() {
  const sourceRoot = path.join(rootDir, 'src');
  const result = new Set();
  const pending = [sourceRoot];

  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        const source = fs.readFileSync(entryPath, 'utf8');
        for (const match of source.matchAll(/electronAPI(?:\?\.|\.)send\(\s*['"]([^'"]+)['"]/g)) {
          result.add(match[1]);
        }
      }
    }
  }

  return [...result].sort();
}

function buildActualContract() {
  const mainSource = parseSource(mainPath, ts.ScriptKind.JS);
  const preloadSource = parseSource(preloadPath, ts.ScriptKind.TS);
  const mainRegistrations = extractMainRegistrations(mainSource);
  const preloadApi = extractPreloadApi(preloadSource);
  const handlers = mainRegistrations.filter(({ method }) => method === 'handle').map(({ channel }) => channel);
  const onChannels = mainRegistrations.filter(({ method }) => method === 'on').map(({ channel }) => channel);
  const preloadInvokeChannels = preloadApi
    .flatMap(({ calls }) => calls)
    .filter((call) => call.startsWith('invoke:'))
    .map((call) => call.slice('invoke:'.length));

  return {
    main: {
      entry: 'electron/main.js',
      handlers: [...new Set(handlers)].sort(),
      onChannels: [...new Set(onChannels)].sort(),
      duplicateHandlers: findDuplicates(handlers),
    },
    preload: {
      source: 'src/main/preload.ts',
      output: 'dist-electron-app/preload.js',
      browserWindowPath: "path.join(__dirname, '..', 'dist-electron-app', 'preload.js')",
      api: preloadApi,
    },
    ipcAudit: {
      preloadWithoutMainHandler: [...new Set(preloadInvokeChannels)]
        .filter((channel) => !handlers.includes(channel))
        .sort(),
      mainHandlerWithoutPreload: [...new Set(handlers)]
        .filter((channel) => !preloadInvokeChannels.includes(channel))
        .sort(),
    },
    rendererApiUsage: listRendererUsage(),
    rendererSendChannels: listRendererSendChannels(),
  };
}

function assertRuntimeTopology(actual) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const mainSource = fs.readFileSync(mainPath, 'utf8');
  const viteSource = fs.readFileSync(path.join(rootDir, 'vite.config.ts'), 'utf8');
  const errors = [];

  if (packageJson.main !== actual.main.entry) errors.push(`package.json main is ${packageJson.main}`);
  if (packageJson.build?.directories?.output !== 'release') errors.push('electron-builder output is not release');
  if (!packageJson.build?.files?.includes('dist-electron-app/preload.js')) errors.push('compiled preload is not packaged');
  if (!packageJson.build?.files?.includes('electron/main.js')) errors.push('active main is not packaged');
  const electronDevScript = packageJson.scripts?.['electron:dev'] ?? '';
  const electronLaunchCount = (electronDevScript.match(/electron\s+\./g) ?? []).length;
  if (electronLaunchCount !== 1) errors.push(`electron:dev launches Electron ${electronLaunchCount} times`);
  if (electronDevScript.includes('5173')) errors.push('electron:dev still waits for port 5173');
  if ((electronDevScript.match(/build:preload/g) ?? []).length !== 1) errors.push('electron:dev does not build preload exactly once');
  if (packageJson.scripts?.dev !== 'vite') errors.push('npm run dev has responsibilities other than the renderer server');
  if (!mainSource.includes(actual.preload.browserWindowPath)) errors.push('BrowserWindow preload path differs from baseline');
  if (!viteSource.includes("outDir: 'dist-electron-app'")) errors.push('preload build output differs from baseline');
  if (!viteSource.includes('strictPort: true')) errors.push('Vite development server is not pinned to port 5174');
  if (viteSource.includes('vite-plugin-electron')) errors.push('vite-plugin-electron still owns Electron startup/build');
  if (/require\(['"]\.\.\/dist\//.test(mainSource)) errors.push('active main has a runtime dependency on renderer output');
  if (actual.main.duplicateHandlers.length > 0) errors.push('duplicate ipcMain.handle registrations detected');
  if (actual.rendererSendChannels.some((channel) => channel !== 'window-control')) errors.push('renderer uses a non-allowlisted send channel');

  if (errors.length > 0) throw new Error(errors.join('\n'));
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function buildBaselineSummary(actual) {
  return {
    main: {
      entry: actual.main.entry,
      handlerCount: actual.main.handlers.length,
      handlersSha256: fingerprint(actual.main.handlers),
      onChannels: actual.main.onChannels,
      duplicateHandlers: actual.main.duplicateHandlers,
    },
    preload: {
      source: actual.preload.source,
      output: actual.preload.output,
      browserWindowPath: actual.preload.browserWindowPath,
      apiCount: actual.preload.api.length,
      apiAndChannelsSha256: fingerprint(actual.preload.api),
    },
    ipcAudit: actual.ipcAudit,
    rendererApiUsageCount: actual.rendererApiUsage.length,
    rendererApiUsageSha256: fingerprint(actual.rendererApiUsage),
    rendererSendChannels: actual.rendererSendChannels,
  };
}

const actual = buildActualContract();
assertRuntimeTopology(actual);

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(actual, null, 2)}\n`);
  process.exit(0);
}

if (process.argv.includes('--summary')) {
  process.stdout.write(`${JSON.stringify(buildBaselineSummary(actual), null, 2)}\n`);
  process.exit(0);
}

const expected = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const summary = buildBaselineSummary(actual);
if (JSON.stringify(summary) !== JSON.stringify(expected)) {
  console.error('Electron runtime contract differs from docs/electron-runtime-baseline.json.');
  console.error('Run `npm run verify:electron-contracts -- --json` and review the change.');
  process.exit(1);
}

console.log(`Electron runtime contract verified: ${actual.main.handlers.length} handlers, ${actual.preload.api.length} preload APIs.`);
