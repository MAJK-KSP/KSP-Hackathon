-- ============================================================================
-- BATCH LANDMARK GEOCODER  (Supabase SQL Editor — copy-paste & run)
-- ============================================================================
-- Processes up to 10 rows per execution.  Run repeatedly until all rows
-- are populated.  Each row makes one Nominatim reverse-geocode call.
--
-- PREREQUISITES:
--   1.  Enable the `http` extension in Supabase Dashboard → Database → Extensions
--       or run:  CREATE EXTENSION IF NOT EXISTS http;
--   2.  The table `public.casemaster` must have columns:
--         casemasterid  (primary key)
--         latitude      (numeric / float)
--         longitude     (numeric / float)
--         landmark      (text / varchar)
-- ============================================================================

DO $$
DECLARE
  rec           RECORD;
  resp_body     TEXT;
  resp_status   INT;
  resp_json     JSONB;
  addr          JSONB;
  landmark_val  TEXT;
  rows_updated  INT := 0;
  rows_skipped  INT := 0;
  api_url       TEXT;
BEGIN
  RAISE NOTICE '======= Batch Landmark Geocoder — Started =======';

  -- ── 1. TARGET BATCHING ────────────────────────────────────────────────
  FOR rec IN
    SELECT casemasterid, latitude, longitude
    FROM   public.casemaster
    WHERE  landmark  IS NULL
      AND  latitude  IS NOT NULL
      AND  longitude IS NOT NULL
    ORDER  BY casemasterid
    LIMIT  10                               -- safe micro-batch cap
  LOOP
    BEGIN  -- ── per-row EXCEPTION block ──────────────────────────────────

      -- ── 2. BUILD URL & FIRE HTTP GET ──────────────────────────────────
      api_url := format(
        'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=%s&lon=%s&addressdetails=1',
        rec.latitude::TEXT,
        rec.longitude::TEXT
      );

      -- ┌─── Synchronous HTTP call (pgsql-http extension) ────────────────
      SELECT status, content
      INTO   resp_status, resp_body
      FROM   http((
        'GET',
        api_url,
        ARRAY[http_header('User-Agent', 'SupabaseCasemasterGeocoder/1.0 (admin@casemaster.app)')],
        NULL,
        NULL
      )::http_request);
      -- └────────────────────────────────────────────────────────────────

      -- Guard: no response or non-200 status
      IF resp_body IS NULL OR resp_status IS DISTINCT FROM 200 THEN
        RAISE NOTICE 'Row id=% — SKIPPED  (HTTP status=%, timed_out=%)',
          rec.casemasterid,
          COALESCE(resp_status::TEXT, 'NULL'),
          (resp_body IS NULL)::TEXT;
        rows_skipped := rows_skipped + 1;
        PERFORM pg_sleep(1.2);
        CONTINUE;
      END IF;

      -- ── 3. PARSE RESPONSE JSON ───────────────────────────────────────
      resp_json := resp_body::JSONB;
      addr      := resp_json -> 'address';

      landmark_val := NULL;

      -- ── TIER 0 — Top-level Nominatim feature name ─────────────────
      -- When Nominatim resolves to an actual POI (temple, school, shop, etc.)
      -- the top-level "name" + "category" are the most precise result.
      IF resp_json ->> 'category' IN (
           'amenity', 'tourism', 'historic', 'leisure',
           'building', 'shop', 'office', 'healthcare'
         )
         AND resp_json ->> 'name' IS NOT NULL
         AND resp_json ->> 'name' <> ''
      THEN
        landmark_val := resp_json ->> 'name';
      END IF;

      IF addr IS NOT NULL THEN

        -- ── TIER 1 — Address-level landmark keys (expanded) ──────────
        IF landmark_val IS NULL THEN
          landmark_val := COALESCE(
            addr ->> 'amenity',
            addr ->> 'building',
            addr ->> 'shop',
            addr ->> 'tourism',
            addr ->> 'hospital',
            addr ->> 'school',
            addr ->> 'place',
            addr ->> 'industrial',
            addr ->> 'leisure',
            addr ->> 'historic',
            addr ->> 'office',
            addr ->> 'man_made',
            addr ->> 'natural',
            addr ->> 'military'
          );
        END IF;

        -- ── TIER 2 — Road / Highway (prefixed with "Near ") ─────────
        --   PostgreSQL:  'Near ' || NULL  →  NULL  (safe for COALESCE)
        IF landmark_val IS NULL THEN
          landmark_val := COALESCE(
            'Near ' || (addr ->> 'road'),
            'Near ' || (addr ->> 'highway')
          );
        END IF;

        -- ── TIER 3 — Neighbourhood / Hamlet (more specific than village)
        IF landmark_val IS NULL THEN
          landmark_val := COALESCE(
            'Near ' || (addr ->> 'neighbourhood'),
            'Near ' || (addr ->> 'hamlet'),
            'Near ' || (addr ->> 'quarter')
          );
        END IF;

      END IF;

      -- ── TIER 4 — First segment of display_name (catch-all) ────────
      -- display_name is always present; extract the first comma-segment
      -- to eliminate NULLs entirely.
      IF landmark_val IS NULL AND resp_json ->> 'display_name' IS NOT NULL THEN
        landmark_val := 'Near ' || split_part(resp_json ->> 'display_name', ', ', 1);
      END IF;

      -- ── 5. UPDATE ROW ────────────────────────────────────────────────
      IF landmark_val IS NOT NULL THEN
        UPDATE public.casemaster
        SET    landmark = landmark_val
        WHERE  casemasterid = rec.casemasterid;

        rows_updated := rows_updated + 1;
        RAISE NOTICE 'Row id=%  ✓  landmark = "%"', rec.casemasterid, landmark_val;
      ELSE
        rows_skipped := rows_skipped + 1;
        RAISE NOTICE 'Row id=%  —  no usable landmark keys in address object', rec.casemasterid;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      -- Single-row failure is logged and swallowed; batch continues
      rows_skipped := rows_skipped + 1;
      RAISE NOTICE 'Row id=%  ✗  ERROR [%]: %', rec.casemasterid, SQLSTATE, SQLERRM;
    END;

    -- ── THROTTLE — respect Nominatim 1 req / sec rate limit ────────────
    PERFORM pg_sleep(1.2);

  END LOOP;

  RAISE NOTICE '======= Batch Complete: % updated, % skipped =======',
    rows_updated, rows_skipped;
END;
$$;
