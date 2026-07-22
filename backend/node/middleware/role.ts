/**
 * @file role.ts
 * @description Role-based authorization middleware. Attaches user role to requests and restricts routes by user role.
 * Part of the Node.js backend.
 */

import { Response, NextFunction } from 'express';
import { getRow } from '../config/db';
import { AuthenticatedRequest } from './auth';

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

/**
 * Flexible middleware that restricts access to specified roles.
 * Admins automatically bypass role restriction.
 * Must be used AFTER attachUserRole middleware.
 */
export const requireRoles = (allowedRoles: string[]) => {
  return (req: RoleAwareRequest, res: Response, next: NextFunction) => {
    const role = (req.userRole || 'officer').toLowerCase();
    
    // Admin role has unrestricted access to all endpoints
    if (role === 'admin') {
      return next();
    }
    
    const normalizedAllowed = allowedRoles.map((r) => r.toLowerCase());
    if (!normalizedAllowed.includes(role)) {
      return res.status(403).json({
        error: `Forbidden: Access requires one of the following roles: ${allowedRoles.join(', ')}`,
      });
    }
    
    next();
  };
};

