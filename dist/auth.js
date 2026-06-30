"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.revokeAllUserSessions = exports.revokeSession = exports.validateSession = exports.createSession = exports.verifyTotpToken = exports.generateQrCodeDataUrl = exports.generateMfaSecret = exports.verifyPassword = exports.hashPassword = exports.passwordSchema = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const otplib_1 = require("otplib");
const qrcode_1 = __importDefault(require("qrcode"));
const uuid_1 = require("uuid");
const zod_1 = require("zod");
const db_1 = require("./db");
// Password Validation Schema using Zod
exports.passwordSchema = zod_1.z
    .string()
    .min(12, 'Password must be at least 12 characters long')
    .max(100, 'Password must not exceed 100 characters')
    .refine((val) => /[A-Z]/.test(val), 'Password must contain at least one uppercase letter')
    .refine((val) => /[a-z]/.test(val), 'Password must contain at least one lowercase letter')
    .refine((val) => /[0-9]/.test(val), 'Password must contain at least one number')
    .refine((val) => /[^A-Za-z0-9]/.test(val), 'Password must contain at least one special character (e.g., !, @, #, $, %)');
// Password Hashing (using bcryptjs with 12 rounds)
const hashPassword = async (password) => {
    const salt = await bcryptjs_1.default.genSalt(12);
    return bcryptjs_1.default.hash(password, salt);
};
exports.hashPassword = hashPassword;
const verifyPassword = async (password, hash) => {
    return bcryptjs_1.default.compare(password, hash);
};
exports.verifyPassword = verifyPassword;
// TOTP MFA Logic
const generateMfaSecret = (email) => {
    const secret = otplib_1.authenticator.generateSecret();
    const otpauthUrl = otplib_1.authenticator.keyuri(email, 'SecureAuthApp', secret);
    return { secret, otpauthUrl };
};
exports.generateMfaSecret = generateMfaSecret;
const generateQrCodeDataUrl = async (otpauthUrl) => {
    return qrcode_1.default.toDataURL(otpauthUrl);
};
exports.generateQrCodeDataUrl = generateQrCodeDataUrl;
const verifyTotpToken = (token, secret) => {
    // Configured with a window of 1 step (30 seconds) drift on either side for user convenience
    otplib_1.authenticator.options = { window: 1 };
    return otplib_1.authenticator.verify({
        token,
        secret,
    });
};
exports.verifyTotpToken = verifyTotpToken;
// Session Management
const createSession = async (userId, userAgent, ipAddress) => {
    const sessionId = (0, uuid_1.v4)();
    const createdAt = new Date().toISOString();
    // Session is valid for 1 day
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await (0, db_1.runQuery)(`INSERT INTO sessions (id, user_id, expires_at, created_at, user_agent, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`, [sessionId, userId, expiresAt, createdAt, userAgent, ipAddress]);
    return {
        id: sessionId,
        user_id: userId,
        expires_at: expiresAt,
        created_at: createdAt,
        user_agent: userAgent,
        ip_address: ipAddress,
    };
};
exports.createSession = createSession;
const validateSession = async (sessionId) => {
    const now = new Date().toISOString();
    // Find session and join with user, ensuring the session has not expired
    const sessionUser = await (0, db_1.getRow)(`SELECT u.id, u.email, u.mfa_enabled, u.created_at, s.expires_at
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.id = ? AND s.expires_at > ?`, [sessionId, now]);
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
exports.validateSession = validateSession;
const revokeSession = async (sessionId) => {
    await (0, db_1.runQuery)('DELETE FROM sessions WHERE id = ?', [sessionId]);
};
exports.revokeSession = revokeSession;
const revokeAllUserSessions = async (userId) => {
    await (0, db_1.runQuery)('DELETE FROM sessions WHERE user_id = ?', [userId]);
};
exports.revokeAllUserSessions = revokeAllUserSessions;
