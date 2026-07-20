import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

// Ensure the directory exists
const dbDir = path.resolve(__dirname, '..');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'auth.db');
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

<<<<<<< HEAD:src/db.ts
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
=======
  // Create security_logs table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS security_logs (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      user_id TEXT,
      email TEXT,
      ip_address TEXT,
      user_agent TEXT,
      details TEXT,
>>>>>>> 6a370080535596fdbbd6a7d629182b5006792938:backend-node/db.ts
      created_at TEXT NOT NULL
    );
  `);

<<<<<<< HEAD:src/db.ts
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

  // Seed mock cases if the table is empty
  await seedCases();

  console.log('Database initialized successfully using SQLite at:', dbPath);
};

// Seed realistic KSP crime cases into the local SQLite database
const seedCases = async () => {
  try {
    const row = await getRow<{ count: number }>('SELECT COUNT(*) as count FROM cases');
    if (row && row.count > 0) {
      return; // Already seeded
    }

    console.log('Seeding mock KSP crime cases into local SQLite database...');
    
    const mockCases = [
      // Koramangala
      { id: '1', case_number: 'FIR-2026-KOR-001', crime_type: 'Theft / Burglary', jurisdiction: 'Bengaluru City Police', police_station: 'Koramangala Police Station', landmark: 'Near Forum Mall', latitude: 12.9352, longitude: 77.6244, reported_date: '2026-07-01', status: 'Closed' },
      { id: '2', case_number: 'FIR-2026-KOR-002', crime_type: 'Cyber Crime / Fraud', jurisdiction: 'Bengaluru City Police', police_station: 'Koramangala Police Station', landmark: 'Near Wipro Park', latitude: 12.9304, longitude: 77.6212, reported_date: '2026-07-04', status: 'Active' },
      { id: '3', case_number: 'FIR-2026-KOR-003', crime_type: 'Assault / Brawl', jurisdiction: 'Bengaluru City Police', police_station: 'Koramangala Police Station', landmark: 'Near Koramangala Club', latitude: 12.9392, longitude: 77.6289, reported_date: '2026-07-10', status: 'Under Investigation' },
      { id: '4', case_number: 'FIR-2026-KOR-004', crime_type: 'Robbery', jurisdiction: 'Bengaluru City Police', police_station: 'Koramangala Police Station', landmark: 'Near Oasis Mall', latitude: 12.9405, longitude: 77.6234, reported_date: '2026-07-15', status: 'Active' },
      { id: '5', case_number: 'FIR-2026-KOR-005', crime_type: 'Traffic Violation', jurisdiction: 'Bengaluru City Police', police_station: 'Koramangala Police Station', landmark: 'Near Sony World Signal', latitude: 12.9345, longitude: 77.6272, reported_date: '2026-07-18', status: 'Closed' },

      // Indiranagar
      { id: '6', case_number: 'FIR-2026-IND-001', crime_type: 'Assault / Brawl', jurisdiction: 'Bengaluru City Police', police_station: 'Indiranagar Police Station', landmark: 'Near Toit Brewpub', latitude: 12.9719, longitude: 77.6412, reported_date: '2026-07-02', status: 'Closed' },
      { id: '7', case_number: 'FIR-2026-IND-002', crime_type: 'Theft / Burglary', jurisdiction: 'Bengaluru City Police', police_station: 'Indiranagar Police Station', landmark: 'Near Metro Station', latitude: 12.9782, longitude: 77.6385, reported_date: '2026-07-05', status: 'Active' },
      { id: '8', case_number: 'FIR-2026-IND-003', crime_type: 'Public Nuisance', jurisdiction: 'Bengaluru City Police', police_station: 'Indiranagar Police Station', landmark: 'Near ESI Hospital', latitude: 12.9691, longitude: 77.6354, reported_date: '2026-07-11', status: 'Under Investigation' },
      { id: '9', case_number: 'FIR-2026-IND-004', crime_type: 'Cyber Crime / Fraud', jurisdiction: 'Bengaluru City Police', police_station: 'Indiranagar Police Station', landmark: 'Near Defence Colony', latitude: 12.9754, longitude: 77.6441, reported_date: '2026-07-14', status: 'Active' },
      { id: '10', case_number: 'FIR-2026-IND-005', crime_type: 'Vandalism / Property Damage', jurisdiction: 'Bengaluru City Police', police_station: 'Indiranagar Police Station', landmark: 'Near BDA Complex', latitude: 12.9642, longitude: 77.6421, reported_date: '2026-07-17', status: 'Closed' },

      // Whitefield
      { id: '11', case_number: 'FIR-2026-WHI-001', crime_type: 'Traffic Violation', jurisdiction: 'Bengaluru City Police', police_station: 'Whitefield Police Station', landmark: 'Near ITPL Gate 3', latitude: 12.9698, longitude: 77.7499, reported_date: '2026-07-03', status: 'Closed' },
      { id: '12', case_number: 'FIR-2026-WHI-002', crime_type: 'Theft / Burglary', jurisdiction: 'Bengaluru City Police', police_station: 'Whitefield Police Station', landmark: 'Near Phoenix Marketcity', latitude: 12.9912, longitude: 77.6989, reported_date: '2026-07-07', status: 'Active' },
      { id: '13', case_number: 'FIR-2026-WHI-003', crime_type: 'Robbery', jurisdiction: 'Bengaluru City Police', police_station: 'Whitefield Police Station', landmark: 'Near Hope Farm Junction', latitude: 12.9734, longitude: 77.7512, reported_date: '2026-07-09', status: 'Under Investigation' },
      { id: '14', case_number: 'FIR-2026-WHI-004', crime_type: 'Cyber Crime / Fraud', jurisdiction: 'Bengaluru City Police', police_station: 'Whitefield Police Station', landmark: 'Near Sigma Tech Park', latitude: 12.9554, longitude: 77.7471, reported_date: '2026-07-12', status: 'Active' },
      { id: '15', case_number: 'FIR-2026-WHI-005', crime_type: 'Public Nuisance', jurisdiction: 'Bengaluru City Police', police_station: 'Whitefield Police Station', landmark: 'Near Vydehi Hospital', latitude: 12.9721, longitude: 77.7284, reported_date: '2026-07-16', status: 'Closed' },

      // Jayanagar
      { id: '16', case_number: 'FIR-2026-JAY-001', crime_type: 'Theft / Burglary', jurisdiction: 'Bengaluru City Police', police_station: 'Jayanagar Police Station', landmark: 'Near Jayanagar 4th Block Shopping Complex', latitude: 12.9250, longitude: 77.5897, reported_date: '2026-07-02', status: 'Closed' },
      { id: '17', case_number: 'FIR-2026-JAY-002', crime_type: 'Assault / Brawl', jurisdiction: 'Bengaluru City Police', police_station: 'Jayanagar Police Station', landmark: 'Near Shalini Ground', latitude: 12.9298, longitude: 77.5812, reported_date: '2026-07-06', status: 'Active' },
      { id: '18', case_number: 'FIR-2026-JAY-003', crime_type: 'Public Nuisance', jurisdiction: 'Bengaluru City Police', police_station: 'Jayanagar Police Station', landmark: 'Near Madhavan Park', latitude: 12.9324, longitude: 77.5912, reported_date: '2026-07-08', status: 'Closed' },
      { id: '19', case_number: 'FIR-2026-JAY-004', crime_type: 'Vandalism / Property Damage', jurisdiction: 'Bengaluru City Police', police_station: 'Jayanagar Police Station', landmark: 'Near Ashoka Pillar', latitude: 12.9362, longitude: 77.5884, reported_date: '2026-07-13', status: 'Under Investigation' },
      { id: '20', case_number: 'FIR-2026-JAY-005', crime_type: 'Cyber Crime / Fraud', jurisdiction: 'Bengaluru City Police', police_station: 'Jayanagar Police Station', landmark: 'Near National College', latitude: 12.9212, longitude: 77.5784, reported_date: '2026-07-18', status: 'Active' },

      // Ulsoor
      { id: '21', case_number: 'FIR-2026-ULS-001', crime_type: 'Theft / Burglary', jurisdiction: 'Bengaluru City Police', police_station: 'Ulsoor Police Station', landmark: 'Near Ulsoor Lake', latitude: 12.9817, longitude: 77.6286, reported_date: '2026-07-01', status: 'Closed' },
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [c.id, c.case_number, c.crime_type, c.jurisdiction, c.police_station, c.landmark, c.latitude, c.longitude, c.reported_date, c.status]
      );
    }

    console.log(`Seeding complete: ${mockCases.length} cases added.`);
  } catch (err) {
    console.error('Failed to seed cases database:', err);
  }
=======
  // Index on security_logs created_at for faster lookup and log rotation
  await runQuery(`
    CREATE INDEX IF NOT EXISTS idx_security_logs_created_at ON security_logs(created_at);
  `);

  console.log('Database initialized successfully at:', dbPath);
>>>>>>> 6a370080535596fdbbd6a7d629182b5006792938:backend-node/db.ts
};
