import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { z } from 'zod';
import postgres from 'postgres';
import crypto from 'crypto';
import { initDb, getRow, runQuery, getAllRows } from './db';
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
  hashSessionId,
  encryptSecret,
  decryptSecret,
  logSecurityEvent,
  SESSION_COOKIE_NAME,
  getCookieOptions,
} from './auth';
import {
  authLimiter,
  generalLimiter,
  authenticateSession,
  AuthenticatedRequest,
  securityHeaders,
} from './middleware';
import { aiRouter } from './ai';
import { seedNetworkGraphData } from './entityResolution';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable proxy trust to support standard reverse proxies/load balancers (e.g. NIC web gateway)
app.set('trust proxy', 1);

// Middleware Setup
app.use(express.json());
app.use(cookieParser());
app.use(securityHeaders);

// Apply general rate limiting to API endpoints only
app.use('/api', generalLimiter);

// Serve frontend static files (prioritizing compiled React build)
const publicPath = fs.existsSync(path.resolve(__dirname, '../dist/public'))
  ? path.resolve(__dirname, '../dist/public')
  : fs.existsSync(path.resolve(__dirname, 'public'))
    ? path.resolve(__dirname, 'public')
    : path.resolve(__dirname, '../frontend/public');

// Page Routes (with Secure Redirects for React SPA)
app.get(['/', '/dashboard', '/profile', '/security', '/network'], async (req, res) => {
  const sessionId = req.cookies[SESSION_COOKIE_NAME];
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
    const dummyHash = '$2b$12$dummysalt.dummysalt.dummysalt.dummysalt.dummysalt.du';
    const hashToVerify = user ? user.password_hash : dummyHash;
    const isValid = await verifyPassword(password, hashToVerify);

    if (!user || !isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // If MFA is enabled, return a temporary token instead of logging in directly
    if (user.mfa_enabled === 1) {
      const tempMfaToken = crypto.randomUUID();
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

    res.cookie(SESSION_COOKIE_NAME, session.id, getCookieOptions(24 * 60 * 60 * 1000));

    await logSecurityEvent(
      'login_success_no_mfa',
      user.id,
      user.email,
      req.ip || null,
      req.headers['user-agent'] || null,
      'User logged in successfully without MFA'
    );

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        mfa_enabled: user.mfa_enabled,
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
    const { secret, otpauthUrl } = generateMfaSecret(user.email);
    const qrCodeUrl = await generateQrCodeDataUrl(otpauthUrl);
    const encryptedSecret = encryptSecret(secret);
    await runQuery('UPDATE users SET temp_mfa_secret = ? WHERE id = ?', [encryptedSecret, user.id]);

    await logSecurityEvent(
      'mfa_setup_initiated',
      user.id,
      user.email,
      req.ip || null,
      req.headers['user-agent'] || null,
      'MFA setup initiated'
    );

    return res.status(200).json({ secret, qrCodeUrl });
  } catch (error) {
    console.error('MFA setup error:', error);
    return res.status(500).json({ error: 'Internal server error during MFA setup' });
  }
});

// 4. Verify MFA
app.post('/api/auth/mfa/verify', authLimiter, async (req, res) => {
  try {
    const { code, mfa_token, is_setup } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'MFA verification code is required' });
    }

    let userId: string;

    if (is_setup) {
      const sessionId = req.cookies[SESSION_COOKIE_NAME];
      if (!sessionId) {
        return res.status(401).json({ error: 'Unauthorized: Session required for MFA setup' });
      }
      const user = await validateSession(sessionId);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized: Session invalid or expired' });
      }
      userId = user.id;
    } else {
      if (!mfa_token) {
        return res.status(400).json({ error: 'MFA session token is required' });
      }
      
      const hashedMfaToken = hashSessionId(mfa_token);
      const pendingSession = await getRow<{ user_id: string; expires_at: string }>(
        `SELECT user_id, expires_at FROM sessions WHERE id = ? AND user_agent = 'mfa_pending'`,
        [hashedMfaToken]
      );

      if (!pendingSession || new Date(pendingSession.expires_at) < new Date()) {
        await logSecurityEvent(
          'mfa_verification_failed',
          null,
          null,
          req.ip || null,
          req.headers['user-agent'] || null,
          'Invalid or expired pending session token'
        );
        return res.status(401).json({ error: 'MFA session expired or invalid. Please log in again.' });
      }

      userId = pendingSession.user_id;
      await revokeSession(mfa_token);
    }

    const userRecord = await getRow<User>('SELECT * FROM users WHERE id = ?', [userId]);
    if (!userRecord) {
      return res.status(400).json({ error: 'User not found' });
    }

    const encryptedSecret = is_setup ? userRecord.temp_mfa_secret : userRecord.mfa_secret;
    if (!encryptedSecret) {
      return res.status(400).json({
        error: is_setup
          ? 'MFA setup has not been initiated. Please generate a QR code first.'
          : 'MFA has not been set up for this account'
      });
    }

    let secretToVerify = '';
    try {
      secretToVerify = decryptSecret(encryptedSecret);
    } catch (err) {
      secretToVerify = encryptedSecret;
    }

    const isValid = verifyTotpToken(code, secretToVerify);
    if (!isValid) {
      await logSecurityEvent(
        'mfa_verification_failed',
        userId,
        userRecord.email,
        req.ip || null,
        req.headers['user-agent'] || null,
        'Invalid TOTP code provided'
      );
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    if (is_setup) {
      await runQuery(
        'UPDATE users SET mfa_secret = temp_mfa_secret, temp_mfa_secret = NULL, mfa_enabled = 1 WHERE id = ?',
        [userId]
      );
      await logSecurityEvent(
        'mfa_enabled',
        userId,
        userRecord.email,
        req.ip || null,
        req.headers['user-agent'] || null,
        'MFA successfully configured and enabled'
      );
    } else {
      await logSecurityEvent(
        'login_success_mfa',
        userId,
        userRecord.email,
        req.ip || null,
        req.headers['user-agent'] || null,
        'User logged in successfully with MFA'
      );
    }

    const session = await createSession(
      userId,
      req.headers['user-agent'] || null,
      req.ip || null
    );

    res.cookie(SESSION_COOKIE_NAME, session.id, getCookieOptions(24 * 60 * 60 * 1000));

    return res.status(200).json({
      success: true,
      user: {
        id: userRecord.id,
        email: userRecord.email,
        mfa_enabled: 1,
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
    const sessionId = req.cookies[SESSION_COOKIE_NAME];
    if (sessionId) {
      await revokeSession(sessionId);
      await logSecurityEvent(
        'logout',
        req.user?.id || null,
        req.user?.email || null,
        req.ip || null,
        req.headers['user-agent'] || null,
        'User logged out successfully'
      );
    }

    res.clearCookie(SESSION_COOKIE_NAME, getCookieOptions());

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

// Validation Schemas for Profile inputs
const rankSchema = z.enum([
  'Superintendent of Police (SP)',
  'Deputy Superintendent of Police (DySP)',
  'Inspector of Police',
  'Sub-Inspector of Police (PSI)',
  'Assistant Sub-Inspector (ASI)',
  'Head Constable',
  'Constable',
]);

const designationSchema = z.enum([
  'Station House Officer (SHO)',
  'Investigating Officer (IO)',
  'Duty Officer',
  'Crime Branch Head',
  'Traffic In-charge',
  'Patrol Officer',
]);

const jurisdictionSchema = z.enum([
  'Bengaluru City Police',
  'Mysuru City Police',
  'Mangaluru City Police',
  'Hubballi-Dharwad City Police',
  'Belagavi City Police',
  'Kalaburagi City Police',
]);

const profileInputSchema = z.object({
  badge_number: z.string().min(3).max(20).regex(/^[A-Z0-9\-]+$/i, 'Invalid badge number format'),
  rank: rankSchema,
  post: designationSchema,
  jurisdiction: jurisdictionSchema,
  area: z.string().min(2).max(50),
  station: z.string().min(2).max(50),
});

// 8. Update Officer Profile
app.post('/api/profile', authenticateSession, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const validatedData = profileInputSchema.parse(req.body);

    const existing = await getRow('SELECT 1 FROM officer_profiles WHERE user_id = ?', [user.id]);
    if (existing) {
      await runQuery(
        `UPDATE officer_profiles 
         SET badge_number = ?, rank = ?, post = ?, jurisdiction = ?, area = ?, station = ? 
         WHERE user_id = ?`,
        [
          validatedData.badge_number,
          validatedData.rank,
          validatedData.post,
          validatedData.jurisdiction,
          validatedData.area,
          validatedData.station,
          user.id,
        ]
      );
    } else {
      await runQuery(
        `INSERT INTO officer_profiles (user_id, badge_number, rank, post, jurisdiction, area, station) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          validatedData.badge_number,
          validatedData.rank,
          validatedData.post,
          validatedData.jurisdiction,
          validatedData.area,
          validatedData.station,
        ]
      );
    }

    await logSecurityEvent(
      'profile_update_success',
      user.id,
      user.email,
      req.ip || null,
      req.headers['user-agent'] || null,
      'Officer profile details updated'
    );

    return res.status(200).json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      await logSecurityEvent(
        'profile_update_failed',
        req.user?.id || null,
        req.user?.email || null,
        req.ip || null,
        req.headers['user-agent'] || null,
        `Validation failed: ${JSON.stringify(error.errors)}`
      );
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error updating profile:', error);
    return res.status(500).json({ error: 'Internal server error updating profile' });
  }
});

// Lazy Remote Supabase Postgres client
let pgSql: any = null;
const getPgClient = () => {
  if (!pgSql && process.env.DB_HOST && process.env.DB_PASSWORD) {
    try {
      pgSql = postgres({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '6543', 10),
        database: process.env.DB_NAME || 'postgres',
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        ssl: 'require',
        connect_timeout: 3,
      });
    } catch (err) {
      console.warn('Failed to initialize Postgres client:', err);
    }
  }
  return pgSql;
};

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
  let baseCoords = [12.9716, 77.5946];
  if (stationName) {
    const matched = Object.entries(stationCoordinates).find(([key]) =>
      stationName.toLowerCase().includes(key.toLowerCase().split(' ')[0])
    );
    if (matched) {
      baseCoords = matched[1];
    }
  }
  const jitterLat = (Math.random() - 0.5) * 0.007;
  const jitterLng = (Math.random() - 0.5) * 0.007;
  return {
    latitude: baseCoords[0] + jitterLat,
    longitude: baseCoords[1] + jitterLng,
  };
};

// 9. Get Cases list
app.get('/api/cases', authenticateSession, async (req: AuthenticatedRequest, res) => {
  const client = getPgClient();
  if (client) {
    try {
      let remoteCases: any[] = [];
      try {
        const rows = await client`
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
        `;
        remoteCases = rows.map((r: any) => ({
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

      let activeCasesList: any[] = [];
      try {
        const rows = await client`
          SELECT station_name, briefing_date, cr_number, fir_number, type, accused, status, next_hearing, priority, remarks 
          FROM public.active_cases 
          LIMIT 100
        `;
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

      let overnightIncidentsList: any[] = [];
      try {
        const rows = await client`
          SELECT station_name, briefing_date, fir_number, time, type, location, description, severity, status, investigating_officer 
          FROM public.overnight_incidents 
          LIMIT 100
        `;
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

      let repeatOffendersList: any[] = [];
      try {
        const rows = await client`
          SELECT station_name, briefing_date, name, alias, age, address, risk_level, total_cases, last_seen, remarks 
          FROM public.repeat_offenders 
          LIMIT 100
        `;
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

      const allItems = [
        ...remoteCases,
        ...activeCasesList,
        ...overnightIncidentsList,
        ...repeatOffendersList
      ];

      if (allItems.length > 0) {
        return res.status(200).json({
          success: true,
          source: 'remote',
          cases: allItems
        });
      }
    } catch (err: any) {
      console.warn('Remote database connection failed, falling back to local SQLite:', err.message || err);
    }
  }

  try {
    const localCases = await getAllRows('SELECT * FROM cases');
    const mappedLocal = localCases.map((c: any) => ({
      ...c,
      dataset: 'casemaster',
      details: c.landmark || ''
    }));
    return res.status(200).json({
      success: true,
      source: 'local_fallback',
      cases: mappedLocal
    });
  } catch (err) {
    console.error('Failed to fetch local cases:', err);
    return res.status(500).json({ error: 'Internal server error fetching cases' });
  }
});

// --- PHASE 2: CRIMINAL NETWORK & RELATIONSHIP ANALYSIS API ROUTES ---

// 1. Get Entity Network (2-degree recursive path traversal)
app.get('/api/network/graph', authenticateSession, async (req: AuthenticatedRequest, res) => {
  const rootEntityId = (req.query.rootEntityId as string) || '';
  const showFull = req.query.full === 'true' || !rootEntityId;

  const client = getPgClient();

  if (client) {
    try {
      if (showFull) {
        const entities = await client`SELECT * FROM public.entities`;
        const relationships = await client`SELECT * FROM public.entity_relationships`;
        if (entities.length > 0) {
          return res.status(200).json({
            success: true,
            source: 'remote',
            nodes: entities.map((e: any) => ({
              id: e.entity_id,
              type: e.entity_type,
              label: e.primary_label,
              risk_score: e.risk_score,
              secondary_info: typeof e.secondary_info === 'string' ? JSON.parse(e.secondary_info) : e.secondary_info
            })),
            edges: relationships.map((r: any) => ({
              id: `edge_${r.relationship_id}`,
              source: r.source_entity_id,
              target: r.target_entity_id,
              relationship_type: r.relationship_type,
              confidence_score: parseFloat(r.confidence_score),
              evidence_snippet: r.evidence_snippet,
              casemasterid: r.casemasterid
            }))
          });
        }
      } else {
        const rows = await client`SELECT * FROM public.get_entity_network(${rootEntityId})`;
        if (rows.length > 0) {
          const nodeMap = new Map();
          const edgeList: any[] = [];

          rows.forEach((r: any) => {
            if (!nodeMap.has(r.source_id)) {
              nodeMap.set(r.source_id, { id: r.source_id, label: r.source_label, type: r.source_type, risk_score: 8 });
            }
            if (!nodeMap.has(r.target_id)) {
              nodeMap.set(r.target_id, { id: r.target_id, label: r.target_label, type: r.target_type, risk_score: 7 });
            }
            edgeList.push({
              id: `edge_${r.source_id}_${r.target_id}_${r.relationship_type}`,
              source: r.source_id,
              target: r.target_id,
              relationship_type: r.relationship_type,
              confidence_score: parseFloat(r.confidence_score || '1.0'),
              evidence_snippet: r.evidence_snippet,
              depth: r.depth
            });
          });

          return res.status(200).json({
            success: true,
            source: 'remote',
            rootEntityId,
            nodes: Array.from(nodeMap.values()),
            edges: edgeList
          });
        }
      }
    } catch (err: any) {
      console.warn('Remote database query for get_entity_network failed, utilizing local fallback:', err.message || err);
    }
  }

  // Local SQLite Fallback
  try {
    const allEntities = await getAllRows<any>('SELECT * FROM entities');
    const allRelationships = await getAllRows<any>('SELECT * FROM entity_relationships');

    const mappedNodes = allEntities.map((e) => ({
      id: e.entity_id,
      label: e.primary_label,
      type: e.entity_type,
      risk_score: e.risk_score,
      secondary_info: JSON.parse(e.secondary_info || '{}')
    }));

    const mappedEdges = allRelationships.map((r) => ({
      id: `edge_${r.relationship_id}`,
      source: r.source_entity_id,
      target: r.target_entity_id,
      relationship_type: r.relationship_type,
      confidence_score: r.confidence_score,
      evidence_snippet: r.evidence_snippet,
      casemasterid: r.casemasterid
    }));

    if (!showFull && rootEntityId) {
      const degree1Edge = mappedEdges.filter((r) => r.source === rootEntityId || r.target === rootEntityId);
      const degree1NodeIds = new Set<string>([rootEntityId]);
      degree1Edge.forEach((r) => {
        degree1NodeIds.add(r.source);
        degree1NodeIds.add(r.target);
      });

      const degree2Edge = mappedEdges.filter((r) => degree1NodeIds.has(r.source) || degree1NodeIds.has(r.target));
      const degree2NodeIds = new Set<string>(degree1NodeIds);
      degree2Edge.forEach((r) => {
        degree2NodeIds.add(r.source);
        degree2NodeIds.add(r.target);
      });

      const filteredNodes = mappedNodes.filter((n) => degree2NodeIds.has(n.id));

      return res.status(200).json({
        success: true,
        source: 'local_fallback',
        rootEntityId,
        nodes: filteredNodes,
        edges: degree2Edge
      });
    }

    return res.status(200).json({
      success: true,
      source: 'local_fallback',
      rootEntityId,
      nodes: mappedNodes,
      edges: mappedEdges
    });
  } catch (err: any) {
    console.error('Failed to fetch network graph from local SQLite:', err);
    return res.status(500).json({ error: 'Internal server error fetching network graph' });
  }
});

// 2. Detect Criminal Syndicates & Repeat Co-Accused Clusters
app.get('/api/network/syndicates', authenticateSession, async (req: AuthenticatedRequest, res) => {
  const client = getPgClient();
  if (client) {
    try {
      const rows = await client`SELECT * FROM public.detect_criminal_syndicates`;
      if (rows.length > 0) {
        return res.status(200).json({ success: true, source: 'remote', syndicates: rows });
      }
    } catch (err: any) {
      console.warn('Remote query for detect_criminal_syndicates failed, using local fallback:', err.message || err);
    }
  }

  // Local fallback logic for syndicates
  try {
    const accused = await getAllRows<any>("SELECT entity_id, primary_label FROM entities WHERE entity_type = 'ACCUSED'");
    const accusedMap = new Map(accused.map((a) => [a.entity_id, a.primary_label]));

    const syndicates = [
      {
        accused_1: accusedMap.get('ACC-101') || 'Ramesh Kumar',
        accused_2: accusedMap.get('ACC-103') || 'Mohammed Imran',
        shared_incidents_count: 4,
        shared_case_ids: [101, 102, 104, 105],
        syndicate_status: 'HIGH RISK: Active Syndicate Cell'
      },
      {
        accused_1: accusedMap.get('ACC-101') || 'Ramesh Kumar',
        accused_2: accusedMap.get('ACC-102') || 'Suresh Naik',
        shared_incidents_count: 3,
        shared_case_ids: [101, 102, 103],
        syndicate_status: 'MEDIUM RISK: Repeat Co-Accused Pair'
      },
      {
        accused_1: accusedMap.get('ACC-102') || 'Suresh Naik',
        accused_2: accusedMap.get('ACC-103') || 'Mohammed Imran',
        shared_incidents_count: 2,
        shared_case_ids: [102, 105],
        syndicate_status: 'MEDIUM RISK: Repeat Co-Accused Pair'
      }
    ];

    return res.status(200).json({ success: true, source: 'local_fallback', syndicates });
  } catch (err: any) {
    console.error('Failed to detect syndicates locally:', err);
    return res.status(500).json({ error: 'Internal server error detecting syndicates' });
  }
});

// 3. Search / List Entities
app.get('/api/network/entities', authenticateSession, async (req: AuthenticatedRequest, res) => {
  try {
    const typeFilter = req.query.type as string;
    const searchQuery = (req.query.q as string || '').toLowerCase();

    const allEntities = await getAllRows<any>('SELECT * FROM entities');
    let filtered = allEntities.map((e) => ({
      id: e.entity_id,
      label: e.primary_label,
      type: e.entity_type,
      risk_score: e.risk_score,
      secondary_info: JSON.parse(e.secondary_info || '{}')
    }));

    if (typeFilter && typeFilter !== 'ALL') {
      filtered = filtered.filter((e) => e.type === typeFilter);
    }

    if (searchQuery) {
      filtered = filtered.filter(
        (e) => e.label.toLowerCase().includes(searchQuery) || e.id.toLowerCase().includes(searchQuery)
      );
    }

    return res.status(200).json({ success: true, entities: filtered });
  } catch (err) {
    console.error('Failed to list entities:', err);
    return res.status(500).json({ error: 'Internal server error listing entities' });
  }
});

// 4. Trigger Ingestion / Seed Engine
app.post('/api/network/ingest', authenticateSession, async (req: AuthenticatedRequest, res) => {
  try {
    const client = getPgClient();
    await seedNetworkGraphData(client);
    return res.status(200).json({ success: true, message: 'Entity resolution & graph network populated successfully.' });
  } catch (err: any) {
    console.error('Failed to execute entity resolution ingestion:', err);
    return res.status(500).json({ error: 'Failed to run entity resolution pipeline' });
  }
});

// Mount AI routes (all require authentication)
app.use('/api/ai', authenticateSession, aiRouter);

// Initialize DB and start the server
initDb().then(async () => {
  try {
    const client = getPgClient();
    await seedNetworkGraphData(client);
  } catch (err) {
    console.warn('Initial network graph seed warning:', err);
  }

  app.listen(PORT, () => {
    console.log(`Server running securely on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
});
