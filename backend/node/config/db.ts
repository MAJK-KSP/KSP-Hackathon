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
      const encodedPwd = encodeURIComponent(pwd);
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

  await seedCases();

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
