import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'path';
import fs from 'fs';

let db: Database.Database | null = null;
let dbPath: string;

export function getDbPath(): string {
  return dbPath;
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

export function initializeDatabase(): void {
  try {
    dbPath = join(app.getPath('userData'), 'erp.db');
    db = new Database(dbPath);

    // 테이블 생성
    db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parentId TEXT,
        fields TEXT NOT NULL,
        createdAt TEXT,
        updatedAt TEXT
      );

      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY,
        categoryId TEXT NOT NULL,
        data TEXT NOT NULL,
        createdAt TEXT,
        updatedAt TEXT,
        FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE CASCADE
      );
    `);

    // 외래 키 제약 조건 활성화
    db.exec('PRAGMA foreign_keys = ON;');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

export { db }; 