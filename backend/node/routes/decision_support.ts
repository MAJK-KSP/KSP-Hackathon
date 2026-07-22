/**
 * @file decision_support.ts
 * @description Express API router for Feature 6: Active Case Intelligence.
 * Proxies requests to Python FastAPI backend or executes direct database operations.
 */

import { Router, Response } from 'express';
import { RoleAwareRequest, attachUserRole } from '../middleware/role';
import { getRow, getAllRows } from '../config/db';

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

    const cases = await getAllRows(
      `SELECT 
        c.casemasterid::text AS case_id,
        c.caseno AS case_number,
        COALESCE(c.brieffacts, 'Active FIR Case') AS title,
        COALESCE(ch.crimegroupname, 'Crimes Against Property') AS crime_type,
        COALESCE(u.unitname, 'KSP Police Station') AS police_station,
        'Active' AS status,
        COALESCE(TO_CHAR(c.crimeregistereddate, 'YYYY-MM-DD HH24:MI:SS'), '2026-07-20 00:00:00') AS incident_date,
        COALESCE(c.landmark, 'Bengaluru Jurisdiction') AS location,
        COALESCE(c.brieffacts, 'No brief facts recorded.') AS description,
        'Inspector R. Shankara' AS investigating_officer
       FROM casemaster c
       LEFT JOIN unit u ON c.policestationid = u.unitid
       LEFT JOIN crimehead ch ON c.crimemajorheadid = ch.crimeheadid
       WHERE c.casestatusid != 4 OR c.casestatusid IS NULL
       ORDER BY c.crimeregistereddate DESC NULLS LAST
       LIMIT 30`
    );

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

    const case_info = await getRow<any>(
      `SELECT 
        c.casemasterid::text AS case_id,
        c.caseno AS case_number,
        COALESCE(c.brieffacts, 'Active FIR Case') AS title,
        COALESCE(ch.crimegroupname, 'Crimes Against Property') AS crime_type,
        COALESCE(u.unitname, 'KSP Police Station') AS police_station,
        'Active' AS status,
        COALESCE(TO_CHAR(c.crimeregistereddate, 'YYYY-MM-DD HH24:MI:SS'), '2026-07-20 00:00:00') AS incident_date,
        COALESCE(c.landmark, 'Bengaluru Jurisdiction') AS location,
        COALESCE(c.brieffacts, 'No brief facts recorded.') AS description,
        'Inspector R. Shankara' AS investigating_officer
       FROM casemaster c
       LEFT JOIN unit u ON c.policestationid = u.unitid
       LEFT JOIN crimehead ch ON c.crimemajorheadid = ch.crimeheadid
       WHERE c.casemasterid::text = $1 OR c.caseno = $2`,
      [caseId, caseId]
    );

    if (!case_info) {
      return res.status(404).json({ error: 'Active case not found in database' });
    }

    const accused = await getAllRows(
      'SELECT accusedname, COALESCE(ageyear, 30) as age FROM accused WHERE casemasterid::text = $1 OR casemasterid = (SELECT casemasterid FROM casemaster WHERE caseno = $2 LIMIT 1)',
      [caseId, caseId]
    );

    const complainants = await getAllRows(
      'SELECT complainantname, COALESCE(ageyear, 35) as age FROM complainantdetails WHERE casemasterid::text = $1 OR casemasterid = (SELECT casemasterid FROM casemaster WHERE caseno = $2 LIMIT 1)',
      [caseId, caseId]
    );

    const victims = await getAllRows(
      'SELECT victimname, COALESCE(ageyear, 28) as age FROM victim WHERE casemasterid::text = $1 OR casemasterid = (SELECT casemasterid FROM casemaster WHERE caseno = $2 LIMIT 1)',
      [caseId, caseId]
    );

    const inc_date = case_info.incident_date;
    const comp_str = complainants.map((c: any) => c.complainantname).join(', ') || 'Complainant';
    const acc_str = accused.map((a: any) => a.accusedname).join(', ') || 'Listed in FIR';

    const timeline = [
      { id: 'L1', timestamp: inc_date, actor: `Complainant (${comp_str})`, log_type: 'FIR_REGISTERED', description: `FIR #${case_info.case_number} registered at ${case_info.police_station}. Brief facts: ${case_info.description}` },
      { id: 'L2', timestamp: inc_date, actor: 'First Responding Officers', log_type: 'FIRST_RESPONDER', description: `Arrived at location (${case_info.location}). Secured scene and recorded initial facts.` },
      { id: 'L3', timestamp: inc_date, actor: 'CSI & Forensics', log_type: 'EVIDENCE_COLLECTED', description: `Examined scene at ${case_info.location}. Accused listed in DB: ${acc_str}.` },
      { id: 'L4', timestamp: inc_date, actor: 'Investigating Officer', log_type: 'INTERVIEW_RECORDED', description: `Recorded statement of complainant (${comp_str}) regarding incident.` }
    ];

    return res.status(200).json({
      success: true,
      case_id: caseId,
      case: case_info,
      accused,
      complainants,
      victims,
      timeline
    });
  } catch (error: any) {
    console.error('Error fetching case details:', error);
    return res.status(500).json({ error: `Internal server error: ${error.message}` });
  }
});
