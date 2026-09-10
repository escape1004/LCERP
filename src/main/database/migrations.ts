import { db } from './connection';
import { ensureDefaultProfile } from './scope';
import { applyDatabaseSchema } from './schema';
import { log } from '../app/state';

export function initializeDatabase() {
  try {
    applyDatabaseSchema(db);
    const defaultProfile = ensureDefaultProfile();
    db.prepare('UPDATE categories SET profileId = ? WHERE profileId IS NULL OR profileId = ?').run(defaultProfile.id, '');
    db.prepare('UPDATE records SET profileId = ? WHERE profileId IS NULL OR profileId = ?').run(defaultProfile.id, '');
  } catch (error) {
    log('Error initializing database:', error);
    throw error;
  }
}
