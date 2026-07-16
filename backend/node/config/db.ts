/**
 * @file db.ts
 * @description Database helper module for the PostgreSQL database (Supabase).
 * Handles connection pooling, query execution, placeholder translation, and schema initialization.
 * Part of the Node.js backend.
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

let connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is missing.");
}

// Robust parsing to URL-encode password containing special characters (like '@')
const prefix = "postgresql://";
if (connectionString.startsWith(prefix)) {
  const remainder = connectionString.slice(prefix.length);
  const parts = remainder.split('@');
  if (parts.length > 2) {
    const hostDb = parts[parts.length - 1];
    const credentials = remainder.slice(0, remainder.lastIndexOf('@'));
    if (credentials.includes(':')) {
      const colonIdx = credentials.indexOf(':');
      const user = credentials.slice(0, colonIdx);
      const pwd = credentials.slice(colonIdx + 1);
      const encodedPwd = encodeURIComponent(pwd);
      connectionString = `${prefix}${user}:${encodedPwd}@${hostDb}`;
    }
  }
}

const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

export const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : {
    rejectUnauthorized: false // Required for Supabase
  }
});

// Helper to convert SQLite-style '?' placeholders to PostgreSQL-style '$1', '$2', ...
function convertPlaceholders(sql: string): string {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

// Helper to run raw SQL queries wrapped in Promises
export const runQuery = async (sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> => {
  const pgSql = convertPlaceholders(sql);
  const result = await pool.query(pgSql, params);
  return { 
    lastID: 0, 
    changes: result.rowCount || 0 
  };
};

// Helper to fetch a single row wrapped in Promises
export const getRow = async <T>(sql: string, params: any[] = []): Promise<T | null> => {
  const pgSql = convertPlaceholders(sql);
  const result = await pool.query(pgSql, params);
  return (result.rows[0] as T) || null;
};

// Helper to fetch all rows wrapped in Promises
export const getAllRows = async <T>(sql: string, params: any[] = []): Promise<T[]> => {
  const pgSql = convertPlaceholders(sql);
  const result = await pool.query(pgSql, params);
  return result.rows as T[];
};

// Initialize the database tables
export const initDb = async () => {
  console.log('Initializing PostgreSQL database schema on Supabase...');

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

  await runQuery(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);

  // Create sessions table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      user_agent TEXT,
      ip_address TEXT
    );
  `);

  // Create officer_profiles table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS officer_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      badge_number TEXT,
      rank TEXT,
      post TEXT,
      jurisdiction TEXT,
      area TEXT,
      station TEXT
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

  // AI audit logs
  await runQuery(`
    CREATE TABLE IF NOT EXISTS ai_audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_query TEXT NOT NULL,
      ai_response TEXT NOT NULL,
      sql_queries_run TEXT NOT NULL,
      time_taken_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      cryptographic_signature TEXT NOT NULL
    );
  `);

  console.log('PostgreSQL database initialized successfully.');
};
