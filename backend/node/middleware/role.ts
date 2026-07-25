/**
 * @file role.ts
 * @description Fine-grained Role-Based Access Control (RBAC) & Jurisdiction middleware.
 * Attaches user role, officer station, rank, and permissions to requests.
 * Part of the Node.js backend.
 */

import { Response, NextFunction } from 'express';
import { getRow } from '../config/db';
import { AuthenticatedRequest } from './auth';

// Extended request interface that includes role, station, and profile info
export interface RoleAwareRequest extends AuthenticatedRequest {
  userRole?: string;
  userStation?: string | null;
  userRank?: string | null;
  badgeNumber?: string | null;
}

// 6-Role Permission Matrix
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [
    'view_overview',
    'manage_users',
    'manage_roles',
    'view_gis_map',
    'view_network_analysis',
    'view_decision_support',
    'ai_assistant',
    'register_dataset',
    'verify_audit_logs',
    'daily_briefings'
  ],
  supervisors: [
    'view_overview',
    'view_gis_map',
    'view_network_analysis',
    'view_decision_support',
    'ai_assistant',
    'daily_briefings',
    'approve_escalations',
    'all_stations_access'
  ],
  investigators: [
    'view_overview',
    'view_gis_map',
    'view_network_analysis',
    'view_decision_support',
    'ai_assistant',
    'daily_briefings'
  ],
  analysts: [
    'view_overview',
    'view_gis_map',
    'view_network_analysis',
    'ai_assistant',
    'export_link_charts'
  ],
  policymakers: [
    'view_overview',
    'view_gis_map',
    'daily_briefings',
    'macro_statistics'
  ],
  judiciary: [
    'view_overview',
    'view_decision_support'
  ],
  officer: [
    'view_overview',
    'view_gis_map',
    'ai_assistant',
    'daily_briefings'
  ]
};

/**
 * Middleware to fetch and attach the user's role, station, and profile info from PostgreSQL.
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

    const profileRecord = await getRow<{ station: string; rank: string; badge_number: string }>(
      'SELECT station, rank, badge_number FROM officer_profiles WHERE user_id = ?',
      [req.user.id]
    );

    req.userRole = (roleRecord?.role || 'officer').toLowerCase();
    req.userStation = profileRecord?.station || null;
    req.userRank = profileRecord?.rank || null;
    req.badgeNumber = profileRecord?.badge_number || null;

    next();
  } catch (error) {
    console.error('Role middleware error:', error);
    return res.status(500).json({ error: 'Internal server error checking user role' });
  }
};

/**
 * Middleware that restricts access to admin-only routes.
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
 */
export const requireRoles = (allowedRoles: string[]) => {
  return (req: RoleAwareRequest, res: Response, next: NextFunction) => {
    const role = (req.userRole || 'officer').toLowerCase();
    
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

/**
 * Fine-grained permission middleware checking against the ROLE_PERMISSIONS matrix.
 */
export const requirePermission = (permission: string) => {
  return (req: RoleAwareRequest, res: Response, next: NextFunction) => {
    const role = (req.userRole || 'officer').toLowerCase();

    if (role === 'admin') {
      return next();
    }

    const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.officer;
    if (!permissions.includes(permission)) {
      return res.status(403).json({
        error: `Forbidden: Your role (${role.toUpperCase()}) lacks the required permission: '${permission}'`,
      });
    }

    next();
  };
};
