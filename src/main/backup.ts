import fs from 'fs';
import path from 'path';
import {
  appConfig,
  db,
  getConfiguredBackupDir,
  getConfiguredBackupInterval,
  log,
} from './store';

export const MAX_AUTOMATIC_BACKUPS = 10;
export let automaticBackupTimer = null;
export let automaticBackupInProgress = false;

export function createBackupTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function cleanupOldAutomaticBackups(directoryPath) {
  try {
    const automaticBackups = fs.readdirSync(directoryPath)
      .filter(fileName => /^auto-backup-.*\.db$/i.test(fileName))
      .map(fileName => {
        const filePath = path.join(directoryPath, fileName);
        return { filePath, modifiedAt: fs.statSync(filePath).mtimeMs };
      })
      .sort((a, b) => b.modifiedAt - a.modifiedAt);

    automaticBackups.slice(MAX_AUTOMATIC_BACKUPS).forEach(({ filePath }) => {
      fs.unlinkSync(filePath);
    });
  } catch (error) {
    log('Automatic backup cleanup failed:', error);
  }
}

export async function createDatabaseBackup({ automatic = false } = {}) {
  const destinationDirectory = getConfiguredBackupDir();
  fs.mkdirSync(destinationDirectory, { recursive: true });
  const prefix = automatic ? 'auto-backup' : 'backup';
  const destinationPath = path.join(destinationDirectory, `${prefix}-${createBackupTimestamp()}.db`);

  await db.backup(destinationPath);
  if (automatic) cleanupOldAutomaticBackups(destinationDirectory);
  log(automatic ? 'Automatic backup completed:' : 'Manual backup completed:', destinationPath);
  return destinationPath;
}

export async function runAutomaticBackup() {
  if (automaticBackupInProgress) {
    log('Automatic backup skipped: previous backup is still running');
    return;
  }

  automaticBackupInProgress = true;
  try {
    await createDatabaseBackup({ automatic: true });
  } catch (error) {
    log('Automatic backup failed:', error);
  } finally {
    automaticBackupInProgress = false;
  }
}

export function startAutomaticBackup({ runImmediately = false } = {}) {
  if (automaticBackupTimer) {
    clearInterval(automaticBackupTimer);
    automaticBackupTimer = null;
  }

  if (appConfig.backupEnabled === false) {
    log('Automatic backup disabled');
    return;
  }

  const intervalMinutes = getConfiguredBackupInterval();
  automaticBackupTimer = setInterval(() => {
    void runAutomaticBackup();
  }, intervalMinutes * 60 * 1000);
  automaticBackupTimer.unref?.();
  log('Automatic backup scheduled:', {
    intervalMinutes,
    backupDir: getConfiguredBackupDir()
  });

  if (runImmediately) {
    void runAutomaticBackup();
  }
}

export function stopAutomaticBackup() {
  if (automaticBackupTimer) {
    clearInterval(automaticBackupTimer);
    automaticBackupTimer = null;
  }
}
