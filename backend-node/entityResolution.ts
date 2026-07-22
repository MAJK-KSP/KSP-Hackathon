import { runQuery, getAllRows, getRow } from './db';

export interface Entity {
  entity_id: string;
  entity_type: 'ACCUSED' | 'VICTIM' | 'LOCATION' | 'FINANCIAL_ACCOUNT' | 'VEHICLE' | 'INCIDENT';
  primary_label: string;
  secondary_info: any;
  risk_score: number;
  created_at?: string;
}

export interface EntityRelationship {
  relationship_id?: number;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: 'CO_ACCUSED' | 'TRANSFERRED_FUNDS' | 'SPOTTED_AT' | 'VICTIM_OF' | 'ASSOCIATED_VEHICLE' | 'INCIDENT_LOCATION';
  casemasterid?: number | null;
  confidence_score: number; // 1.00 = Deterministic/Regex, 0.85 = AI Substring Extract
  evidence_snippet: string;
  created_at?: string;
}

// Regex matchers for Tier 2 extraction
export const REGEX_PATTERNS = {
  VEHICLE: /\b[A-Z]{2}[-\s]?\d{2}[-\s]?[A-Z]{1,2}[-\s]?\d{4}\b/gi,
  PHONE: /\b[6-9]\d{9}\b/g,
  UPI: /\b[a-zA-Z0-9.\-_]+@[a-zA-Z0-9.\-_]+\b/g,
  BANK_IFSC: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g,
};

/**
 * Substring Match Guardrail (Tier 3 Zero-Hallucination Enforcer)
 * Checks if extracted entity name or text exists verbatim in source text.
 */
export function validateSubstringGuardrail(sourceText: string, extractedValue: string): boolean {
  if (!sourceText || !extractedValue) return false;
  return sourceText.toLowerCase().includes(extractedValue.trim().toLowerCase());
}

/**
 * Extract Regex Entities from text (Tier 2 Engine)
 */
export function extractRegexEntities(text: string) {
  const matches: { type: 'VEHICLE' | 'FINANCIAL_ACCOUNT'; value: string; snippet: string }[] = [];
  if (!text) return matches;

  // Split text into sentences for exact snippet extraction
  const sentences = text.split(/(?<=[.!?])\s+/);

  sentences.forEach((sentence) => {
    // 1. Vehicle numbers
    const vehicleMatches = sentence.match(REGEX_PATTERNS.VEHICLE);
    if (vehicleMatches) {
      vehicleMatches.forEach((v) => matches.push({ type: 'VEHICLE', value: v.toUpperCase(), snippet: sentence.trim() }));
    }

    // 2. Phone numbers
    const phoneMatches = sentence.match(REGEX_PATTERNS.PHONE);
    if (phoneMatches) {
      phoneMatches.forEach((p) => matches.push({ type: 'FINANCIAL_ACCOUNT', value: `Phone: ${p}`, snippet: sentence.trim() }));
    }

    // 3. UPI Handles
    const upiMatches = sentence.match(REGEX_PATTERNS.UPI);
    if (upiMatches) {
      upiMatches.forEach((u) => matches.push({ type: 'FINANCIAL_ACCOUNT', value: `UPI: ${u}`, snippet: sentence.trim() }));
    }

    // 4. IFSC / Bank Codes
    const ifscMatches = sentence.match(REGEX_PATTERNS.BANK_IFSC);
    if (ifscMatches) {
      ifscMatches.forEach((b) => matches.push({ type: 'FINANCIAL_ACCOUNT', value: `Bank IFSC: ${b}`, snippet: sentence.trim() }));
    }
  });

  return matches;
}

/**
 * Seed & Ingest Initial Criminal Network Graph Data into Database
 */
export async function seedNetworkGraphData(pgClient?: any) {
  console.log('--- Initializing Criminal Network Entity Resolution & Graph Data ---');

  const defaultEntities: Entity[] = [
    // Accused / Suspects
    { entity_id: 'ACC-101', entity_type: 'ACCUSED', primary_label: 'Ramesh Kumar', secondary_info: { alias: 'Dada Ramesh', phone: '9845012345', risk_rating: 'High' }, risk_score: 9 },
    { entity_id: 'ACC-102', entity_type: 'ACCUSED', primary_label: 'Suresh Naik', secondary_info: { alias: 'Surya', phone: '9900112233', risk_rating: 'High' }, risk_score: 8 },
    { entity_id: 'ACC-103', entity_type: 'ACCUSED', primary_label: 'Mohammed Imran', secondary_info: { alias: 'Bhaijan', phone: '9880192837', risk_rating: 'Critical' }, risk_score: 10 },
    { entity_id: 'ACC-104', entity_type: 'ACCUSED', primary_label: 'Vijay Gowda', secondary_info: { alias: 'Viju', phone: '9740114455', risk_rating: 'Medium' }, risk_score: 7 },
    { entity_id: 'ACC-105', entity_type: 'ACCUSED', primary_label: 'Anand Swamy', secondary_info: { alias: 'Swami', phone: '9632001122', risk_rating: 'Medium' }, risk_score: 6 },

    // Financial Accounts & Phones
    { entity_id: 'FIN-101', entity_type: 'FINANCIAL_ACCOUNT', primary_label: 'Phone: 9845012345', secondary_info: { carrier: 'Airtel', region: 'Bengaluru' }, risk_score: 8 },
    { entity_id: 'FIN-102', entity_type: 'FINANCIAL_ACCOUNT', primary_label: 'UPI: ramesh.kumar@ybl', secondary_info: { bank: 'Yes Bank', status: 'Flagged' }, risk_score: 9 },
    { entity_id: 'FIN-103', entity_type: 'FINANCIAL_ACCOUNT', primary_label: 'SBI A/C 30491823901', secondary_info: { ifsc: 'SBIN0001234', branch: 'Koramangala' }, risk_score: 9 },
    { entity_id: 'FIN-104', entity_type: 'FINANCIAL_ACCOUNT', primary_label: 'Phone: 9900112233', secondary_info: { carrier: 'Jio', region: 'Bengaluru' }, risk_score: 7 },
    { entity_id: 'FIN-105', entity_type: 'FINANCIAL_ACCOUNT', primary_label: 'HDFC A/C 50100239123', secondary_info: { ifsc: 'HDFC0000401', branch: 'Indiranagar' }, risk_score: 8 },

    // Vehicles
    { entity_id: 'VEH-101', entity_type: 'VEHICLE', primary_label: 'KA-01-MJ-9999', secondary_info: { model: 'Black Mahindra Thar', owner: 'Mohammed Imran' }, risk_score: 9 },
    { entity_id: 'VEH-102', entity_type: 'VEHICLE', primary_label: 'KA-05-HL-4321', secondary_info: { model: 'White Hyundai Creta', owner: 'Dr. Rajesh Patel' }, risk_score: 4 },
    { entity_id: 'VEH-103', entity_type: 'VEHICLE', primary_label: 'KA-03-MK-8877', secondary_info: { model: 'Red Pulsar 220', owner: 'Suresh Naik' }, risk_score: 8 },

    // Locations / Hotspots
    { entity_id: 'LOC-101', entity_type: 'LOCATION', primary_label: 'Near Forum Mall Koramangala', secondary_info: { landmark: 'Koramangala 7th Block', station: 'Koramangala Police Station' }, risk_score: 7 },
    { entity_id: 'LOC-102', entity_type: 'LOCATION', primary_label: 'Near Toit Brewpub Indiranagar', secondary_info: { landmark: '100ft Road', station: 'Indiranagar Police Station' }, risk_score: 6 },
    { entity_id: 'LOC-103', entity_type: 'LOCATION', primary_label: 'Near Phoenix Marketcity Whitefield', secondary_info: { landmark: 'Mahadevapura', station: 'Whitefield Police Station' }, risk_score: 5 },
    { entity_id: 'LOC-104', entity_type: 'LOCATION', primary_label: 'Near Jayanagar 4th Block', secondary_info: { landmark: 'Shopping Complex', station: 'Jayanagar Police Station' }, risk_score: 6 },

    // Victims
    { entity_id: 'VIC-101', entity_type: 'VICTIM', primary_label: 'Priya Sharma', secondary_info: { residence: 'Koramangala 4th Block', phone: '9811223344' }, risk_score: 2 },
    { entity_id: 'VIC-102', entity_type: 'VICTIM', primary_label: 'Dr. Rajesh Patel', secondary_info: { residence: 'Indiranagar 12th Main', phone: '9711334455' }, risk_score: 2 },
    { entity_id: 'VIC-103', entity_type: 'VICTIM', primary_label: 'Kavitha Menon', secondary_info: { residence: 'Whitefield', phone: '9611445566' }, risk_score: 1 },

    // Incidents / Crime Cases
    { entity_id: 'INC-101', entity_type: 'INCIDENT', primary_label: 'FIR-2026-KOR-002 (Cyber Fraud)', secondary_info: { date: '2026-07-04', station: 'Koramangala' }, risk_score: 8 },
    { entity_id: 'INC-102', entity_type: 'INCIDENT', primary_label: 'FIR-2026-IND-004 (Cyber Fraud)', secondary_info: { date: '2026-07-14', station: 'Indiranagar' }, risk_score: 8 },
    { entity_id: 'INC-103', entity_type: 'INCIDENT', primary_label: 'FIR-2026-WHI-002 (Theft / Burglary)', secondary_info: { date: '2026-07-07', station: 'Whitefield' }, risk_score: 7 },
    { entity_id: 'INC-104', entity_type: 'INCIDENT', primary_label: 'FIR-2026-JAY-002 (Assault)', secondary_info: { date: '2026-07-06', station: 'Jayanagar' }, risk_score: 8 },
    { entity_id: 'INC-105', entity_type: 'INCIDENT', primary_label: 'FIR-2026-ULS-004 (Robbery)', secondary_info: { date: '2026-07-14', station: 'Ulsoor' }, risk_score: 9 },
  ];

  const defaultRelationships: EntityRelationship[] = [
    // --- Syndicate Co-Accused Links (Forming repeat offender cluster) ---
    {
      source_entity_id: 'ACC-101',
      target_entity_id: 'ACC-102',
      relationship_type: 'CO_ACCUSED',
      casemasterid: 101,
      confidence_score: 1.00,
      evidence_snippet: 'Accused Ramesh Kumar and Suresh Naik jointly conspired to execute fake UPI refund transfers.',
    },
    {
      source_entity_id: 'ACC-102',
      target_entity_id: 'ACC-103',
      relationship_type: 'CO_ACCUSED',
      casemasterid: 102,
      confidence_score: 1.00,
      evidence_snippet: 'Suresh Naik was spotted receiving cash payments directly from co-accused Mohammed Imran.',
    },
    {
      source_entity_id: 'ACC-101',
      target_entity_id: 'ACC-103',
      relationship_type: 'CO_ACCUSED',
      casemasterid: 105,
      confidence_score: 1.00,
      evidence_snippet: 'Call logs confirm frequent encrypted communications between Ramesh Kumar and syndicate leader Mohammed Imran.',
    },
    {
      source_entity_id: 'ACC-104',
      target_entity_id: 'ACC-101',
      relationship_type: 'CO_ACCUSED',
      casemasterid: 104,
      confidence_score: 0.85,
      evidence_snippet: 'Vijay Gowda provided logistics support to Ramesh Kumar during the robbery.',
    },
    {
      source_entity_id: 'ACC-105',
      target_entity_id: 'ACC-102',
      relationship_type: 'CO_ACCUSED',
      casemasterid: 103,
      confidence_score: 0.85,
      evidence_snippet: 'Anand Swamy assisted Suresh Naik in moving stolen electronics across city limits.',
    },

    // --- Financial Account & Phone Links ---
    {
      source_entity_id: 'ACC-101',
      target_entity_id: 'FIN-101',
      relationship_type: 'TRANSFERRED_FUNDS',
      casemasterid: 101,
      confidence_score: 1.00,
      evidence_snippet: 'Primary phone 9845012345 used for OTP interception by accused Ramesh Kumar.',
    },
    {
      source_entity_id: 'ACC-101',
      target_entity_id: 'FIN-102',
      relationship_type: 'TRANSFERRED_FUNDS',
      casemasterid: 101,
      confidence_score: 1.00,
      evidence_snippet: 'Fraudulent funds routed to UPI handle ramesh.kumar@ybl.',
    },
    {
      source_entity_id: 'ACC-102',
      target_entity_id: 'FIN-103',
      relationship_type: 'TRANSFERRED_FUNDS',
      casemasterid: 101,
      confidence_score: 1.00,
      evidence_snippet: 'Account SBI A/C 30491823901 received INR 450,000 from victim Priya Sharma.',
    },
    {
      source_entity_id: 'ACC-102',
      target_entity_id: 'FIN-104',
      relationship_type: 'TRANSFERRED_FUNDS',
      casemasterid: 102,
      confidence_score: 1.00,
      evidence_snippet: 'Phone 9900112233 registered under alias Surya used to contact victims.',
    },
    {
      source_entity_id: 'ACC-103',
      target_entity_id: 'FIN-105',
      relationship_type: 'TRANSFERRED_FUNDS',
      casemasterid: 102,
      confidence_score: 1.00,
      evidence_snippet: 'HDFC A/C 50100239123 received wire transfers from co-accused bank accounts.',
    },

    // --- Vehicle Links ---
    {
      source_entity_id: 'ACC-103',
      target_entity_id: 'VEH-101',
      relationship_type: 'ASSOCIATED_VEHICLE',
      casemasterid: 101,
      confidence_score: 1.00,
      evidence_snippet: 'CCTV footage captured black SUV KA-01-MJ-9999 fleeing the crime scene near Forum Mall.',
    },
    {
      source_entity_id: 'ACC-102',
      target_entity_id: 'VEH-103',
      relationship_type: 'ASSOCIATED_VEHICLE',
      casemasterid: 105,
      confidence_score: 1.00,
      evidence_snippet: 'Pulsar motorcycle KA-03-MK-8877 registered under Suresh Naik impounded at station.',
    },
    {
      source_entity_id: 'VEH-101',
      target_entity_id: 'LOC-101',
      relationship_type: 'SPOTTED_AT',
      casemasterid: 101,
      confidence_score: 1.00,
      evidence_snippet: 'ANPR camera logged KA-01-MJ-9999 passing Forum Mall signal at 02:14 AM.',
    },

    // --- Incident & Victim Links ---
    {
      source_entity_id: 'ACC-101',
      target_entity_id: 'INC-101',
      relationship_type: 'INCIDENT_LOCATION',
      casemasterid: 101,
      confidence_score: 1.00,
      evidence_snippet: 'Ramesh Kumar named prime accused in FIR-2026-KOR-002.',
    },
    {
      source_entity_id: 'ACC-102',
      target_entity_id: 'INC-102',
      relationship_type: 'INCIDENT_LOCATION',
      casemasterid: 102,
      confidence_score: 1.00,
      evidence_snippet: 'Suresh Naik named accused in FIR-2026-IND-004.',
    },
    {
      source_entity_id: 'VIC-101',
      target_entity_id: 'INC-101',
      relationship_type: 'VICTIM_OF',
      casemasterid: 101,
      confidence_score: 1.00,
      evidence_snippet: 'Victim Priya Sharma reported unauthorized withdrawal of funds.',
    },
    {
      source_entity_id: 'VIC-102',
      target_entity_id: 'INC-102',
      relationship_type: 'VICTIM_OF',
      casemasterid: 102,
      confidence_score: 1.00,
      evidence_snippet: 'Victim Dr. Rajesh Patel filed complaint regarding stolen vehicle KA-05-HL-4321.',
    },
    {
      source_entity_id: 'INC-101',
      target_entity_id: 'LOC-101',
      relationship_type: 'INCIDENT_LOCATION',
      casemasterid: 101,
      confidence_score: 1.00,
      evidence_snippet: 'Incident occurred near Forum Mall Koramangala.',
    },
    {
      source_entity_id: 'INC-102',
      target_entity_id: 'LOC-102',
      relationship_type: 'INCIDENT_LOCATION',
      casemasterid: 102,
      confidence_score: 1.00,
      evidence_snippet: 'Incident occurred near Toit Brewpub Indiranagar.',
    },
    {
      source_entity_id: 'INC-103',
      target_entity_id: 'LOC-103',
      relationship_type: 'INCIDENT_LOCATION',
      casemasterid: 103,
      confidence_score: 1.00,
      evidence_snippet: 'Incident occurred near Phoenix Marketcity Whitefield.',
    },
  ];

  // Try Remote Supabase Postgres first if available
  if (pgClient) {
    try {
      console.log('Seeding Phase 2 Graph tables in Supabase Postgres...');

      for (const e of defaultEntities) {
        await pgClient`
          INSERT INTO public.entities (entity_id, entity_type, primary_label, secondary_info, risk_score)
          VALUES (${e.entity_id}, ${e.entity_type}, ${e.primary_label}, ${JSON.stringify(e.secondary_info)}, ${e.risk_score})
          ON CONFLICT (entity_id) DO UPDATE 
          SET primary_label = EXCLUDED.primary_label, risk_score = EXCLUDED.risk_score
        `;
      }

      for (const r of defaultRelationships) {
        await pgClient`
          INSERT INTO public.entity_relationships (source_entity_id, target_entity_id, relationship_type, casemasterid, confidence_score, evidence_snippet)
          VALUES (${r.source_entity_id}, ${r.target_entity_id}, ${r.relationship_type}, ${r.casemasterid || null}, ${r.confidence_score}, ${r.evidence_snippet})
        `;
      }

      console.log('Remote Supabase seeding complete.');
      return;
    } catch (err: any) {
      console.warn('Supabase remote seed failed, populating local SQLite database:', err.message || err);
    }
  }

  // Populate local SQLite database
  try {
    for (const e of defaultEntities) {
      const existing = await getRow('SELECT entity_id FROM entities WHERE entity_id = ?', [e.entity_id]);
      if (!existing) {
        await runQuery(
          `INSERT INTO entities (entity_id, entity_type, primary_label, secondary_info, risk_score, created_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`,
          [e.entity_id, e.entity_type, e.primary_label, JSON.stringify(e.secondary_info), e.risk_score]
        );
      }
    }

    const relCount = await getRow<{ count: number }>('SELECT COUNT(*) as count FROM entity_relationships');
    if (!relCount || relCount.count === 0) {
      for (const r of defaultRelationships) {
        await runQuery(
          `INSERT INTO entity_relationships (source_entity_id, target_entity_id, relationship_type, casemasterid, confidence_score, evidence_snippet, created_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
          [r.source_entity_id, r.target_entity_id, r.relationship_type, r.casemasterid || null, r.confidence_score, r.evidence_snippet]
        );
      }
    }
    console.log('Local SQLite criminal network graph seeding complete.');
  } catch (err) {
    console.error('Failed to seed local SQLite network graph:', err);
  }
}
