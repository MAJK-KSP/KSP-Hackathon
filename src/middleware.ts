import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { validateSession, User } from './auth';

// Custom interface to extend Express Request with the validated user
export interface AuthenticatedRequest extends Request {
  user?: Omit<User, 'password_hash' | 'mfa_secret'>;
}

// Rate limiter for authentication-sensitive endpoints (Login, Register, MFA verify)
// Rejects brute-force attacks by limiting IP addresses to 5 requests per 15 minutes
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    status: 429,
    error: 'Too many authentication attempts from this IP, please try again after 15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// General rate limiter for standard API endpoints
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    status: 429,
    error: 'Too many requests from this IP, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware to authenticate sessions via secure HttpOnly cookies
export const authenticateSession = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const sessionId = req.cookies.session_id;

  if (!sessionId) {
    return res.status(401).json({ error: 'Unauthorized: No session token provided' });
  }

  try {
    const user = await validateSession(sessionId);

    if (!user) {
      // Clear invalid cookie
      res.clearCookie('session_id', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
      return res.status(401).json({ error: 'Unauthorized: Session has expired or is invalid' });
    }

    // Attach user information to request object
    req.user = user;
    next();
  } catch (error) {
    console.error('Session authentication error:', error);
    return res.status(500).json({ error: 'Internal server error during authentication' });
  }
};
