/**
 * @file server.ts
 * @description Main application server for the Node.js backend. Sets up Express middleware, API endpoints for authentication/MFA, and routes for React SPA.
 * Part of the Node.js backend.
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { z } from 'zod';
import { initDb, getRow, getAllRows, getAllDatasetRows, runQuery } from './config/db';
import {
  hashPassword,
  verifyPassword,
  generateMfaSecret,
  generateQrCodeDataUrl,
  verifyTotpToken,
  createSession,
  validateSession,
  revokeSession,
  User,
  passwordSchema,
} from './services/auth';
import {
  authLimiter,
  generalLimiter,
  authenticateSession,
  AuthenticatedRequest,
  securityHeaders,
} from './middleware/auth';
import { attachUserRole } from './middleware/role';
import { aiRouter } from './routes/ai';
import { adminRouter } from './routes/admin';

dotenv.config();

// Helper to get the Python backend URL dynamically
export const getPythonUrl = (endpoint: string): string => {
  if (process.env.PYTHON_BACKEND_URL) {
    return process.env.PYTHON_BACKEND_URL.replace(/\/$/, '') + endpoint;
  }
  return `http://127.0.0.1:8000${endpoint}`;
};

const app = express();
const PORT = process.env.X_ZOHO_CATALYST_LISTEN_PORT || process.env.PORT || 3000;

// Middleware Setup
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && 'status' in err && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON request payload' });
  }
  next(err);
});
app.use(cookieParser());
app.use(securityHeaders);

// Apply general rate limiting to API endpoints only
app.use('/api', generalLimiter);

// Serve frontend static files (prioritizing compiled React build)
const publicPath = fs.existsSync(path.resolve(__dirname, '../dist/public'))
  ? path.resolve(__dirname, '../dist/public')
  : fs.existsSync(path.resolve(__dirname, '../../dist/public'))
    ? path.resolve(__dirname, '../../dist/public')
    : fs.existsSync(path.resolve(__dirname, '../../frontend/public'))
      ? path.resolve(__dirname, '../../frontend/public')
      : path.resolve(__dirname, '../src/public');

// Page Routes (with Secure Redirects for React SPA)
app.get(['/', '/dashboard', '/profile', '/security', '/users'], async (req, res) => {
  const sessionId = req.cookies.session_id;
  const isRoot = req.path === '/';
  
  if (sessionId) {
    try {
      const user = await validateSession(sessionId);
      if (user) {
        if (isRoot) {
          return res.redirect('/dashboard');
        }
        return res.sendFile(path.join(publicPath, 'index.html'));
      }
    } catch (err) {
      console.error('Error during session validation redirect:', err);
    }
  }
  
  if (!isRoot) {
    return res.redirect('/');
  }
  
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Serve other static assets (CSS, JS, SVG)
app.use(express.static(publicPath));

// Input validation schema for registration/login
const authInputSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: passwordSchema,
});

// --- API ROUTES ---

// 1. Registration (Disabled for security)
app.post('/api/auth/register', authLimiter, async (req, res) => {
  return res.status(403).json({ error: 'Public registration is disabled on this system.' });
});

// 2. Login
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Fetch user
    const user = await getRow<User>('SELECT * FROM users WHERE email = ?', [email]);
    
    // Mitigate timing attacks: always run verifyPassword even if the user is not found
    // Using a valid-looking dummy bcrypt hash ensures the computation time is consistent (~100ms)
    const dummyHash = '$2b$12$dummysalt.dummysalt.dummysalt.dummysalt.dummysalt.du';
    const hashToVerify = user ? user.password_hash : dummyHash;
    const isValid = await verifyPassword(password, hashToVerify);

    if (!user || !isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // If MFA is enabled, return a temporary token instead of logging in directly
    if (user.mfa_enabled === 1 || user.mfa_enabled === true || Boolean(user.mfa_enabled)) {
      // Create a temporary, short-lived reference to identify this user during MFA verification
      // This prevents exposing the user's ID directly in the response
      const tempMfaToken = crypto.randomUUID();
      
      // We store the temp token in the database or cache. For simplicity, we can use a temporary
      // table or session. Here we will store it as a pending session in the sessions table
      // with a special prefix or short expiry (5 minutes).
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      await runQuery(
        `INSERT INTO sessions (id, user_id, expires_at, created_at, user_agent)
         VALUES (?, ?, ?, ?, 'mfa_pending')`,
        [tempMfaToken, user.id, expiresAt, new Date().toISOString()]
      );

      return res.status(200).json({
        mfa_required: true,
        mfa_token: tempMfaToken,
        email: user.email,
      });
    }

    // Otherwise, create a full session
    const session = await createSession(
      user.id,
      req.headers['user-agent'] || null,
      req.ip || null
    );

    // Set secure cookie
    res.cookie('session_id', session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        mfa_enabled: Boolean(user.mfa_enabled),
        created_at: user.created_at,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error during login' });
  }
});

// 3. Setup MFA (Requires active session)
app.post('/api/auth/mfa/setup', authenticateSession, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    
    // Generate TOTP secret
    const { secret, otpauthUrl } = generateMfaSecret(user.email);
    const qrCodeUrl = await generateQrCodeDataUrl(otpauthUrl);

    // Save the secret to temp_mfa_secret. We leave the active mfa_secret and mfa_enabled intact
    // to prevent locking the user out or disabling their active 2FA until they verify the new setup.
    await runQuery('UPDATE users SET temp_mfa_secret = ? WHERE id = ?', [secret, user.id]);

    return res.status(200).json({
      secret,
      qrCodeUrl,
    });
  } catch (error) {
    console.error('MFA setup error:', error);
    return res.status(500).json({ error: 'Internal server error during MFA setup' });
  }
});

// 4. Verify MFA (Can be during login OR during setup)
app.post('/api/auth/mfa/verify', authLimiter, async (req, res) => {
  try {
    const { code, mfa_token, is_setup } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'MFA verification code is required' });
    }

    let userId: string;

    if (is_setup) {
      // MFA Setup verification: requires an active session
      const sessionId = req.cookies.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: 'Unauthorized: Session required for MFA setup' });
      }
      const user = await validateSession(sessionId);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized: Session invalid or expired' });
      }
      userId = user.id;
    } else {
      // Login MFA verification: requires the temporary mfa_token
      if (!mfa_token) {
        return res.status(400).json({ error: 'MFA session token is required' });
      }
      
      const pendingSession = await getRow<{ user_id: string; expires_at: string }>(
        `SELECT user_id, expires_at FROM sessions WHERE id = ? AND user_agent = 'mfa_pending'`,
        [mfa_token]
      );

      if (!pendingSession || new Date(pendingSession.expires_at) < new Date()) {
        return res.status(401).json({ error: 'MFA session expired or invalid. Please log in again.' });
      }

      userId = pendingSession.user_id;
      
      // Clean up the temporary MFA token
      await revokeSession(mfa_token);
    }

    // Retrieve user's secret
    const userRecord = await getRow<User>('SELECT * FROM users WHERE id = ?', [userId]);
    if (!userRecord) {
      return res.status(400).json({ error: 'User not found' });
    }

    const secretToVerify = is_setup ? userRecord.temp_mfa_secret : userRecord.mfa_secret;
    if (!secretToVerify) {
      return res.status(400).json({
        error: is_setup
          ? 'MFA setup has not been initiated. Please generate a QR code first.'
          : 'MFA has not been set up for this account'
      });
    }

    // Verify code
    const isValid = verifyTotpToken(code, secretToVerify);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // If this was part of setup, promote temp_mfa_secret to mfa_secret and enable MFA permanently
    if (is_setup) {
      await runQuery(
        'UPDATE users SET mfa_secret = temp_mfa_secret, temp_mfa_secret = NULL, mfa_enabled = TRUE WHERE id = ?',
        [userId]
      );
    }

    // Create a new full session for the user
    const session = await createSession(
      userId,
      req.headers['user-agent'] || null,
      req.ip || null
    );

    // Set cookie
    res.cookie('session_id', session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      user: {
        id: userRecord.id,
        email: userRecord.email,
        mfa_enabled: true,
        created_at: userRecord.created_at,
      },
    });
  } catch (error) {
    console.error('MFA verification error:', error);
    return res.status(500).json({ error: 'Internal server error during MFA verification' });
  }
});

// 5. Logout
app.post('/api/auth/logout', authenticateSession, async (req: AuthenticatedRequest, res) => {
  try {
    const sessionId = req.cookies.session_id;
    if (sessionId) {
      await revokeSession(sessionId);
    }

    res.clearCookie('session_id', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ error: 'Internal server error during logout' });
  }
});

// 6. Current User Info
app.get('/api/auth/me', authenticateSession, (req: AuthenticatedRequest, res) => {
  return res.status(200).json({ user: req.user });
});

// 7. Get Officer Profile
app.get('/api/profile', authenticateSession, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    let profile = await getRow<any>(
      'SELECT * FROM officer_profiles WHERE user_id = ?',
      [user.id]
    );
    
    if (!profile) {
      profile = {
        user_id: user.id,
        badge_number: '',
        rank: '',
        post: '',
        jurisdiction: '',
        area: '',
        station: '',
      };
    }
    
    return res.status(200).json({ success: true, profile });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return res.status(500).json({ error: 'Internal server error fetching profile' });
  }
});

// 8. Update Officer Profile
app.post('/api/profile', authenticateSession, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { badge_number, rank, post, jurisdiction, area, station } = req.body;

    const existing = await getRow('SELECT 1 FROM officer_profiles WHERE user_id = ?', [user.id]);
    if (existing) {
      await runQuery(
        `UPDATE officer_profiles 
         SET badge_number = ?, rank = ?, post = ?, jurisdiction = ?, area = ?, station = ? 
         WHERE user_id = ?`,
        [badge_number || '', rank || '', post || '', jurisdiction || '', area || '', station || '', user.id]
      );
    } else {
      await runQuery(
        `INSERT INTO officer_profiles (user_id, badge_number, rank, post, jurisdiction, area, station) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [user.id, badge_number || '', rank || '', post || '', jurisdiction || '', area || '', station || '']
      );
    }

    return res.status(200).json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating profile:', error);
    return res.status(500).json({ error: 'Internal server error updating profile' });
  }
});

// 9. AI Daily Operational Brief (Proxy to Python Backend)
app.get('/api/daily-brief', authenticateSession, async (req: AuthenticatedRequest, res) => {
  try {
    const pythonBackendUrl = getPythonUrl('/daily-brief');
    const response = await fetch(pythonBackendUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        errorJson = null;
      }
      return res.status(response.status).json({ 
        error: errorJson?.detail || errorJson?.error || errorText || 'Failed to fetch daily brief from backend' 
      });
    }
    
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error: any) {
    console.error('Error fetching daily brief:', error);
    if (error.code === 'ECONNREFUSED' || error.message?.includes('fetch failed')) {
      return res.status(503).json({
        error: 'Intelligence backend service is offline. Please ensure the FastAPI server is running.'
      });
    }
    return res.status(500).json({ error: 'Internal server error fetching daily brief' });
  }
});

// Network Analysis (Proxy to Python Backend)
app.get('/api/network/analyze', authenticateSession, async (req: AuthenticatedRequest, res) => {
  try {
    const pythonBackendUrl = getPythonUrl('/api/network/analyze');
    const response = await fetch(pythonBackendUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        errorJson = null;
      }
      return res.status(response.status).json({ 
        error: errorJson?.detail || errorJson?.error || errorText || 'Failed to fetch network analysis from backend' 
      });
    }
    
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error: any) {
    console.error('Error fetching network analysis:', error);
    if (error.code === 'ECONNREFUSED' || error.message?.includes('fetch failed')) {
      return res.status(503).json({
        error: 'Intelligence backend service is offline.'
      });
    }
    return res.status(500).json({ error: 'Internal server error fetching network analysis' });
  }
});

// 10. System Status Diagnostics
app.get('/api/system/status', authenticateSession, async (req: AuthenticatedRequest, res) => {
  try {
    // 1. Verify PostgreSQL cloud connection by running a basic query (reported as sqlite_db to avoid breaking frontend status display)
    let sqliteConnected = false;
    try {
      await getRow('SELECT 1;');
      sqliteConnected = true;
    } catch (err) {
      console.error('PostgreSQL connection diagnostic failure:', err);
    }

    // 2. Query FastAPI backend status
    let fastapiConnected = false;
    let supabaseDb = { connected: false, error: 'FastAPI backend is offline' };
    let quickml = { connected: false, error: 'FastAPI backend is offline', model: 'unknown' };

    try {
      const pythonStatusUrl = getPythonUrl('/status');
      const response = await fetch(pythonStatusUrl);
      if (response.ok) {
        const data = await response.json();
        fastapiConnected = true;
        supabaseDb = data.supabase_db || supabaseDb;
        quickml = data.quickml || quickml;
      } else {
        const errorText = await response.text();
        supabaseDb.error = `FastAPI returned HTTP ${response.status}: ${errorText}`;
        quickml.error = `FastAPI returned HTTP ${response.status}: ${errorText}`;
      }
    } catch (err: any) {
      console.error('FastAPI health check query failed:', err);
      supabaseDb.error = err.message || 'Connection refused';
      quickml.error = err.message || 'Connection refused';
    }

    return res.status(200).json({
      sqlite_db: {
        connected: sqliteConnected
      },
      fastapi_backend: {
        connected: fastapiConnected,
        supabase_db: supabaseDb,
        quickml: quickml
      }
    });
  } catch (error: any) {
    console.error('Error fetching system status:', error);
    return res.status(500).json({ error: 'Internal server error running diagnostics' });
  }
});

// Station coordinates for spatial jittering of cases/incidents
const stationCoordinates: Record<string, [number, number]> = {
  'Koramangala Police Station': [12.9352, 77.6244],
  'Indiranagar Police Station': [12.9719, 77.6412],
  'Whitefield Police Station': [12.9698, 77.7499],
  'Jayanagar Police Station': [12.9250, 77.5897],
  'Ulsoor Police Station': [12.9817, 77.6286],
  'Malleshwaram Police Station': [13.0031, 77.5696],
  'Cubbon Park Police Station': [12.9779, 77.5952],
};

const getJitteredCoords = (stationName: string) => {
  let baseCoords = [12.9716, 77.5946]; // Default: Bengaluru center
  if (stationName) {
    const matched = Object.entries(stationCoordinates).find(([key]) =>
      stationName.toLowerCase().includes(key.toLowerCase().split(' ')[0])
    );
    if (matched) {
      baseCoords = matched[1];
    }
  }
  // Add jitter: ~100 to 400 meters offset
  const jitterLat = (Math.random() - 0.5) * 0.007;
  const jitterLng = (Math.random() - 0.5) * 0.007;
  return {
    latitude: baseCoords[0] + jitterLat,
    longitude: baseCoords[1] + jitterLng,
  };
};

// GET /api/cases - Fetch cases for GIS Command Map (Dataset Supabase DB used by LLM, fallback to local cases)
app.get('/api/cases', authenticateSession, async (req: AuthenticatedRequest, res) => {
  try {
    console.log('Attempting to fetch cases from Dataset Supabase DB...');
    
    // 1. Fetch casemaster (Historical Database)
    let remoteCasemaster: any[] = [];
    try {
      const rows = await getAllDatasetRows(`
        SELECT 
          c.casemasterid, 
          c.crimeno, 
          c.caseno, 
          c.latitude, 
          c.longitude, 
          c.landmark, 
          c.brieffacts, 
          c.crimeregistereddate, 
          ch.crimegroupname as crime_type,
          u.unitname as police_station,
          cs.casestatusname as status
        FROM public.casemaster c
        LEFT JOIN public.crimehead ch ON c.crimemajorheadid = ch.crimeheadid
        LEFT JOIN public.unit u ON c.policestationid = u.unitid
        LEFT JOIN public.casestatusmaster cs ON c.casestatusid = cs.casestatusid
        WHERE c.latitude IS NOT NULL AND c.longitude IS NOT NULL
        LIMIT 300
      `);
      remoteCasemaster = rows.map((r: any) => ({
        id: `casemaster_${r.casemasterid}`,
        case_number: r.crimeno || r.caseno || `FIR-REM-${r.casemasterid}`,
        crime_type: r.crime_type || 'Uncategorized',
        jurisdiction: 'Bengaluru City Police',
        police_station: r.police_station || 'Unknown Station',
        landmark: r.landmark || 'Resolved Location',
        latitude: parseFloat(r.latitude),
        longitude: parseFloat(r.longitude),
        reported_date: r.crimeregistereddate ? new Date(r.crimeregistereddate).toISOString().split('T')[0] : '2026-07-01',
        status: r.status || 'Active',
        dataset: 'casemaster',
        details: r.brieffacts || ''
      }));
    } catch (err: any) {
      console.error('Failed to fetch casemaster rows:', err.message || err);
    }

    // 2. Fetch active_cases (Ongoing briefing cases)
    let activeCasesList: any[] = [];
    try {
      const rows = await getAllDatasetRows(`
        SELECT station_name, briefing_date, cr_number, fir_number, type, accused, status, next_hearing, priority, remarks 
        FROM public.active_cases 
        LIMIT 100
      `);
      activeCasesList = rows.map((r: any, idx: number) => {
        const { latitude, longitude } = getJitteredCoords(r.station_name);
        return {
          id: `active_${r.fir_number || idx}`,
          case_number: r.fir_number || r.cr_number || `ACT-${idx}`,
          crime_type: r.type || 'Active Case',
          jurisdiction: 'Bengaluru City Police',
          police_station: r.station_name || 'Koramangala Police Station',
          landmark: r.remarks || 'Briefing Record',
          latitude,
          longitude,
          reported_date: r.briefing_date ? new Date(r.briefing_date).toISOString().split('T')[0] : '2026-07-11',
          status: r.status || 'Active',
          dataset: 'active_cases',
          details: `Cr Number: ${r.cr_number || 'N/A'}\nAccused: ${r.accused || 'Unknown'}\nPriority: ${r.priority || 'Normal'}\nNext Hearing: ${r.next_hearing || 'N/A'}\nRemarks: ${r.remarks || ''}`
        };
      });
    } catch (err: any) {
      console.error('Failed to fetch active_cases rows:', err.message || err);
    }

    // 3. Fetch overnight_incidents (Recent 24h incidents)
    let overnightIncidentsList: any[] = [];
    try {
      const rows = await getAllDatasetRows(`
        SELECT station_name, briefing_date, fir_number, time, type, location, description, severity, status, investigating_officer 
        FROM public.overnight_incidents 
        LIMIT 100
      `);
      overnightIncidentsList = rows.map((r: any, idx: number) => {
        const { latitude, longitude } = getJitteredCoords(r.station_name);
        return {
          id: `overnight_${r.fir_number || idx}`,
          case_number: r.fir_number || `OVR-${idx}`,
          crime_type: r.type || 'Overnight Incident',
          jurisdiction: 'Bengaluru City Police',
          police_station: r.station_name || 'Koramangala Police Station',
          landmark: r.location || 'Incident Location',
          latitude,
          longitude,
          reported_date: r.briefing_date ? new Date(r.briefing_date).toISOString().split('T')[0] : '2026-07-11',
          status: r.status || 'Active',
          dataset: 'overnight_incidents',
          details: `Time: ${r.time || 'N/A'}\nSeverity: ${r.severity || 'Normal'}\nOfficer: ${r.investigating_officer || 'Unknown'}\nDescription: ${r.description || ''}`
        };
      });
    } catch (err: any) {
      console.error('Failed to fetch overnight_incidents rows:', err.message || err);
    }

    // 4. Fetch repeat_offenders
    let repeatOffendersList: any[] = [];
    try {
      const rows = await getAllDatasetRows(`
        SELECT station_name, briefing_date, name, alias, age, address, risk_level, total_cases, last_seen, remarks 
        FROM public.repeat_offenders 
        LIMIT 100
      `);
      repeatOffendersList = rows.map((r: any, idx: number) => {
        const { latitude, longitude } = getJitteredCoords(r.station_name);
        return {
          id: `offender_${r.name || idx}`,
          case_number: r.name || `Offender-${idx}`,
          crime_type: 'Repeat Offender',
          jurisdiction: 'Bengaluru City Police',
          police_station: r.station_name || 'Koramangala Police Station',
          landmark: r.address || 'Last Known Address',
          latitude,
          longitude,
          reported_date: r.briefing_date ? new Date(r.briefing_date).toISOString().split('T')[0] : '2026-07-11',
          status: r.risk_level || 'High Risk',
          dataset: 'repeat_offenders',
          details: `Alias: ${r.alias || 'N/A'}\nAge: ${r.age || 'N/A'}\nTotal Cases: ${r.total_cases || '0'}\nLast Seen: ${r.last_seen || 'N/A'}\nRemarks: ${r.remarks || ''}`
        };
      });
    } catch (err: any) {
      console.error('Failed to fetch repeat_offenders rows:', err.message || err);
    }

    const allRemoteCases = [
      ...remoteCasemaster,
      ...activeCasesList,
      ...overnightIncidentsList,
      ...repeatOffendersList
    ];

    if (allRemoteCases.length > 0) {
      return res.status(200).json({
        success: true,
        source: 'remote',
        cases: allRemoteCases
      });
    }

    // Fallback to cases table if remote is empty
    const localCases = await getAllRows('SELECT * FROM cases');
    const mappedLocal = localCases.map((c: any) => ({
      ...c,
      dataset: 'cases',
      details: c.landmark || ''
    }));

    return res.status(200).json({
      success: true,
      source: 'local_fallback',
      cases: mappedLocal
    });
  } catch (err: any) {
    console.error('Failed to fetch cases for GIS map:', err);
    return res.status(500).json({ error: 'Internal server error fetching cases' });
  }
});

// Mount AI routes (all require authentication)
app.use('/api/ai', authenticateSession, aiRouter);

// Mount Admin RBAC & User Management routes
app.use('/api/admin', authenticateSession, attachUserRole, adminRouter);

// Serve static client assets from dist/public (built Vite output)
const publicDir = path.join(process.cwd(), 'dist/public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// SPA Wildcard Fallback Route: All non-API GET requests serve index.html for React Router (/chat, /map, /users, etc.)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return res.status(404).send(`Cannot GET ${req.path}`);
});

// Initialize DB and start the server
initDb().catch((err) => {
  console.error('Failed to initialize database:', err);
});

app.listen(PORT, () => {
  console.log(`Server running securely on http://localhost:${PORT}`);
});

export default app;
