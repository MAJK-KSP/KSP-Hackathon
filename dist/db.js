"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDb = exports.getAllRows = exports.getRow = exports.runQuery = void 0;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const pool = new pg_1.Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
});
// Helper to convert SQLite style parameter placeholders (?) to PostgreSQL ($1, $2, ...)
const convertSql = (sql) => {
    let index = 1;
    return sql.replace(/\?/g, () => `$${index++}`);
};
// Helper to run raw SQL queries wrapped in Promises
const runQuery = async (sql, params = []) => {
    // Skip SQLite-specific PRAGMA statements
    if (sql.trim().toUpperCase().startsWith('PRAGMA')) {
        return { lastID: 0, changes: 0 };
    }
    const pgSql = convertSql(sql);
    const result = await pool.query(pgSql, params);
    return { lastID: 0, changes: result.rowCount || 0 };
};
exports.runQuery = runQuery;
// Helper to fetch a single row wrapped in Promises
const getRow = async (sql, params = []) => {
    const pgSql = convertSql(sql);
    const result = await pool.query(pgSql, params);
    return result.rows[0] || null;
};
exports.getRow = getRow;
// Helper to fetch all rows wrapped in Promises
const getAllRows = async (sql, params = []) => {
    const pgSql = convertSql(sql);
    const result = await pool.query(pgSql, params);
    return result.rows;
};
exports.getAllRows = getAllRows;
// Initialize the database tables
const initDb = async () => {
    // Create users table
    await (0, exports.runQuery)(`
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
    // Run a safe migration to add temp_mfa_secret if the table already exists
    try {
        await (0, exports.runQuery)('ALTER TABLE users ADD COLUMN temp_mfa_secret TEXT;');
    }
    catch (err) {
        // Column already exists or table doesn't exist yet (handled by CREATE TABLE)
    }
    // Index on email for faster lookups
    await (0, exports.runQuery)(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);
    // Create sessions table
    await (0, exports.runQuery)(`
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
    await (0, exports.runQuery)(`
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
    // --- AI-Ready Tables ---
    // User roles table (admin vs officer)
    await (0, exports.runQuery)(`
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'officer',
      assigned_at TEXT NOT NULL
    );
  `);
    // Daily briefings (admin-created instructions for officers)
    await (0, exports.runQuery)(`
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
    // Index on briefing effective_date for faster lookups
    await (0, exports.runQuery)(`
    CREATE INDEX IF NOT EXISTS idx_briefings_date ON daily_briefings(effective_date);
  `);
    // Chat conversations (one per user session with the AI)
    await (0, exports.runQuery)(`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
    // Chat messages within conversations
    await (0, exports.runQuery)(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
    );
  `);
    // Index on messages by conversation for fast history retrieval
    await (0, exports.runQuery)(`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON chat_messages(conversation_id, created_at);
  `);
    // AI dataset registry (controls which tables the LLM can query)
    await (0, exports.runQuery)(`
    CREATE TABLE IF NOT EXISTS ai_dataset_registry (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL UNIQUE,
      description TEXT,
      is_enabled INTEGER DEFAULT 1,
      added_by TEXT REFERENCES users(id),
      added_at TEXT NOT NULL
    );
  `);
    console.log('Database initialized successfully using Supabase Postgres.');
};
exports.initDb = initDb;
