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
import { initDb, getRow, runQuery } from './config/db';
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
import { aiRouter } from './routes/ai';

dotenv.config();

// Helper to get the Python backend URL dynamically (uses Vercel rewrites in production)
export const getPythonUrl = (endpoint: string): string => {
  if (process.env.PYTHON_BACKEND_URL) {
    return process.env.PYTHON_BACKEND_URL.replace(/\/$/, '') + endpoint;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/internal-python${endpoint}`;
  }
  return `http://127.0.0.1:8000${endpoint}`;
};

const app = express();
const PORT = process.env.X_ZOHO_CATALYST_LISTEN_PORT || process.env.PORT || 3000;

// Middleware Setup
app.use(express.json());
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
app.get(['/', '/dashboard', '/profile', '/security'], async (req, res) => {
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
    if (user.mfa_enabled === 1) {
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
        'UPDATE users SET mfa_secret = temp_mfa_secret, temp_mfa_secret = NULL, mfa_enabled = 1 WHERE id = ?',
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

// Mount AI routes (all require authentication)
app.use('/api/ai', authenticateSession, aiRouter);

// Initialize DB and start the server
initDb().catch((err) => {
  console.error('Failed to initialize database:', err);
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running securely on http://localhost:${PORT}`);
  });
}

export default app;
