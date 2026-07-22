-- Phase 2: Criminal Network & Relationship Analysis - Supabase PostgreSQL Schema DDL

-- 1. Table: public.entities
CREATE TABLE IF NOT EXISTS public.entities (
    entity_id TEXT PRIMARY KEY,                       -- e.g., 'ACC-001', 'BNK-98765', 'LOC-401'
    entity_type TEXT NOT NULL,                        -- 'ACCUSED', 'VICTIM', 'LOCATION', 'FINANCIAL_ACCOUNT', 'VEHICLE', 'INCIDENT'
    primary_label TEXT NOT NULL,                      -- e.g., 'Ramesh Kumar', 'KA-01-MJ-9999', 'SBI A/C ...4812'
    secondary_info JSONB DEFAULT '{}'::jsonb,         -- Metainfo (e.g., alias, phone, address, risk rating)
    risk_score INT DEFAULT 1 CHECK (risk_score BETWEEN 1 AND 10),
    created_at TIMESTAMP WITH TIMEZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entities_type ON public.entities(entity_type);


-- 2. Table: public.entity_relationships (Graph Edges)
CREATE TABLE IF NOT EXISTS public.entity_relationships (
    relationship_id BIGSERIAL PRIMARY KEY,
    source_entity_id TEXT NOT NULL REFERENCES public.entities(entity_id) ON DELETE CASCADE,
    target_entity_id TEXT NOT NULL REFERENCES public.entities(entity_id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL,                  -- 'CO_ACCUSED', 'TRANSFERRED_FUNDS', 'SPOTTED_AT', 'VICTIM_OF', 'ASSOCIATED_VEHICLE', 'INCIDENT_LOCATION'
    casemasterid BIGINT REFERENCES public.casemaster(casemasterid) ON DELETE SET NULL,
    confidence_score NUMERIC(3,2) DEFAULT 1.00,       -- 1.00 = Deterministic SQL/Regex; 0.85 = AI Substring Extract
    evidence_snippet TEXT,                            -- Verbatim sentence from brieffacts for 100% auditability
    created_at TIMESTAMP WITH TIMEZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rel_source ON public.entity_relationships(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_rel_target ON public.entity_relationships(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_rel_case ON public.entity_relationships(casemasterid);


-- 3. Stored Procedure / Recursive CTE Query (get_entity_network)
CREATE OR REPLACE FUNCTION public.get_entity_network(root_entity_id TEXT)
RETURNS TABLE (
    source_id TEXT,
    source_label TEXT,
    source_type TEXT,
    target_id TEXT,
    target_label TEXT,
    target_type TEXT,
    relationship_type TEXT,
    confidence_score NUMERIC,
    evidence_snippet TEXT,
    depth INT
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE NetworkPath AS (
        -- Anchor Member: 1st Degree Connections
        SELECT 
            er.source_entity_id AS src_id,
            er.target_entity_id AS tgt_id,
            er.relationship_type AS rel_type,
            er.confidence_score AS conf,
            er.evidence_snippet AS ev_snip,
            1 AS current_depth
        FROM public.entity_relationships er
        WHERE er.source_entity_id = root_entity_id OR er.target_entity_id = root_entity_id

        UNION

        -- Recursive Member: 2nd Degree Connections
        SELECT 
            er.source_entity_id,
            er.target_entity_id,
            er.relationship_type,
            er.confidence_score,
            er.evidence_snippet,
            np.current_depth + 1
        FROM public.entity_relationships er
        JOIN NetworkPath np ON (er.source_entity_id = np.tgt_id OR er.target_entity_id = np.src_id)
        WHERE np.current_depth < 2
    )
    SELECT DISTINCT
        e_src.entity_id AS source_id,
        e_src.primary_label AS source_label,
        e_src.entity_type AS source_type,
        e_tgt.entity_id AS target_id,
        e_tgt.primary_label AS target_label,
        e_tgt.entity_type AS target_type,
        np.rel_type AS relationship_type,
        np.conf AS confidence_score,
        np.ev_snip AS evidence_snippet,
        np.current_depth AS depth
    FROM NetworkPath np
    JOIN public.entities e_src ON np.src_id = e_src.entity_id
    JOIN public.entities e_tgt ON np.tgt_id = e_tgt.entity_id;
END;
$$ LANGUAGE plpgsql;


-- 4. View: public.detect_criminal_syndicates
CREATE OR REPLACE VIEW public.detect_criminal_syndicates AS
SELECT 
    e1.primary_label AS accused_1,
    e2.primary_label AS accused_2,
    COUNT(DISTINCT r1.casemasterid) AS shared_incidents_count,
    ARRAY_AGG(DISTINCT r1.casemasterid) AS shared_case_ids,
    CASE 
        WHEN COUNT(DISTINCT r1.casemasterid) >= 4 THEN 'HIGH RISK: Active Syndicate Cell'
        WHEN COUNT(DISTINCT r1.casemasterid) >= 2 THEN 'MEDIUM RISK: Repeat Co-Accused Pair'
        ELSE 'LOW RISK'
    END AS syndicate_status
FROM public.entity_relationships r1
JOIN public.entity_relationships r2 
    ON r1.casemasterid = r2.casemasterid 
   AND r1.source_entity_id < r2.source_entity_id
JOIN public.entities e1 ON r1.source_entity_id = e1.entity_id
JOIN public.entities e2 ON r2.source_entity_id = e2.entity_id
WHERE e1.entity_type = 'ACCUSED' 
  AND e2.entity_type = 'ACCUSED'
GROUP BY e1.primary_label, e2.primary_label
HAVING COUNT(DISTINCT r1.casemasterid) >= 2
ORDER BY shared_incidents_count DESC;
