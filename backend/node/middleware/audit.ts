import { Request, Response, NextFunction } from 'express';
import { runQuery } from '../config/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from './auth';

/**
 * Middleware to track read/write access to sensitive resources.
 * Records the user, action, resource type, and IP address.
 * 
 * @param resourceType A descriptive label for the module (e.g., 'FIR_MODULE', 'NETWORK_ANALYSIS')
 */
export const auditDataAccess = (resourceType: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Intercept the response to ensure we only log successful actions
    const originalSend = res.send;
    
    const authReq = req as AuthenticatedRequest;
    
    // We determine the action based on the HTTP method or specific path keywords
    let action = 'VIEW';
    if (req.method === 'POST') action = 'CREATE';
    if (req.method === 'PUT' || req.method === 'PATCH') action = 'EDIT';
    if (req.method === 'DELETE') action = 'DELETE';
    if (req.path.includes('export')) action = 'EXPORT';

    res.send = function (body) {
      if (res.statusCode >= 200 && res.statusCode < 300 && authReq.user) {
        const userId = authReq.user.id;
        // Try to extract a specific resource ID from params, body, or query
        const resourceId = req.params.id || req.body.case_id || req.query.case_id || 'N/A';
        const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

        // Asynchronously write to the audit log without blocking the response
        runQuery(
          `INSERT INTO system_audit_logs (id, user_id, action, resource_type, resource_id, ip_address, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), userId, action, resourceType, resourceId, ipAddress, new Date().toISOString()]
        ).catch(err => console.error('[Audit Log Error]', err));
      }
      return originalSend.call(this, body);
    };

    next();
  };
};
