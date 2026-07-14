import { Response, NextFunction } from 'express';
import { getRow } from './db';
import { AuthenticatedRequest } from './middleware';

// Extended request interface that includes the user's role
export interface RoleAwareRequest extends AuthenticatedRequest {
  userRole?: string;
}

/**
 * Middleware to fetch and attach the user's role from user_roles table.
 * Falls back to 'officer' if no role record exists.
 * Must be used AFTER authenticateSession middleware.
 */
export const attachUserRole = async (
  req: RoleAwareRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: No authenticated user' });
    }

    const roleRecord = await getRow<{ role: string }>(
      'SELECT role FROM user_roles WHERE user_id = ?',
      [req.user.id]
    );

    req.userRole = roleRecord?.role || 'officer';
    next();
  } catch (error) {
    console.error('Role middleware error:', error);
    return res.status(500).json({ error: 'Internal server error checking user role' });
  }
};

/**
 * Middleware that restricts access to admin-only routes.
 * Must be used AFTER attachUserRole middleware.
 */
export const requireAdmin = async (
  req: RoleAwareRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden: This action requires administrator privileges',
    });
  }
  next();
};
