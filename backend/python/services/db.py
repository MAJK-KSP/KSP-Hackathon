"""
@file db.py
@description Supabase PostgreSQL database connection pooling and initialization service.
Part of the Python backend.
"""

import logging
import json
from pathlib import Path
import psycopg
from psycopg.rows import dict_row

from config import settings

import urllib.parse

logger = logging.getLogger("uvicorn.error")

# Global pool placeholder
_pool = None

def get_db_connection():
    """Get a direct connection from the pool (or create a temporary one if pool is not initialized)."""
    # Bypass pool check if DATABASE_URL contains placeholder
    if "[YOUR-PASSWORD]" in settings.database_url:
        raise ConnectionError("Supabase DATABASE_URL is not configured with a valid password.")
    
    url = settings.database_url
    # Robust URL-encoding for passwords containing special characters (like '@')
    prefix = "postgresql://"
    if url.startswith(prefix):
        remainder = url[len(prefix):]
        # If there are multiple '@' signs, the password has an unencoded '@'
        if remainder.count("@") > 1:
            last_at_idx = remainder.rfind("@")
            creds = remainder[:last_at_idx]
            host_db = remainder[last_at_idx + 1:]
            if ":" in creds:
                user, pwd = creds.split(":", 1)
                # Safely URL-encode the password part
                encoded_pwd = urllib.parse.quote_plus(pwd)
                url = f"{prefix}{user}:{encoded_pwd}@{host_db}"
                logger.info("Automatically URL-encoded special characters in the database password.")
    
    return psycopg.connect(url, row_factory=dict_row, connect_timeout=3)

def init_db():
    """Initialize the Supabase database schema and seed initial mock data."""
    if "[YOUR-PASSWORD]" in settings.database_url:
        logger.warning("Supabase database password placeholder is not replaced. Skipping Supabase DB initialization.")
        return

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # 1. Create daily_operational_data table
                logger.info("Initializing Supabase database schema...")
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS daily_operational_data (
                        station_name VARCHAR(100) NOT NULL,
                        briefing_date DATE NOT NULL,
                        data JSONB NOT NULL,
                        PRIMARY KEY (station_name, briefing_date)
                    );
                """)
                conn.commit()

                # Create flattened helper views to simplify LLM SQL queries
                logger.info("Creating database views for simplified AI querying...")
                cur.execute("""
                    CREATE OR REPLACE VIEW overnight_incidents AS
                    SELECT 
                        station_name,
                        briefing_date,
                        inc->>'fir_number' AS fir_number,
                        inc->>'time' AS time,
                        inc->>'type' AS type,
                        inc->>'location' AS location,
                        inc->>'description' AS description,
                        inc->>'severity' AS severity,
                        inc->>'status' AS status,
                        inc->>'investigating_officer' AS investigating_officer
                    FROM daily_operational_data,
                    LATERAL jsonb_array_elements(data->'overnight_incidents') AS inc;
                """)
                cur.execute("""
                    CREATE OR REPLACE VIEW active_cases AS
                    SELECT 
                        station_name,
                        briefing_date,
                        c->>'cr_number' AS cr_number,
                        c->>'fir_number' AS fir_number,
                        c->>'type' AS type,
                        c->>'accused' AS accused,
                        c->>'status' AS status,
                        c->>'next_hearing' AS next_hearing,
                        c->>'priority' AS priority,
                        c->>'remarks' AS remarks
                    FROM daily_operational_data,
                    LATERAL jsonb_array_elements(data->'active_cases') AS c;
                """)
                cur.execute("""
                    CREATE OR REPLACE VIEW repeat_offenders AS
                    SELECT 
                        station_name,
                        briefing_date,
                        r->>'name' AS name,
                        r->>'alias' AS alias,
                        r->>'age' AS age,
                        r->>'address' AS address,
                        r->>'risk_level' AS risk_level,
                        r->>'total_cases' AS total_cases,
                        r->>'last_seen' AS last_seen,
                        r->>'remarks' AS remarks
                    FROM daily_operational_data,
                    LATERAL jsonb_array_elements(data->'repeat_offenders') AS r;
                """)
                conn.commit()

                # 2. Check if table is empty to seed it
                cur.execute("SELECT COUNT(*) as count FROM daily_operational_data;")
                result = cur.fetchone()
                
                if result and result["count"] == 0:
                    logger.info("Supabase database daily_operational_data table is empty. Seeding mock data...")
                    mock_path = Path(__file__).parent.parent / "mock_data" / "daily_brief.json"
                    
                    if mock_path.exists():
                        with open(mock_path, "r", encoding="utf-8") as f:
                            mock_json_data = json.load(f)
                        
                        station_name = mock_json_data.get("station_info", {}).get("station_name", "KSP Intelligence HQ")
                        briefing_date = mock_json_data.get("station_info", {}).get("date", "2026-07-12")
                        
                        cur.execute("""
                            INSERT INTO daily_operational_data (station_name, briefing_date, data)
                            VALUES (%s, %s, %s);
                        """, (station_name, briefing_date, json.dumps(mock_json_data)))
                        conn.commit()
                        logger.info(f"Successfully seeded mock data for '{station_name}' on date '{briefing_date}' to Supabase.")
                    else:
                        logger.warning(f"Could not find mock data file at {mock_path} to seed database.")

    except Exception as e:
        logger.error(f"Failed to initialize Supabase database: {e}")
