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
      // Decode first in case the password is already URL-encoded (e.g., %40 for @),
      // then re-encode to ensure consistent, valid encoding.
      const decodedPwd = decodeURIComponent(pwd);
      const encodedPwd = encodeURIComponent(decodedPwd);
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

let datasetConnectionString = process.env.DATASET_DATABASE_URL || connectionString;
if (datasetConnectionString.startsWith(prefix)) {
  const remainder = datasetConnectionString.slice(prefix.length);
  const parts = remainder.split('@');
  if (parts.length > 2) {
    const hostDb = parts[parts.length - 1];
    const credentials = remainder.slice(0, remainder.lastIndexOf('@'));
    if (credentials.includes(':')) {
      const colonIdx = credentials.indexOf(':');
      const user = credentials.slice(0, colonIdx);
      const pwd = credentials.slice(colonIdx + 1);
      const decodedPwd = decodeURIComponent(pwd);
      const encodedPwd = encodeURIComponent(decodedPwd);
      datasetConnectionString = `${prefix}${user}:${encodedPwd}@${hostDb}`;
    }
  }
}

export const datasetPool = new Pool({
  connectionString: datasetConnectionString,
  ssl: isLocal ? false : {
    rejectUnauthorized: false
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

// Helper to fetch all rows from Dataset Supabase DB (used by LLM & GIS Command Map)
export const getAllDatasetRows = async <T>(sql: string, params: any[] = []): Promise<T[]> => {
  const pgSql = convertPlaceholders(sql);
  const result = await datasetPool.query(pgSql, params);
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
      mfa_enabled BOOLEAN DEFAULT FALSE,
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

  // RBAC Audit logs for traceability and accountability
  await runQuery(`
    CREATE TABLE IF NOT EXISTS rbac_audit_logs (
      id TEXT PRIMARY KEY,
      performed_by TEXT NOT NULL,
      action TEXT NOT NULL,
      target_user_id TEXT,
      target_email TEXT,
      assigned_role TEXT,
      created_at TEXT NOT NULL,
      cryptographic_signature TEXT NOT NULL
    );
  `);

  // Case Grants for explicit case access (Decision Support & AI Summary)
  await runQuery(`
    CREATE TABLE IF NOT EXISTS case_grants (
      id TEXT PRIMARY KEY,
      judge_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL,
      granted_by UUID NOT NULL REFERENCES users(id),
      granted_at TEXT NOT NULL,
      ai_summary TEXT
    );
  `);

  // Cases table for GIS Command Map and local fallback
  await runQuery(`
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      case_number TEXT UNIQUE NOT NULL,
      crime_type TEXT NOT NULL,
      jurisdiction TEXT NOT NULL,
      police_station TEXT NOT NULL,
      landmark TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      reported_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active'
    );
  `);

  await runQuery(`CREATE INDEX IF NOT EXISTS idx_cases_crime_type ON cases(crime_type);`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_cases_police_station ON cases(police_station);`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_cases_date ON cases(reported_date);`);

  // Investigation tables for Feature 6 (Investigator Decision Support)
  await runQuery(`
    CREATE TABLE IF NOT EXISTS investigation_cases (
      case_id TEXT PRIMARY KEY,
      case_number TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      crime_type TEXT NOT NULL,
      police_station TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      incident_date TEXT NOT NULL,
      location TEXT NOT NULL,
      description TEXT NOT NULL,
      investigating_officer TEXT NOT NULL,
      outcome TEXT
    );
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS investigation_logs (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES investigation_cases(case_id) ON DELETE CASCADE,
      timestamp TEXT NOT NULL,
      actor TEXT NOT NULL,
      log_type TEXT NOT NULL,
      description TEXT NOT NULL
    );
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS investigation_evidence (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES investigation_cases(case_id) ON DELETE CASCADE,
      evidence_type TEXT NOT NULL,
      description TEXT NOT NULL,
      collected_at TEXT NOT NULL,
      location_found TEXT NOT NULL,
      status TEXT NOT NULL
    );
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS investigation_interviews (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES investigation_cases(case_id) ON DELETE CASCADE,
      interviewee_name TEXT NOT NULL,
      role TEXT NOT NULL,
      summary TEXT NOT NULL,
      interview_date TEXT NOT NULL
    );
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS investigation_suspects (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES investigation_cases(case_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      alias TEXT,
      status TEXT NOT NULL,
      alibi_status TEXT NOT NULL,
      notes TEXT
    );
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS investigation_locations (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES investigation_cases(case_id) ON DELETE CASCADE,
      location_name TEXT NOT NULL,
      location_type TEXT NOT NULL,
      address TEXT NOT NULL
    );
  `);

  await runQuery(`CREATE INDEX IF NOT EXISTS idx_inv_logs_case ON investigation_logs(case_id, timestamp);`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_inv_cases_status ON investigation_cases(status);`);

  await seedCases();
  await seedInvestigationData();

  console.log('PostgreSQL database initialized successfully.');
};

async function seedCases() {
  try {
    const existing = await getRow<{ count: string | number }>('SELECT count(*) as count FROM cases');
    if (existing && parseInt(String(existing.count), 10) > 0) {
      return;
    }
    console.log('Seeding initial GIS cases database...');

    const mockCases = [
      // Koramangala
      { id: '1', case_number: 'FIR-2026-KOR-001', crime_type: 'Theft / Burglary', jurisdiction: 'Bengaluru City Police', police_station: 'Koramangala Police Station', landmark: 'Near Forum Mall', latitude: 12.9352, longitude: 77.6144, reported_date: '2026-07-01', status: 'Active' },
      { id: '2', case_number: 'FIR-2026-KOR-002', crime_type: 'Cyber Crime / Fraud', jurisdiction: 'Bengaluru City Police', police_station: 'Koramangala Police Station', landmark: 'Near Sony World Signal', latitude: 12.9378, longitude: 77.6265, reported_date: '2026-07-04', status: 'Under Investigation' },
      { id: '3', case_number: 'FIR-2026-KOR-003', crime_type: 'Assault / Brawl', jurisdiction: 'Bengaluru City Police', police_station: 'Koramangala Police Station', landmark: 'Near Jyoti Nivas College', latitude: 12.9331, longitude: 77.6189, reported_date: '2026-07-08', status: 'Active' },
      { id: '4', case_number: 'FIR-2026-KOR-004', crime_type: 'Traffic Violation', jurisdiction: 'Bengaluru City Police', police_station: 'Koramangala Police Station', landmark: 'Near 80 Feet Road Junction', latitude: 12.9392, longitude: 77.6210, reported_date: '2026-07-12', status: 'Closed' },
      { id: '5', case_number: 'FIR-2026-KOR-005', crime_type: 'Vandalism / Property Damage', jurisdiction: 'Bengaluru City Police', police_station: 'Koramangala Police Station', landmark: 'Near Koramangala Club', latitude: 12.9315, longitude: 77.6234, reported_date: '2026-07-15', status: 'Closed' },

      // Indiranagar
      { id: '6', case_number: 'FIR-2026-IND-001', crime_type: 'Robbery', jurisdiction: 'Bengaluru City Police', police_station: 'Indiranagar Police Station', landmark: 'Near 100 Feet Road Signal', latitude: 12.9719, longitude: 77.6412, reported_date: '2026-07-02', status: 'Active' },
      { id: '7', case_number: 'FIR-2026-IND-002', crime_type: 'Theft / Burglary', jurisdiction: 'Bengaluru City Police', police_station: 'Indiranagar Police Station', landmark: 'Near CMH Road Metro Station', latitude: 12.9784, longitude: 77.6385, reported_date: '2026-07-05', status: 'Closed' },
      { id: '8', case_number: 'FIR-2026-IND-003', crime_type: 'Public Nuisance', jurisdiction: 'Bengaluru City Police', police_station: 'Indiranagar Police Station', landmark: 'Near ESI Hospital', latitude: 12.9691, longitude: 77.6341, reported_date: '2026-07-09', status: 'Active' },
      { id: '9', case_number: 'FIR-2026-IND-004', crime_type: 'Cyber Crime / Fraud', jurisdiction: 'Bengaluru City Police', police_station: 'Indiranagar Police Station', landmark: 'Near Toit Pub', latitude: 12.9792, longitude: 77.6405, reported_date: '2026-07-11', status: 'Under Investigation' },
      { id: '10', case_number: 'FIR-2026-IND-005', crime_type: 'Assault / Brawl', jurisdiction: 'Bengaluru City Police', police_station: 'Indiranagar Police Station', landmark: 'Near Defence Colony', latitude: 12.9745, longitude: 77.6451, reported_date: '2026-07-16', status: 'Closed' },

      // Whitefield
      { id: '11', case_number: 'FIR-2026-WHI-001', crime_type: 'Cyber Crime / Fraud', jurisdiction: 'Bengaluru City Police', police_station: 'Whitefield Police Station', landmark: 'Near ITPL Main Gate', latitude: 12.9868, longitude: 77.7381, reported_date: '2026-07-03', status: 'Under Investigation' },
      { id: '12', case_number: 'FIR-2026-WHI-002', crime_type: 'Theft / Burglary', jurisdiction: 'Bengaluru City Police', police_station: 'Whitefield Police Station', landmark: 'Near Phoenix Marketcity', latitude: 12.9958, longitude: 77.6964, reported_date: '2026-07-06', status: 'Active' },
      { id: '13', case_number: 'FIR-2026-WHI-003', crime_type: 'Traffic Violation', jurisdiction: 'Bengaluru City Police', police_station: 'Whitefield Police Station', landmark: 'Near Hope Farm Circle', latitude: 12.9841, longitude: 77.7512, reported_date: '2026-07-10', status: 'Closed' },
      { id: '14', case_number: 'FIR-2026-WHI-004', crime_type: 'Assault / Brawl', jurisdiction: 'Bengaluru City Police', police_station: 'Whitefield Police Station', landmark: 'Near Vydehi Hospital', latitude: 12.9754, longitude: 77.7289, reported_date: '2026-07-14', status: 'Active' },
      { id: '15', case_number: 'FIR-2026-WHI-005', crime_type: 'Robbery', jurisdiction: 'Bengaluru City Police', police_station: 'Whitefield Police Station', landmark: 'Near Kadugodi Flyover', latitude: 12.9981, longitude: 77.7610, reported_date: '2026-07-17', status: 'Under Investigation' },

      // Jayanagar
      { id: '16', case_number: 'FIR-2026-JAY-001', crime_type: 'Theft / Burglary', jurisdiction: 'Bengaluru City Police', police_station: 'Jayanagar Police Station', landmark: 'Near Jayanagar 4th Block Shopping Complex', latitude: 12.9298, longitude: 77.5823, reported_date: '2026-07-01', status: 'Closed' },
      { id: '17', case_number: 'FIR-2026-JAY-002', crime_type: 'Public Nuisance', jurisdiction: 'Bengaluru City Police', police_station: 'Jayanagar Police Station', landmark: 'Near South End Circle', latitude: 12.9371, longitude: 77.5801, reported_date: '2026-07-07', status: 'Active' },
      { id: '18', case_number: 'FIR-2026-JAY-003', crime_type: 'Vandalism / Property Damage', jurisdiction: 'Bengaluru City Police', police_station: 'Jayanagar Police Station', landmark: 'Near Ashoka Pillar', latitude: 12.9432, longitude: 77.5864, reported_date: '2026-07-13', status: 'Closed' },
      { id: '19', case_number: 'FIR-2026-JAY-004', crime_type: 'Robbery', jurisdiction: 'Bengaluru City Police', police_station: 'Jayanagar Police Station', landmark: 'Near Cool Joint Signal', latitude: 12.9245, longitude: 77.5841, reported_date: '2026-07-18', status: 'Active' },
      { id: '20', case_number: 'FIR-2026-JAY-005', crime_type: 'Assault / Brawl', jurisdiction: 'Bengaluru City Police', police_station: 'Jayanagar Police Station', landmark: 'Near Madhavan Park', latitude: 12.9389, longitude: 77.5878, reported_date: '2026-07-19', status: 'Under Investigation' },

      // Ulsoor
      { id: '21', case_number: 'FIR-2026-ULS-001', crime_type: 'Theft / Burglary', jurisdiction: 'Bengaluru City Police', police_station: 'Ulsoor Police Station', landmark: 'Near Ulsoor Lake Promenade', latitude: 12.9817, longitude: 77.6286, reported_date: '2026-07-04', status: 'Active' },
      { id: '22', case_number: 'FIR-2026-ULS-002', crime_type: 'Assault / Brawl', jurisdiction: 'Bengaluru City Police', police_station: 'Ulsoor Police Station', landmark: 'Near Halasuru Police Bazar', latitude: 12.9784, longitude: 77.6241, reported_date: '2026-07-07', status: 'Active' },
      { id: '23', case_number: 'FIR-2026-ULS-003', crime_type: 'Traffic Violation', jurisdiction: 'Bengaluru City Police', police_station: 'Ulsoor Police Station', landmark: 'Near Lido Mall', latitude: 12.9734, longitude: 77.6202, reported_date: '2026-07-09', status: 'Closed' },
      { id: '24', case_number: 'FIR-2026-ULS-004', crime_type: 'Robbery', jurisdiction: 'Bengaluru City Police', police_station: 'Ulsoor Police Station', landmark: 'Near Kensington Road', latitude: 12.9845, longitude: 77.6321, reported_date: '2026-07-14', status: 'Under Investigation' },
      { id: '25', case_number: 'FIR-2026-ULS-005', crime_type: 'Public Nuisance', jurisdiction: 'Bengaluru City Police', police_station: 'Ulsoor Police Station', landmark: 'Near Someshwara Temple', latitude: 12.9801, longitude: 77.6264, reported_date: '2026-07-19', status: 'Active' },

      // Malleshwaram
      { id: '26', case_number: 'FIR-2026-MAL-001', crime_type: 'Theft / Burglary', jurisdiction: 'Bengaluru City Police', police_station: 'Malleshwaram Police Station', landmark: 'Near Malleshwaram 8th Cross', latitude: 13.0031, longitude: 77.5696, reported_date: '2026-07-03', status: 'Closed' },
      { id: '27', case_number: 'FIR-2026-MAL-002', crime_type: 'Cyber Crime / Fraud', jurisdiction: 'Bengaluru City Police', police_station: 'Malleshwaram Police Station', landmark: 'Near Sampige Road', latitude: 12.9984, longitude: 77.5712, reported_date: '2026-07-05', status: 'Active' },
      { id: '28', case_number: 'FIR-2026-MAL-003', crime_type: 'Public Nuisance', jurisdiction: 'Bengaluru City Police', police_station: 'Malleshwaram Police Station', landmark: 'Near Margosa Road', latitude: 13.0062, longitude: 77.5684, reported_date: '2026-07-10', status: 'Closed' },
      { id: '29', case_number: 'FIR-2026-MAL-004', crime_type: 'Assault / Brawl', jurisdiction: 'Bengaluru City Police', police_station: 'Malleshwaram Police Station', landmark: 'Near Malleshwaram Ground', latitude: 13.0012, longitude: 77.5641, reported_date: '2026-07-12', status: 'Under Investigation' },
      { id: '30', case_number: 'FIR-2026-MAL-005', crime_type: 'Traffic Violation', jurisdiction: 'Bengaluru City Police', police_station: 'Malleshwaram Police Station', landmark: 'Near KC General Hospital', latitude: 12.9961, longitude: 77.5732, reported_date: '2026-07-16', status: 'Closed' },

      // Cubbon Park / M.G. Road
      { id: '31', case_number: 'FIR-2026-CUB-001', crime_type: 'Theft / Burglary', jurisdiction: 'Bengaluru City Police', police_station: 'Cubbon Park Police Station', landmark: 'Near High Court of Karnataka', latitude: 12.9779, longitude: 77.5952, reported_date: '2026-07-02', status: 'Closed' },
      { id: '32', case_number: 'FIR-2026-CUB-002', crime_type: 'Traffic Violation', jurisdiction: 'Bengaluru City Police', police_station: 'Cubbon Park Police Station', landmark: 'Near M.G. Road Metro Station', latitude: 12.9745, longitude: 77.6084, reported_date: '2026-07-06', status: 'Closed' },
      { id: '33', case_number: 'FIR-2026-CUB-003', crime_type: 'Robbery', jurisdiction: 'Bengaluru City Police', police_station: 'Cubbon Park Police Station', landmark: 'Near Kasturba Road', latitude: 12.9721, longitude: 77.5982, reported_date: '2026-07-08', status: 'Active' },
      { id: '34', case_number: 'FIR-2026-CUB-004', crime_type: 'Assault / Brawl', jurisdiction: 'Bengaluru City Police', police_station: 'Cubbon Park Police Station', landmark: 'Near Chinnaswamy Stadium', latitude: 12.9789, longitude: 77.5998, reported_date: '2026-07-13', status: 'Under Investigation' },
      { id: '35', case_number: 'FIR-2026-CUB-005', crime_type: 'Vandalism / Property Damage', jurisdiction: 'Bengaluru City Police', police_station: 'Cubbon Park Police Station', landmark: 'Near Hudson Circle', latitude: 12.9698, longitude: 77.5889, reported_date: '2026-07-18', status: 'Active' },

      // Additional points for density
      { id: '36', case_number: 'FIR-2026-BGL-036', crime_type: 'Traffic Violation', jurisdiction: 'Bengaluru City Police', police_station: 'Koramangala Police Station', landmark: 'Near St. John\'s Hospital Junction', latitude: 12.9332, longitude: 77.6184, reported_date: '2026-07-05', status: 'Closed' },
      { id: '37', case_number: 'FIR-2026-BGL-037', crime_type: 'Theft / Burglary', jurisdiction: 'Bengaluru City Police', police_station: 'Indiranagar Police Station', landmark: 'Near Double Road Signal', latitude: 12.9621, longitude: 77.6321, reported_date: '2026-07-09', status: 'Active' },
      { id: '38', case_number: 'FIR-2026-BGL-038', crime_type: 'Cyber Crime / Fraud', jurisdiction: 'Bengaluru City Police', police_station: 'Whitefield Police Station', landmark: 'Near Prestige Shantiniketan', latitude: 12.9864, longitude: 77.7341, reported_date: '2026-07-10', status: 'Active' },
      { id: '39', case_number: 'FIR-2026-BGL-039', crime_type: 'Assault / Brawl', jurisdiction: 'Bengaluru City Police', police_station: 'Jayanagar Police Station', landmark: 'Near Jayanagar 9th Block', latitude: 12.9198, longitude: 77.5954, reported_date: '2026-07-14', status: 'Closed' },
      { id: '40', case_number: 'FIR-2026-BGL-040', crime_type: 'Robbery', jurisdiction: 'Bengaluru City Police', police_station: 'Ulsoor Police Station', landmark: 'Near Trinity Circle', latitude: 12.9731, longitude: 77.6162, reported_date: '2026-07-15', status: 'Active' },
      { id: '41', case_number: 'FIR-2026-BGL-041', crime_type: 'Public Nuisance', jurisdiction: 'Bengaluru City Police', police_station: 'Malleshwaram Police Station', landmark: 'Near Malleshwaram 15th Cross', latitude: 13.0094, longitude: 77.5668, reported_date: '2026-07-16', status: 'Closed' },
      { id: '42', case_number: 'FIR-2026-BGL-042', crime_type: 'Theft / Burglary', jurisdiction: 'Bengaluru City Police', police_station: 'Cubbon Park Police Station', landmark: 'Near Cubbon Park Bandstand', latitude: 12.9751, longitude: 77.5931, reported_date: '2026-07-17', status: 'Under Investigation' },
      { id: '43', case_number: 'FIR-2026-BGL-043', crime_type: 'Cyber Crime / Fraud', jurisdiction: 'Bengaluru City Police', police_station: 'Koramangala Police Station', landmark: 'Near Koramangala 1st Block', latitude: 12.9264, longitude: 77.6341, reported_date: '2026-07-18', status: 'Active' },
      { id: '44', case_number: 'FIR-2026-BGL-044', crime_type: 'Assault / Brawl', jurisdiction: 'Bengaluru City Police', police_station: 'Indiranagar Police Station', landmark: 'Near Indiranagar 12th Main', latitude: 12.9705, longitude: 77.6398, reported_date: '2026-07-19', status: 'Active' },
      { id: '45', case_number: 'FIR-2026-BGL-045', crime_type: 'Traffic Violation', jurisdiction: 'Bengaluru City Police', police_station: 'Whitefield Police Station', landmark: 'Near Varthur Road Junction', latitude: 12.9512, longitude: 77.7421, reported_date: '2026-07-19', status: 'Closed' }
    ];

    for (const c of mockCases) {
      await runQuery(
        `INSERT INTO cases (id, case_number, crime_type, jurisdiction, police_station, landmark, latitude, longitude, reported_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO NOTHING`,
        [c.id, c.case_number, c.crime_type, c.jurisdiction, c.police_station, c.landmark, c.latitude, c.longitude, c.reported_date, c.status]
      );
    }

    console.log(`Seeding complete: ${mockCases.length} GIS cases added.`);
  } catch (err) {
    console.error('Failed to seed cases database:', err);
  }
}

async function seedInvestigationData() {
  try {
    const existing = await getRow<{ count: string | number }>('SELECT count(*) as count FROM investigation_cases');
    if (existing && parseInt(String(existing.count), 10) > 0) {
      return;
    }
    console.log('Seeding initial investigation cases and pipeline dataset...');

    const cases = [
      {
        case_id: 'CASE-2026-KOR-001',
        case_number: 'FIR-2026-KOR-001',
        title: 'Koramangala Commercial Safe Heist',
        crime_type: 'Commercial Burglary & Safe Heist',
        police_station: 'Koramangala Police Station',
        status: 'Active',
        incident_date: '2026-07-20 02:15:00',
        location: 'Commercial Gold Exchange, 80 Feet Road, Koramangala',
        description: 'Nighttime vault break-in at Commercial Gold Exchange. Culprits forced open rear ventilation grill using hydraulic jacks, deployed a 433MHz RF signal jammer to disable silent alarm alerts, and used an oxy-acetylene torch to cut open the inner wall safe. Disables CCTV DVR storage unit.',
        investigating_officer: 'Inspector R. Shankara',
        outcome: null
      },
      {
        case_id: 'CASE-2026-IND-002',
        case_number: 'FIR-2026-IND-002',
        title: 'Indiranagar Luxury Boutique Robbery',
        crime_type: 'Armed Robbery & Jewelry Heist',
        police_station: 'Indiranagar Police Station',
        status: 'Active',
        incident_date: '2026-07-21 21:45:00',
        location: 'Royal Gems Boutique, 100 Feet Road, Indiranagar',
        description: 'Armed robbery at closing time. Masked suspects bypassed rear fire door security sensors, held staff at gunpoint, used RF shielding Faraday bags to block GPS tracking tags on diamond trays, and fled in a black SUV.',
        investigating_officer: 'Sub-Inspector M. Lakshmi',
        outcome: null
      },
      {
        case_id: 'CASE-2026-WHI-003',
        case_number: 'FIR-2026-WHI-003',
        title: 'Whitefield Corporate Ransomware & Wire Fraud',
        crime_type: 'Cyber Crime & Corporate Wire Extortion',
        police_station: 'Whitefield Police Station',
        status: 'Active',
        incident_date: '2026-07-19 14:30:00',
        location: 'Apex Technology Park, Whitefield',
        description: 'Corporate spear-phishing attack compromising finance executive credentials. Attackers initiated fraudulent wire transfers totaling ₹2.4 Crores to mule accounts, deploying crypto ransomware on internal servers to obscure log traces.',
        investigating_officer: 'Inspector K. Ponnappa',
        outcome: null
      },
      {
        case_id: 'CASE-2025-CLOSED-01',
        case_number: 'FIR-2025-JAY-882',
        title: 'Jayanagar Jewelers Vault Break-in',
        crime_type: 'Commercial Burglary & Safe Heist',
        police_station: 'Jayanagar Police Station',
        status: 'Closed',
        incident_date: '2025-11-14 03:00:00',
        location: 'Jayanagar 4th Block Gold Plaza',
        description: 'Nighttime vault break-in using oxy-acetylene torch, hydraulic jacks, RF signal jammer to disable GSM alarm alerts, and removal of CCTV DVR units.',
        investigating_officer: 'Inspector V. Nanjappa',
        outcome: 'Solved after tracing 433MHz RF signal jammer serial number to specialized electronics store in SP Road. Toolmark analysis on safe metal slag matched custom oxy-acetylene nozzle confiscated during raid on gang hideout in Peenya. 3 suspects convicted, 95% stolen jewelry recovered.'
      },
      {
        case_id: 'CASE-2025-CLOSED-02',
        case_number: 'FIR-2025-MAL-412',
        title: 'Malleshwaram Electronics Safe Breach',
        crime_type: 'Commercial Burglary & Safe Heist',
        police_station: 'Malleshwaram Police Station',
        status: 'Closed',
        incident_date: '2025-08-09 01:45:00',
        location: 'Sampige Road Malleshwaram',
        description: 'Safecracking using heavy hydraulic cutters, ventilation shaft entry, partial latent fingerprint on air duct grill, getaway vehicle Mahindra Scorpio.',
        investigating_officer: 'Inspector S. Patil',
        outcome: 'Solved by cross-referencing cell tower dump records at incident window with registered MO safe breakers. Fingerprint from air duct matched suspect Ramesh Kumar (Kala Ramesh). Surveillance team apprehended gang members in Mysore bus station with ₹45 Lakh cash.'
      },
      {
        case_id: 'CASE-2025-CLOSED-03',
        case_number: 'FIR-2025-CUB-109',
        title: 'M.G. Road Watch Showroom Armed Robbery',
        crime_type: 'Armed Robbery & Jewelry Heist',
        police_station: 'Cubbon Park Police Station',
        status: 'Closed',
        incident_date: '2025-05-22 20:15:00',
        location: 'M.G. Road Promenade',
        description: 'Masked armed robbery using RF shielding Faraday bags to block GPS tracking chips, rear fire exit getaway, dark SUV with fake license plates.',
        investigating_officer: 'Inspector B. Suresh',
        outcome: 'Solved by tracing specialized Faraday pouch online purchases and analyzing ANPR (Automatic Number Plate Recognition) cameras along Outer Ring Road, identifying getaway SUV registered under alias. All 4 gang members arrested.'
      },
      {
        case_id: 'CASE-2025-CLOSED-04',
        case_number: 'FIR-2025-WHI-704',
        title: 'Hebbal Tech Park Financial Wire Fraud',
        crime_type: 'Cyber Crime & Corporate Wire Extortion',
        police_station: 'Whitefield Police Station',
        status: 'Closed',
        incident_date: '2025-03-11 11:00:00',
        location: 'Hebbal Tech Ring',
        description: 'Spear-phishing email compromise targeting corporate finance leads, mule account transfers, ransomware log wipe.',
        investigating_officer: 'Inspector K. Ponnappa',
        outcome: 'Solved by freezing beneficiary mule accounts within 2 hours of report and analyzing IP transit logs from cloud VPN endpoints. Cyber Crime Cell apprehended ringleader operating out of cyber cafe in Yelahanka.'
      }
    ];

    for (const c of cases) {
      await runQuery(
        `INSERT INTO investigation_cases (case_id, case_number, title, crime_type, police_station, status, incident_date, location, description, investigating_officer, outcome)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (case_id) DO NOTHING`,
        [c.case_id, c.case_number, c.title, c.crime_type, c.police_station, c.status, c.incident_date, c.location, c.description, c.investigating_officer, c.outcome]
      );
    }

    const logs = [
      { id: 'LOG-KOR-101', case_id: 'CASE-2026-KOR-001', timestamp: '2026-07-20 02:15:00', actor: 'Central Dispatch', log_type: 'LOG', description: 'Silent motion sensor alarm tripped at Commercial Gold Exchange, 80 Feet Road. Patrol Car 14 dispatched.' },
      { id: 'LOG-KOR-102', case_id: 'CASE-2026-KOR-001', timestamp: '2026-07-20 02:22:00', actor: 'Patrol Officer Naik', log_type: 'LOG', description: 'First responders arrived. Front glass intact. Rear ventilation grill breached using hydraulic spreader tools.' },
      { id: 'LOG-KOR-103', case_id: 'CASE-2026-KOR-001', timestamp: '2026-07-20 03:00:00', actor: 'Inspector R. Shankara', log_type: 'LOG', description: 'Crime Scene Investigation team cordoned area. Main safe cut open using oxy-acetylene torch. Local CCTV DVR missing.' },
      { id: 'LOG-KOR-104', case_id: 'CASE-2026-KOR-001', timestamp: '2026-07-20 05:30:00', actor: 'Forensic Expert Dr. Aruna', log_type: 'EVIDENCE_COLLECTED', description: 'Recovered 433MHz active RF signal jammer hidden in air duct near safe room. Torch burn slag collected for metallurgical testing.' },
      { id: 'LOG-KOR-105', case_id: 'CASE-2026-KOR-001', timestamp: '2026-07-20 09:15:00', actor: 'SI Chethan', log_type: 'EVIDENCE_COLLECTED', description: 'Obtained secondary CCTV footage from HDFC ATM across the street showing grey Mahindra Scorpio parked at 01:45 AM.' },
      { id: 'LOG-KOR-106', case_id: 'CASE-2026-KOR-001', timestamp: '2026-07-20 11:30:00', actor: 'Inspector R. Shankara', log_type: 'INTERVIEW_RECORDED', description: 'Recorded witness statement of night watchman Somanna. Reported seeing 3 men in dark overalls loading duffel bags at 02:10 AM.' },
      { id: 'LOG-KOR-107', case_id: 'CASE-2026-KOR-001', timestamp: '2026-07-21 14:00:00', actor: 'Fingerprint Bureau', log_type: 'FORENSIC_ANALYSIS', description: 'Partial thumbprint lifted from ventilation duct frame matched criminal record of Ramesh Kumar alias Kala Ramesh.' }
    ];

    for (const l of logs) {
      await runQuery(
        `INSERT INTO investigation_logs (id, case_id, timestamp, actor, log_type, description)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO NOTHING`,
        [l.id, l.case_id, l.timestamp, l.actor, l.log_type, l.description]
      );
    }

    const evidence = [
      { id: 'EVD-KOR-001', case_id: 'CASE-2026-KOR-001', evidence_type: 'Oxy-Acetylene Torch Slag & Burn Mark Samples', description: 'Metal residue extracted from safe door cut borders', collected_at: '2026-07-20 03:30:00', location_found: 'Main Vault Safe Door', status: 'In Forensic Lab' },
      { id: 'EVD-KOR-002', case_id: 'CASE-2026-KOR-001', evidence_type: '433MHz Active RF Signal Jammer', description: 'Portable multi-channel jammer used to block GSM cellular security alerts', collected_at: '2026-07-20 05:30:00', location_found: 'Air Ventilation Duct', status: 'Secured in Evidence Locker' },
      { id: 'EVD-KOR-003', case_id: 'CASE-2026-KOR-001', evidence_type: 'Partial Latent Fingerprint Lift', description: 'Thumbprint lifted from metallic ventilation grill frame', collected_at: '2026-07-20 04:15:00', location_found: 'Rear Ventilation Shaft', status: 'Matched to Suspect Record' },
      { id: 'EVD-KOR-004', case_id: 'CASE-2026-KOR-001', evidence_type: 'HDFC ATM Exterior CCTV Footage', description: 'Video clip showing grey SUV parked 30m from crime scene between 01:45 AM and 02:12 AM', collected_at: '2026-07-20 09:15:00', location_found: 'HDFC Bank ATM CCTV Server', status: 'Digital Archive' }
    ];

    for (const e of evidence) {
      await runQuery(
        `INSERT INTO investigation_evidence (id, case_id, evidence_type, description, collected_at, location_found, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO NOTHING`,
        [e.id, e.case_id, e.evidence_type, e.description, e.collected_at, e.location_found, e.status]
      );
    }

    const interviews = [
      { id: 'INT-KOR-001', case_id: 'CASE-2026-KOR-001', interviewee_name: 'Somanna (Age 52)', role: 'Witness (Night Watchman)', summary: 'Stated he saw a grey SUV with blurred rear plate idling with parking lights on around 01:50 AM. Observed three men carrying heavy bags into the trunk before driving towards Madiwala at high speed.', interview_date: '2026-07-20 11:30:00' },
      { id: 'INT-KOR-002', case_id: 'CASE-2026-KOR-001', interviewee_name: 'Venkatesh Rao (Age 45)', role: 'Victim (Store Owner)', summary: 'Confirmed theft of 4.2 kg gold bullion and ₹18 Lakhs cash. Stated only 3 senior employees possessed safe combination, but torch cut bypassed keylock.', interview_date: '2026-07-20 10:00:00' }
    ];

    for (const i of interviews) {
      await runQuery(
        `INSERT INTO investigation_interviews (id, case_id, interviewee_name, role, summary, interview_date)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO NOTHING`,
        [i.id, i.case_id, i.interviewee_name, i.role, i.summary, i.interview_date]
      );
    }

    const suspects = [
      { id: 'SUS-KOR-001', case_id: 'CASE-2026-KOR-001', name: 'Ramesh Kumar', alias: 'Kala Ramesh', status: 'Prime Suspect', alibi_status: 'Unverified Alibi', notes: 'Known safe breaker with 4 prior convictions involving oxy-acetylene torching. Partial fingerprint match on ventilation shaft grill.' },
      { id: 'SUS-KOR-002', case_id: 'CASE-2026-KOR-001', name: 'Sunil Kumar', alias: 'Chota Suresh', status: 'Person of Interest', alibi_status: 'Claims in Hosur', notes: 'Electronics specialist known for assembling RF signal jammers. Frequently collaborates with Kala Ramesh.' }
    ];

    for (const s of suspects) {
      await runQuery(
        `INSERT INTO investigation_suspects (id, case_id, name, alias, status, alibi_status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO NOTHING`,
        [s.id, s.case_id, s.name, s.alias, s.status, s.alibi_status, s.notes]
      );
    }

    const locations = [
      { id: 'LOC-KOR-001', case_id: 'CASE-2026-KOR-001', location_name: 'Commercial Gold Exchange Premises', location_type: 'Crime Scene', address: '80 Feet Road, Koramangala 4th Block, Bengaluru' },
      { id: 'LOC-KOR-002', case_id: 'CASE-2026-KOR-001', location_name: 'Koramangala 100ft Junction', location_type: 'Escape Route', address: 'Koramangala 100 Feet Road Signal to Madiwala Underpass' },
      { id: 'LOC-KOR-003', case_id: 'CASE-2026-KOR-001', location_name: 'Peenya Industrial Hideout', location_type: 'Suspect Hideout', address: 'Plot 42, Peenya 2nd Stage Industrial Area' }
    ];

    for (const loc of locations) {
      await runQuery(
        `INSERT INTO investigation_locations (id, case_id, location_name, location_type, address)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (id) DO NOTHING`,
        [loc.id, loc.case_id, loc.location_name, loc.location_type, loc.address]
      );
    }

    console.log('Seeding complete: investigation dataset created successfully.');
  } catch (err) {
    console.error('Failed to seed investigation database:', err);
  }
}

