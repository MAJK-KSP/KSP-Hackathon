import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

// Find project root by climbing up until package.json is found
let rootDir = __dirname;
while (!fs.existsSync(path.join(rootDir, 'package.json')) && path.dirname(rootDir) !== rootDir) {
  rootDir = path.dirname(rootDir);
}

const dbPath = path.join(rootDir, 'auth.db');
const db = new sqlite3.Database(dbPath);

// Helper to run raw SQL queries wrapped in Promises
export const runQuery = (sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> => {
  // Convert Postgres placeholders ($1, $2) back to SQLite (?) if they exist
  const sqliteSql = sql.replace(/\$\d+/g, '?');
  return new Promise((resolve, reject) => {
    db.run(sqliteSql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
};

// Helper to fetch a single row wrapped in Promises
export const getRow = <T>(sql: string, params: any[] = []): Promise<T | null> => {
  const sqliteSql = sql.replace(/\$\d+/g, '?');
  return new Promise((resolve, reject) => {
    db.get(sqliteSql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve((row as T) || null);
      }
    });
  });
};

// Helper to fetch all rows wrapped in Promises
export const getAllRows = <T>(sql: string, params: any[] = []): Promise<T[]> => {
  const sqliteSql = sql.replace(/\$\d+/g, '?');
  return new Promise((resolve, reject) => {
    db.all(sqliteSql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows as T[]);
      }
    });
  });
};

// Initialize the database tables
export const initDb = async () => {
  // Enable foreign key constraints
  await runQuery('PRAGMA foreign_keys = ON;');

  // Create users table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      mfa_secret TEXT,
      temp_mfa_secret TEXT,
      mfa_enabled INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  try {
    await runQuery('ALTER TABLE users ADD COLUMN temp_mfa_secret TEXT;');
  } catch (err) {}

  await runQuery(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);

  // Create sessions table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Create officer_profiles table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS officer_profiles (
      user_id TEXT PRIMARY KEY,
      badge_number TEXT,
      rank TEXT,
      post TEXT,
      jurisdiction TEXT,
      area TEXT,
      station TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // User roles table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'officer',
      assigned_at TEXT NOT NULL
    );
  `);

  // Daily briefings
  await runQuery(`
    CREATE TABLE IF NOT EXISTS daily_briefings (
      id TEXT PRIMARY KEY,
      created_by TEXT NOT NULL REFERENCES users(id),
      target_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      target_role TEXT,
      target_station TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      priority TEXT DEFAULT 'normal',
      effective_date TEXT NOT NULL,
      expires_at TEXT,
      created_at TEXT NOT NULL
    );
  `);

  await runQuery(`CREATE INDEX IF NOT EXISTS idx_briefings_date ON daily_briefings(effective_date);`);

  // Chat conversations
  await runQuery(`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Chat messages
  await runQuery(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
    );
  `);

  await runQuery(`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON chat_messages(conversation_id, created_at);`);

  // AI dataset registry
  await runQuery(`
    CREATE TABLE IF NOT EXISTS ai_dataset_registry (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL UNIQUE,
      description TEXT,
      is_enabled INTEGER DEFAULT 1,
      added_by TEXT REFERENCES users(id),
      added_at TEXT NOT NULL
    );
  `);

  console.log('Database initialized successfully using SQLite at:', dbPath);
};
