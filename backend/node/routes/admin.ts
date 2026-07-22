/**
 * @file admin.ts
 * @description Admin user management & Role-Based Access Control (RBAC) router.
 * Allows administrators to create users, set passwords, assign roles, and log cryptographic audit trails.
 * Part of the Node.js backend.
 */

import { Router, Response } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getRow, getAllRows, runQuery } from '../config/db';
import { hashPassword, passwordSchema } from '../services/auth';
import { RoleAwareRequest, requireAdmin } from '../middleware/role';

export const adminRouter = Router();

// Allowed RBAC roles per requirements
export const ALLOWED_ROLES = [
  'investigators',
  'analysts',
  'supervisors',
  'policymakers',
  'admin',
  'officer'
] as const;

export type AllowedRole = typeof ALLOWED_ROLES[number];

/**
 * Helper to record a cryptographic audit log for RBAC actions.
 */
const logRbacAuditTrail = async (
  performedByUserId: string,
  action: string,
  targetUserId: string,
  targetEmail: string,
  assignedRole: string
) => {
  try {
    const timestamp = new Date().toISOString();
    const auditId = uuidv4();
    const hmacSecret = process.env.HMAC_SECRET || 'ksp-secure-rbac-audit-secret-2026';

    // Create cryptographic signature for non-repudiation
    const messageToSign = `${performedByUserId}:${action}:${targetUserId}:${targetEmail}:${assignedRole}:${timestamp}`;
    const signature = crypto.createHmac('sha256', hmacSecret).update(messageToSign).digest('hex');

    await runQuery(
      `INSERT INTO rbac_audit_logs (id, performed_by, action, target_user_id, target_email, assigned_role, created_at, cryptographic_signature)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [auditId, performedByUserId, action, targetUserId, targetEmail, assignedRole, timestamp, signature]
    );
  } catch (err) {
    console.error('Failed to write RBAC audit log:', err);
  }
};

/**
 * GET /api/admin/users
 * List all users with their assigned roles and profiles (Admin only).
 */
adminRouter.get('/users', requireAdmin, async (req: RoleAwareRequest, res: Response) => {
  try {
    const users = await getAllRows<{
      id: string;
      email: string;
      mfa_enabled: boolean | number;
      created_at: string;
      role: string;
      badge_number: string | null;
      rank: string | null;
      station: string | null;
    }>(`
      SELECT 
        u.id, 
        u.email, 
        u.mfa_enabled, 
        u.created_at,
        COALESCE(r.role, 'officer') AS role,
        p.badge_number,
        p.rank,
        p.station
      FROM users u
      LEFT JOIN user_roles r ON u.id = r.user_id
      LEFT JOIN officer_profiles p ON u.id = p.user_id
      ORDER BY u.created_at DESC
    `);

    return res.status(200).json({ success: true, users });
  } catch (error: any) {
    console.error('Error listing users for admin:', error);
    return res.status(500).json({ error: 'Internal server error listing users' });
  }
});

/**
 * POST /api/admin/users
 * Create a new user account with email, password, and assigned RBAC role (Admin only).
 */
adminRouter.post('/users', requireAdmin, async (req: RoleAwareRequest, res: Response) => {
  try {
    const adminUser = req.user!;
    const { email, password, role, badge_number, rank, station } = req.body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password is required' });
    }

    // Validate password policy
    const passCheck = passwordSchema.safeParse(password);
    if (!passCheck.success) {
      const errMsgs = passCheck.error.errors.map(e => e.message).join('. ');
      return res.status(400).json({ error: `Password policy failure: ${errMsgs}` });
    }

    // Validate role
    const assignedRole = (role || 'officer').toLowerCase().trim();
    if (!ALLOWED_ROLES.includes(assignedRole as any)) {
      return res.status(400).json({
        error: `Invalid role. Allowed roles are: ${ALLOWED_ROLES.join(', ')}`
      });
    }

    // Check if email already exists
    const existing = await getRow<{ id: string }>('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existing) {
      return res.status(409).json({ error: 'A user account with this email already exists.' });
    }

    // Hash password with bcrypt
    const passwordHash = await hashPassword(password);
    const userId = uuidv4();
    const now = new Date().toISOString();

    // 1. Create user in users table
    await runQuery(
      `INSERT INTO users (id, email, password_hash, mfa_enabled, created_at)
       VALUES (?, ?, ?, FALSE, ?)`,
      [userId, email.toLowerCase().trim(), passwordHash, now]
    );

    // 2. Assign role in user_roles table
    await runQuery(
      `INSERT INTO user_roles (user_id, role, assigned_at)
       VALUES (?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, assigned_at = EXCLUDED.assigned_at`,
      [userId, assignedRole, now]
    );

    // 3. Create profile in officer_profiles table
    await runQuery(
      `INSERT INTO officer_profiles (user_id, badge_number, rank, post, jurisdiction, area, station)
       VALUES (?, ?, ?, ?, '', '', ?)`,
      [userId, badge_number || '', rank || assignedRole.toUpperCase(), userId, station || 'Headquarters']
    );

    // 4. Log immutable cryptographic audit log for traceability
    await logRbacAuditTrail(
      adminUser.id,
      'CREATE_USER_AND_ASSIGN_ROLE',
      userId,
      email.toLowerCase().trim(),
      assignedRole
    );

    return res.status(201).json({
      success: true,
      message: `User created successfully with role '${assignedRole}'.`,
      user: {
        id: userId,
        email: email.toLowerCase().trim(),
        role: assignedRole,
        created_at: now
      }
    });

  } catch (error: any) {
    console.error('Error creating user by admin:', error);
    return res.status(500).json({ error: `Internal server error creating user: ${error.message}` });
  }
});

/**
 * PUT /api/admin/users/:id/role
 * Update an existing user's assigned RBAC role (Admin only).
 */
adminRouter.put('/users/:id/role', requireAdmin, async (req: RoleAwareRequest, res: Response) => {
  try {
    const adminUser = req.user!;
    const { id } = req.params;
    const { role } = req.body;

    // Validate UUID URL parameter format to prevent injection attacks
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid or malformed user ID in request URL' });
    }

    const assignedRole = (role || '').toLowerCase().trim();
    if (!ALLOWED_ROLES.includes(assignedRole as any)) {
      return res.status(400).json({
        error: `Invalid role. Allowed roles are: ${ALLOWED_ROLES.join(', ')}`
      });
    }

    const targetUser = await getRow<{ id: string; email: string }>('SELECT id, email FROM users WHERE id = ?', [id]);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user account not found.' });
    }

    const now = new Date().toISOString();
    await runQuery(
      `INSERT INTO user_roles (user_id, role, assigned_at)
       VALUES (?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, assigned_at = EXCLUDED.assigned_at`,
      [id, assignedRole, now]
    );

    // Log cryptographic audit log
    await logRbacAuditTrail(
      adminUser.id,
      'UPDATE_USER_ROLE',
      id,
      targetUser.email,
      assignedRole
    );

    return res.status(200).json({
      success: true,
      message: `User role updated to '${assignedRole}'.`,
      role: assignedRole
    });

  } catch (error: any) {
    console.error('Error updating user role:', error);
    return res.status(500).json({ error: 'Internal server error updating user role' });
  }
});

/**
 * GET /api/admin/rbac-audit-logs
 * Fetch immutable cryptographic audit trail for RBAC actions (Admin only).
 */
adminRouter.get('/rbac-audit-logs', requireAdmin, async (req: RoleAwareRequest, res: Response) => {
  try {
    const logs = await getAllRows<{
      id: string;
      performed_by: string;
      performed_by_email?: string;
      action: string;
      target_user_id: string;
      target_email: string;
      assigned_role: string;
      created_at: string;
      cryptographic_signature: string;
    }>(`
      SELECT 
        l.id,
        l.performed_by,
        u.email AS performed_by_email,
        l.action,
        l.target_user_id,
        l.target_email,
        l.assigned_role,
        l.created_at,
        l.cryptographic_signature
      FROM rbac_audit_logs l
      LEFT JOIN users u ON l.performed_by::text = u.id::text
      ORDER BY l.created_at DESC
      LIMIT 100
    `);

    return res.status(200).json({ success: true, logs });
  } catch (error: any) {
    console.error('Error fetching RBAC audit logs:', error);
    return res.status(500).json({ error: 'Internal server error fetching RBAC audit logs' });
  }
});
