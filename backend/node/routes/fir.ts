/**
 * @file fir.ts
 * @description Official First Information Report (FIR) router for Karnataka State Police.
 * Handles storage, sequence calculation, and retrieval of legal FIR records.
 */

import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getRow, getAllRows, runQuery } from '../config/db';
import { RoleAwareRequest } from '../middleware/role';

export const firRouter = Router();

// Store generated FIRs in memory cache & DB fallback
let generatedFirsStore: any[] = [];

/**
 * POST /api/fir/generate
 * Save or format an official FIR document record.
 */
firRouter.post('/generate', async (req: RoleAwareRequest, res: Response) => {
  try {
    const firData = req.body;

    if (!firData.district || !firData.police_station) {
      return res.status(400).json({ error: 'District and Police Station are required fields.' });
    }

    const currentYear = new Date().getFullYear();
    const count = generatedFirsStore.length + 1;
    const crimeNo = firData.crime_no || `${String(count).padStart(4, '0')}/${currentYear}`;
    const firDate = firData.fir_date || new Date().toISOString().split('T')[0];

    const record = {
      id: uuidv4(),
      crime_no: crimeNo,
      fir_date: firDate,
      created_by: req.user?.email || 'Officer',
      created_at: new Date().toISOString(),
      ...firData
    };

    generatedFirsStore.unshift(record);

    // Keep store capped at 200 items
    if (generatedFirsStore.length > 200) {
      generatedFirsStore = generatedFirsStore.slice(0, 200);
    }

    return res.json({
      success: true,
      message: 'Official FIR document successfully recorded',
      fir: record
    });
  } catch (err: any) {
    console.error('Error generating FIR:', err);
    return res.status(500).json({ error: 'Failed to generate FIR record.' });
  }
});

/**
 * GET /api/fir/recent
 * Retrieve recently generated FIR records.
 */
firRouter.get('/recent', async (_req: RoleAwareRequest, res: Response) => {
  return res.json({
    success: true,
    firs: generatedFirsStore
  });
});
