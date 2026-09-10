import Database from 'better-sqlite3';
import { dbPath, log } from '../app/state';

export const db: any = new Database(dbPath, { verbose: log });

db.exec('PRAGMA encoding = "UTF-8"');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');
