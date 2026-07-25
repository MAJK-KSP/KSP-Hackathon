/**
 * @file decision_support.ts
 * @description Express API router for Feature 6: Active Case Intelligence.
 * Proxies requests to Python FastAPI backend or executes direct database operations.
 */

import { Router, Response } from 'express';
import { RoleAwareRequest, attachUserRole } from '../middleware/role';
import { getRow, getAllRows } from '../config/db';
import { auditDataAccess } from '../middleware/audit';

export const decisionSupportRouter = Router();

const getPythonUrl = (endpoint: string): string => {
  if (process.env.PYTHON_BACKEND_URL) {
    return process.env.PYTHON_BACKEND_URL.replace(/\/$/, '') + endpoint;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/internal-python${endpoint}`;
  }
  return `http://127.0.0.1:8000${endpoint}`;
};

decisionSupportRouter.use(attachUserRole);
decisionSupportRouter.use(auditDataAccess('DECISION_SUPPORT'));

/**
 * GET /api/decision-support/active-cases
 * Fetch list of all active cases directly from database
 */
decisionSupportRouter.get('/active-cases', async (req: RoleAwareRequest, res: Response) => {
  try {
    const pythonUrl = getPythonUrl('/decision-support/active-cases');
    try {
      const pyResp = await fetch(pythonUrl);
      if (pyResp.ok) {
        const data = await pyResp.json();
        return res.status(200).json(data);
      }
    } catch (err) {
      console.warn('[Node Proxy] Python backend unreachable for /active-cases, executing local database query');
    }

    let query = `SELECT 
        c.case_id,
        c.case_number,
        c.title,
        c.crime_type,
        c.police_station,
        c.status,
        c.incident_date::text AS incident_date,
        c.location,
        c.description,
        c.investigating_officer
       FROM investigation_cases c
       ORDER BY c.incident_date DESC NULLS LAST LIMIT 10000`;

    const cases = await getAllRows(query, []);

    return res.status(200).json({ success: true, cases });
  } catch (error: any) {
    console.error('Error fetching active cases:', error);
    return res.status(500).json({ error: `Internal server error: ${error.message}` });
  }
});

/**
 * GET /api/decision-support/case-details/:caseId
 * Fetch full case info, summary, accused, complainants, victims, and timeline
 */
decisionSupportRouter.get('/case-details/:caseId', async (req: RoleAwareRequest, res: Response) => {
  try {
    const caseId = req.params.caseId;
    if (!caseId) {
      return res.status(400).json({ error: 'caseId parameter is required' });
    }

    const pythonUrl = getPythonUrl(`/decision-support/case-details/${encodeURIComponent(caseId)}`);
    try {
      const pyResp = await fetch(pythonUrl);
      if (pyResp.ok) {
        const data = await pyResp.json();
        return res.status(200).json(data);
      }
    } catch (err) {
      console.warn('[Node Proxy] Python backend unreachable for /case-details, executing local database query');
    }

    let case_info;
    case_info = await getRow<any>(
      `SELECT 
        c.case_id,
        c.case_number,
        c.title,
        c.crime_type,
        c.police_station,
        c.status,
        c.incident_date::text AS incident_date,
        c.location,
        c.description,
        c.investigating_officer
       FROM investigation_cases c
       WHERE c.case_id = ? OR c.case_number = ? OR c.case_number LIKE ?`,
      [caseId, caseId, `%${caseId}%`]
    );

    if (!case_info) {
      return res.status(404).json({ error: 'Active case not found in database' });
    }

    const accused = await getAllRows(
      'SELECT name AS accusedname, notes FROM investigation_suspects WHERE case_id = $1',
      [case_info.case_id]
    );

    const complainants = await getAllRows(
      'SELECT interviewee_name AS complainantname, role FROM investigation_interviews WHERE case_id = $1',
      [case_info.case_id]
    );

    const victims = await getAllRows(
      'SELECT item_name AS victimname, description FROM investigation_evidence WHERE case_id = $1',
      [case_info.case_id]
    );

    const logs = await getAllRows(
      'SELECT id, timestamp::text, actor, log_type, description FROM investigation_logs WHERE case_id = $1 ORDER BY timestamp ASC',
      [case_info.case_id]
    );

    return res.status(200).json({
      success: true,
      case_id: case_info.case_id,
      case: case_info,
      accused,
      complainants,
      victims,
      timeline: logs
    });
  } catch (error: any) {
    console.error('Error fetching case details:', error);
    return res.status(500).json({ error: `Internal server error: ${error.message}` });
  }
});
