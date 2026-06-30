import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import qrcode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { runQuery, getRow } from './db';

// Password Validation Schema using Zod
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters long')
  .max(100, 'Password must not exceed 100 characters')
  .refine((val) => /[A-Z]/.test(val), 'Password must contain at least one uppercase letter')
  .refine((val) => /[a-z]/.test(val), 'Password must contain at least one lowercase letter')
  .refine((val) => /[0-9]/.test(val), 'Password must contain at least one number')
  .refine(
    (val) => /[^A-Za-z0-9]/.test(val),
    'Password must contain at least one special character (e.g., !, @, #, $, %)'
  );

// Core Interfaces
export interface User {
  id: string;
  email: string;
  password_hash: string;
  mfa_secret: string | null;
  temp_mfa_secret?: string | null;
  mfa_enabled: number; // 0 or 1
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
  user_agent: string | null;
  ip_address: string | null;
}

// Password Hashing (using bcryptjs with 12 rounds)
export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

// TOTP MFA Logic
export const generateMfaSecret = (email: string) => {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(email, 'SecureAuthApp', secret);
  return { secret, otpauthUrl };
};

export const generateQrCodeDataUrl = async (otpauthUrl: string): Promise<string> => {
  return qrcode.toDataURL(otpauthUrl);
};

export const verifyTotpToken = (token: string, secret: string): boolean => {
  // Configured with a window of 1 step (30 seconds) drift on either side for user convenience
  authenticator.options = { window: 1 };
  return authenticator.verify({
    token,
    secret,
  });
};

// Session Management
export const createSession = async (
  userId: string,
  userAgent: string | null,
  ipAddress: string | null
): Promise<Session> => {
  const sessionId = uuidv4();
  const createdAt = new Date().toISOString();
  
  // Session is valid for 1 day
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await runQuery(
    `INSERT INTO sessions (id, user_id, expires_at, created_at, user_agent, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionId, userId, expiresAt, createdAt, userAgent, ipAddress]
  );

  return {
    id: sessionId,
    user_id: userId,
    expires_at: expiresAt,
    created_at: createdAt,
    user_agent: userAgent,
    ip_address: ipAddress,
  };
};

export const validateSession = async (sessionId: string): Promise<User | null> => {
  const now = new Date().toISOString();
  
  // Find session and join with user, ensuring the session has not expired and is not a pending MFA session
  const sessionUser = await getRow<{
    id: string;
    email: string;
    mfa_enabled: number;
    created_at: string;
    expires_at: string;
  }>(
    `SELECT u.id, u.email, u.mfa_enabled, u.created_at, s.expires_at
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.id = ? 
       AND s.expires_at > ? 
       AND (s.user_agent IS NULL OR s.user_agent != 'mfa_pending')`,
    [sessionId, now]
  );

  if (!sessionUser) {
    return null;
  }

  // Return the user data (excluding password hash and MFA secret for safety)
  return {
    id: sessionUser.id,
    email: sessionUser.email,
    password_hash: '',
    mfa_secret: null,
    mfa_enabled: sessionUser.mfa_enabled,
    created_at: sessionUser.created_at,
  };
};

export const revokeSession = async (sessionId: string): Promise<void> => {
  await runQuery('DELETE FROM sessions WHERE id = ?', [sessionId]);
};

export const revokeAllUserSessions = async (userId: string): Promise<void> => {
  await runQuery('DELETE FROM sessions WHERE user_id = ?', [userId]);
};
