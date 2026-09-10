# Electron runtime baseline (v1.1.19)

This document fixes the runtime and packaging contract that must be preserved while the main process stays on TypeScript domain modules. Run `npm run verify:electron-contracts` to detect changes. Run `npm run verify:electron-contracts -- --json` to print the complete sorted main handler list, preload API-to-channel map, and renderer API usage list.

## Entrypoints and outputs

| Concern | Development | Packaged application |
| --- | --- | --- |
| Renderer | Vite server at `http://localhost:5174` | `dist/index.html` |
| Main source | `src/main/**/*.ts` (entry `src/main/main.ts`) | Same TypeScript sources compiled to `dist-electron-app/` |
| Main entry | `dist-electron-app/main.js` | `dist-electron-app/main.js` inside `app.asar` |
| Preload source | `src/main/preload.ts` | `src/main/preload.ts` |
| Preload output | `dist-electron-app/preload.js` | `dist-electron-app/preload.js` inside `app.asar` |
| BrowserWindow preload | `preload.js`, next to the compiled main | Same relative path inside `app.asar` |
| Installer output | Not applicable | `release/` |

`src/main/main.ts` is the bootstrap entry. Database, backup, media, updater, and IPC live in domain modules under `src/main/`. The incomplete historical stubs in `src/main/ipc/*` were compared with the v1.1.19 implementation and deleted; `src/main/ipc/register.ts` and `src/main/ipc/bookmarks.ts` are the live handlers. `electron/main.js` has been removed after contract verification. Unused leftovers `electron/preload.ts`, root `preload.ts`, `src/preload/index.ts`, and `electron/preload.js` are still not built, referenced, or packaged.

The main process compiles with TypeScript checking enabled (no `@ts-nocheck`) and ESM `import` statements. ESLint exceptions for pre-existing expressions apply to `src/main/**/*.ts` except preload.

## Persistent paths

These paths are behavior compatibility requirements. The build cleanup must not change them.

| Data | Development (`VITE_DEV_SERVER_URL` is set) | Packaged/production |
| --- | --- | --- |
| Database | `<project>/save/erp.db` | `%LOCALAPPDATA%/Local ERP/erp.db` |
| Thumbnails | `<project>/save/thumbnails` | `%LOCALAPPDATA%/Local ERP/thumbnails` |
| Archive cache | `<project>/save/archive-video-cache` | `%LOCALAPPDATA%/Local ERP/archive-video-cache` |
| Config | `app.getPath('userData')/config.json` | `app.getPath('userData')/config.json` |
| Log | `app.getPath('userData')/app.log` | `app.getPath('userData')/app.log` |
| Default backup | `%LOCALAPPDATA%/backups` | `%LOCALAPPDATA%/backups` |

`npm run start` and `npm run electron:preview` do not set `VITE_DEV_SERVER_URL`, so they use the production data-path branch. Do not use them for an automated smoke test without isolating or copying the application first.

## IPC audit

The checked-in JSON baseline fingerprints the complete sorted contract and records its size. It currently contains 100 unique `ipcMain.handle` channels, one `ipcMain.on` channel, and 101 preload APIs. Duplicate `ipcMain.handle` registrations are a verification failure. The verifier walks every `src/main/**/*.ts` file except preload.

Safe corrections made while establishing this baseline:

- `setThumbnailPreviewScale` is used by the renderer. Its missing main handler now validates, saves, and returns the normalized scale without changing the existing channel or config key.
- `removeAllBookmarks` is used by three renderer call sites. The existing main handler is now exposed by the canonical preload.
- Generic preload `send(channel, ...)` is retained for API compatibility but accepts only the sole renderer-used channel, `window-control`.

Recorded removal candidates:

- `getVideoStream` is exposed by preload but has no main handler and no renderer call site. It remains in place for compatibility until a later removal pass.
- Main handlers `openDbFile`, `openExternal`, and `updateRecord` use legacy channel names. The renderer uses `db:openFile`, `shell:openExternal`, and `db:updateRecord`; the legacy handlers remain until behavior coverage is available.

## Packaging resources

The packaged application includes compiled `dist-electron-app/**/*.js` (main, preload, and domain modules), the renderer `dist/`, resources, `package.json`, and production dependencies. TypeScript Electron sources are not packaged.

The active TypeScript main process classifies viewer file extensions internally. It must not import runtime helpers from `dist/`, because renderer builds replace that directory. The contract verifier rejects a main-process dependency on `../dist/` and compares IPC registrations with the checked-in JSON fingerprint.

`better-sqlite3` remains in `asarUnpack`. Both `extraResources` and `asarUnpack` are temporarily retained for FFmpeg/FFprobe because the active main process both imports their npm packages and probes unpacked resource paths. Removing either copy requires installed-application media tests and is intentionally deferred.

## Verification commands

- `npm run verify:electron-contracts`: compare the current main/preload/renderer contract and runtime topology with the checked-in baseline.
- `npm run verify:electron-contracts -- --json`: print every handler, preload API mapping, and renderer API usage entry for review.
- `npm run clean:electron`: remove only the validated `dist-electron-app/` output directory.
- `npm run build:main`: compile `src/main/**/*.ts` to `dist-electron-app/`.
- `npm run build:preload`: compile only the canonical preload into `dist-electron-app/`.
- `npm run build:renderer`: build only the renderer into `dist/`.
- `npm run smoke:electron`: copy compiled main-process modules into a temporary application, use a temporary DB/config/backup location, and verify the preload bridge, image/video/archive fixtures, archive file reads, and unpackaged auto-update `disabled` state. It never starts the application against the normal development or production data paths.
- `npm run smoke:electron-packaged`: if `release/win-unpacked/Local ERP.exe` exists, launch that packaged binary with `--smoke-url` and `--data-dir` so the test page and database stay isolated. It verifies image/video/archive fixtures and that `app-update:check` is not the unpackaged `disabled` state. Skips cleanly when the unpacked build is absent.
