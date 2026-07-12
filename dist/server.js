"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
const db_1 = require("./db");
const auth_1 = require("./auth");
const middleware_1 = require("./middleware");
const ai_1 = require("./ai");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Middleware Setup
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
app.use(middleware_1.securityHeaders);
// Apply general rate limiting to API endpoints only
app.use('/api', middleware_1.generalLimiter);
// Serve frontend static files (prioritizing compiled React build)
const publicPath = fs_1.default.existsSync(path_1.default.resolve(__dirname, '../dist/public'))
    ? path_1.default.resolve(__dirname, '../dist/public')
    : fs_1.default.existsSync(path_1.default.resolve(__dirname, 'public'))
        ? path_1.default.resolve(__dirname, 'public')
        : path_1.default.resolve(__dirname, '../src/public');
// Page Routes (with Secure Redirects for React SPA)
app.get(['/', '/dashboard', '/profile', '/security'], async (req, res) => {
    const sessionId = req.cookies.session_id;
    const isRoot = req.path === '/';
    if (sessionId) {
        try {
            const user = await (0, auth_1.validateSession)(sessionId);
            if (user) {
                if (isRoot) {
                    return res.redirect('/dashboard');
                }
                return res.sendFile(path_1.default.join(publicPath, 'index.html'));
            }
        }
        catch (err) {
            console.error('Error during session validation redirect:', err);
        }
    }
    if (!isRoot) {
        return res.redirect('/');
    }
    res.sendFile(path_1.default.join(publicPath, 'index.html'));
});
// Serve other static assets (CSS, JS, SVG)
app.use(express_1.default.static(publicPath));
// Input validation schema for registration/login
const authInputSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    password: auth_1.passwordSchema,
});
// --- API ROUTES ---
// 1. Registration (Disabled for security)
app.post('/api/auth/register', middleware_1.authLimiter, async (req, res) => {
    return res.status(403).json({ error: 'Public registration is disabled on this system.' });
});
// 2. Login
app.post('/api/auth/login', middleware_1.authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        // Fetch user
        const user = await (0, db_1.getRow)('SELECT * FROM users WHERE email = ?', [email]);
        // Mitigate timing attacks: always run verifyPassword even if the user is not found
        // Using a valid-looking dummy bcrypt hash ensures the computation time is consistent (~100ms)
        const dummyHash = '$2b$12$dummysalt.dummysalt.dummysalt.dummysalt.dummysalt.du';
        const hashToVerify = user ? user.password_hash : dummyHash;
        const isValid = await (0, auth_1.verifyPassword)(password, hashToVerify);
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
            await (0, db_1.runQuery)(`INSERT INTO sessions (id, user_id, expires_at, created_at, user_agent)
         VALUES (?, ?, ?, ?, 'mfa_pending')`, [tempMfaToken, user.id, expiresAt, new Date().toISOString()]);
            return res.status(200).json({
                mfa_required: true,
                mfa_token: tempMfaToken,
                email: user.email,
            });
        }
        // Otherwise, create a full session
        const session = await (0, auth_1.createSession)(user.id, req.headers['user-agent'] || null, req.ip || null);
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
    }
    catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Internal server error during login' });
    }
});
// 3. Setup MFA (Requires active session)
app.post('/api/auth/mfa/setup', middleware_1.authenticateSession, async (req, res) => {
    try {
        const user = req.user;
        // Generate TOTP secret
        const { secret, otpauthUrl } = (0, auth_1.generateMfaSecret)(user.email);
        const qrCodeUrl = await (0, auth_1.generateQrCodeDataUrl)(otpauthUrl);
        // Save the secret to temp_mfa_secret. We leave the active mfa_secret and mfa_enabled intact
        // to prevent locking the user out or disabling their active 2FA until they verify the new setup.
        await (0, db_1.runQuery)('UPDATE users SET temp_mfa_secret = ? WHERE id = ?', [secret, user.id]);
        return res.status(200).json({
            secret,
            qrCodeUrl,
        });
    }
    catch (error) {
        console.error('MFA setup error:', error);
        return res.status(500).json({ error: 'Internal server error during MFA setup' });
    }
});
// 4. Verify MFA (Can be during login OR during setup)
app.post('/api/auth/mfa/verify', middleware_1.authLimiter, async (req, res) => {
    try {
        const { code, mfa_token, is_setup } = req.body;
        if (!code) {
            return res.status(400).json({ error: 'MFA verification code is required' });
        }
        let userId;
        if (is_setup) {
            // MFA Setup verification: requires an active session
            const sessionId = req.cookies.session_id;
            if (!sessionId) {
                return res.status(401).json({ error: 'Unauthorized: Session required for MFA setup' });
            }
            const user = await (0, auth_1.validateSession)(sessionId);
            if (!user) {
                return res.status(401).json({ error: 'Unauthorized: Session invalid or expired' });
            }
            userId = user.id;
        }
        else {
            // Login MFA verification: requires the temporary mfa_token
            if (!mfa_token) {
                return res.status(400).json({ error: 'MFA session token is required' });
            }
            const pendingSession = await (0, db_1.getRow)(`SELECT user_id, expires_at FROM sessions WHERE id = ? AND user_agent = 'mfa_pending'`, [mfa_token]);
            if (!pendingSession || new Date(pendingSession.expires_at) < new Date()) {
                return res.status(401).json({ error: 'MFA session expired or invalid. Please log in again.' });
            }
            userId = pendingSession.user_id;
            // Clean up the temporary MFA token
            await (0, auth_1.revokeSession)(mfa_token);
        }
        // Retrieve user's secret
        const userRecord = await (0, db_1.getRow)('SELECT * FROM users WHERE id = ?', [userId]);
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
        const isValid = (0, auth_1.verifyTotpToken)(code, secretToVerify);
        if (!isValid) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }
        // If this was part of setup, promote temp_mfa_secret to mfa_secret and enable MFA permanently
        if (is_setup) {
            await (0, db_1.runQuery)('UPDATE users SET mfa_secret = temp_mfa_secret, temp_mfa_secret = NULL, mfa_enabled = 1 WHERE id = ?', [userId]);
        }
        // Create a new full session for the user
        const session = await (0, auth_1.createSession)(userId, req.headers['user-agent'] || null, req.ip || null);
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
    }
    catch (error) {
        console.error('MFA verification error:', error);
        return res.status(500).json({ error: 'Internal server error during MFA verification' });
    }
});
// 5. Logout
app.post('/api/auth/logout', middleware_1.authenticateSession, async (req, res) => {
    try {
        const sessionId = req.cookies.session_id;
        if (sessionId) {
            await (0, auth_1.revokeSession)(sessionId);
        }
        res.clearCookie('session_id', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
        });
        return res.status(200).json({ success: true, message: 'Logged out successfully' });
    }
    catch (error) {
        console.error('Logout error:', error);
        return res.status(500).json({ error: 'Internal server error during logout' });
    }
});
// 6. Current User Info
app.get('/api/auth/me', middleware_1.authenticateSession, (req, res) => {
    return res.status(200).json({ user: req.user });
});
// 7. Get Officer Profile
app.get('/api/profile', middleware_1.authenticateSession, async (req, res) => {
    try {
        const user = req.user;
        let profile = await (0, db_1.getRow)('SELECT * FROM officer_profiles WHERE user_id = ?', [user.id]);
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
    }
    catch (error) {
        console.error('Error fetching profile:', error);
        return res.status(500).json({ error: 'Internal server error fetching profile' });
    }
});
// 8. Update Officer Profile
app.post('/api/profile', middleware_1.authenticateSession, async (req, res) => {
    try {
        const user = req.user;
        const { badge_number, rank, post, jurisdiction, area, station } = req.body;
        const existing = await (0, db_1.getRow)('SELECT 1 FROM officer_profiles WHERE user_id = ?', [user.id]);
        if (existing) {
            await (0, db_1.runQuery)(`UPDATE officer_profiles 
         SET badge_number = ?, rank = ?, post = ?, jurisdiction = ?, area = ?, station = ? 
         WHERE user_id = ?`, [badge_number || '', rank || '', post || '', jurisdiction || '', area || '', station || '', user.id]);
        }
        else {
            await (0, db_1.runQuery)(`INSERT INTO officer_profiles (user_id, badge_number, rank, post, jurisdiction, area, station) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`, [user.id, badge_number || '', rank || '', post || '', jurisdiction || '', area || '', station || '']);
        }
        return res.status(200).json({ success: true, message: 'Profile updated successfully' });
    }
    catch (error) {
        console.error('Error updating profile:', error);
        return res.status(500).json({ error: 'Internal server error updating profile' });
    }
});
// Mount AI routes (all require authentication)
app.use('/api/ai', middleware_1.authenticateSession, ai_1.aiRouter);
// Initialize DB and start the server
(0, db_1.initDb)().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running securely on http://localhost:${PORT}`);
    });
}).catch((err) => {
    console.error('Failed to initialize database:', err);
});
