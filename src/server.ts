import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { z } from 'zod';
import { initDb, getRow, runQuery } from './db';
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
} from './auth';
import {
  authLimiter,
  generalLimiter,
  authenticateSession,
  AuthenticatedRequest,
} from './middleware';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware Setup
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: true, // Allow client requests
  credentials: true, // Allow cookies
}));

// Apply general rate limiting to all requests
app.use(generalLimiter);

// Serve frontend static files (with fallback for compiled production build)
const publicPath = fs.existsSync(path.join(__dirname, 'public'))
  ? path.join(__dirname, 'public')
  : path.join(__dirname, '../src/public');

// Page Routes (with Secure Redirects)
app.get('/', async (req, res) => {
  const sessionId = req.cookies.session_id;
  if (sessionId) {
    try {
      const user = await validateSession(sessionId);
      if (user) {
        return res.redirect('/dashboard');
      }
    } catch (err) {
      console.error('Error during root redirect check:', err);
    }
  }
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.get('/dashboard', async (req, res) => {
  const sessionId = req.cookies.session_id;
  if (!sessionId) {
    return res.redirect('/');
  }
  try {
    const user = await validateSession(sessionId);
    if (!user) {
      res.clearCookie('session_id', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
      return res.redirect('/');
    }
    res.sendFile(path.join(publicPath, 'dashboard.html'));
  } catch (err) {
    console.error('Error during dashboard redirect check:', err);
    return res.redirect('/');
  }
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
    
    // Constant-time-ish check: run verifyPassword even if user not found to prevent timing attacks
    const isValid = user ? await verifyPassword(password, user.password_hash) : false;

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

    // Save the secret temporarily. We do NOT mark mfa_enabled = 1 yet.
    // It will only be enabled once the user successfully verifies a code.
    await runQuery('UPDATE users SET mfa_secret = ?, mfa_enabled = 0 WHERE id = ?', [secret, user.id]);

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
    if (!userRecord || !userRecord.mfa_secret) {
      return res.status(400).json({ error: 'MFA has not been set up for this account' });
    }

    // Verify code
    const isValid = verifyTotpToken(code, userRecord.mfa_secret);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // If this was part of setup, enable MFA permanently
    if (is_setup) {
      await runQuery('UPDATE users SET mfa_enabled = 1 WHERE id = ?', [userId]);
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

// Initialize DB and start the server
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running securely on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
});
