import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { z } from 'zod';
import crypto from 'crypto';
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
  hashSessionId,
  encryptSecret,
  decryptSecret,
  logSecurityEvent,
} from './auth';
import {
  authLimiter,
  generalLimiter,
  authenticateSession,
  AuthenticatedRequest,
  securityHeaders,
} from './middleware';

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
    : path.resolve(__dirname, '../src/public');

// Page Routes (with Secure Redirects for React SPA)
app.get(['/', '/dashboard', '/profile', '/security'], async (req, res) => {
  const sessionId = req.cookies['__Host-session_id'];
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

    // Set secure cookie using the Host-prefixed cookie and strict parameters
    res.cookie('__Host-session_id', session.id, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

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
    
    // Generate TOTP secret
    const { secret, otpauthUrl } = generateMfaSecret(user.email);
    const qrCodeUrl = await generateQrCodeDataUrl(otpauthUrl);

    // Encrypt TOTP secret before saving to the database
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
      const sessionId = req.cookies['__Host-session_id'];
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
      
      // Clean up the temporary MFA token
      await revokeSession(mfa_token);
    }

    // Retrieve user's secret
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

    // Decrypt the secret to verify the TOTP token (fallback to plaintext for legacy compatibility)
    let secretToVerify = '';
    try {
      secretToVerify = decryptSecret(encryptedSecret);
    } catch (err) {
      secretToVerify = encryptedSecret;
    }

    // Verify code
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

    // If this was part of setup, promote temp_mfa_secret to mfa_secret and enable MFA permanently
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

    // Create a new full session for the user
    const session = await createSession(
      userId,
      req.headers['user-agent'] || null,
      req.ip || null
    );

    // Set cookie
    res.cookie('__Host-session_id', session.id, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
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
    const sessionId = req.cookies['__Host-session_id'];
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

    res.clearCookie('__Host-session_id', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
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

// 8. Update Officer Profile (Validated)
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

// Initialize DB and start the server
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running securely on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
});
