"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDb = exports.getAllRows = exports.getRow = exports.runQuery = void 0;
const sqlite3_1 = __importDefault(require("sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Ensure the directory exists
const dbDir = path_1.default.resolve(__dirname, '..');
if (!fs_1.default.existsSync(dbDir)) {
    fs_1.default.mkdirSync(dbDir, { recursive: true });
}
const dbPath = path_1.default.join(dbDir, 'auth.db');
const db = new sqlite3_1.default.Database(dbPath);
// Helper to run raw SQL queries wrapped in Promises
const runQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) {
                reject(err);
            }
            else {
                resolve({ lastID: this.lastID, changes: this.changes });
            }
        });
    });
};
exports.runQuery = runQuery;
// Helper to fetch a single row wrapped in Promises
const getRow = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(row || null);
            }
        });
    });
};
exports.getRow = getRow;
// Helper to fetch all rows wrapped in Promises
const getAllRows = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(rows);
            }
        });
    });
};
exports.getAllRows = getAllRows;
// Initialize the database tables
const initDb = async () => {
    // Enable foreign key constraints
    await (0, exports.runQuery)('PRAGMA foreign_keys = ON;');
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
    console.log('Database initialized successfully at:', dbPath);
};
exports.initDb = initDb;
