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
                # Decode first in case the password is already URL-encoded,
                # then re-encode to ensure consistent, valid encoding.
                decoded_pwd = urllib.parse.unquote_plus(pwd)
                encoded_pwd = urllib.parse.quote_plus(decoded_pwd)
                url = f"{prefix}{user}:{encoded_pwd}@{host_db}"
                logger.info("Automatically URL-encoded special characters in the database password.")
    
    return psycopg.connect(url, row_factory=dict_row, connect_timeout=10)

def get_auth_db_connection():
    """Get a direct connection to the Authorization database."""
    if "[YOUR-PASSWORD]" in settings.auth_database_url:
        raise ConnectionError("Supabase AUTH_DATABASE_URL is not configured with a valid password.")
    
    url = settings.auth_database_url
    prefix = "postgresql://"
    if url.startswith(prefix):
        remainder = url[len(prefix):]
        if remainder.count("@") > 1:
            last_at_idx = remainder.rfind("@")
            creds = remainder[:last_at_idx]
            host_db = remainder[last_at_idx + 1:]
            if ":" in creds:
                user, pwd = creds.split(":", 1)
                decoded_pwd = urllib.parse.unquote_plus(pwd)
                encoded_pwd = urllib.parse.quote_plus(decoded_pwd)
                url = f"{prefix}{user}:{encoded_pwd}@{host_db}"
    
    return psycopg.connect(url, row_factory=dict_row, connect_timeout=10)


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

                # Create Investigation Decision Support tables
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS investigation_cases (
                        case_id VARCHAR(50) PRIMARY KEY,
                        case_number VARCHAR(50) UNIQUE NOT NULL,
                        title VARCHAR(200) NOT NULL,
                        crime_type VARCHAR(100) NOT NULL,
                        police_station VARCHAR(100) NOT NULL,
                        status VARCHAR(50) NOT NULL DEFAULT 'Active',
                        incident_date VARCHAR(50) NOT NULL,
                        location TEXT NOT NULL,
                        description TEXT NOT NULL,
                        investigating_officer VARCHAR(100) NOT NULL,
                        outcome TEXT
                    );

                    CREATE TABLE IF NOT EXISTS investigation_logs (
                        id VARCHAR(50) PRIMARY KEY,
                        case_id VARCHAR(50) NOT NULL REFERENCES investigation_cases(case_id) ON DELETE CASCADE,
                        timestamp VARCHAR(50) NOT NULL,
                        actor VARCHAR(100) NOT NULL,
                        log_type VARCHAR(50) NOT NULL,
                        description TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS investigation_evidence (
                        id VARCHAR(50) PRIMARY KEY,
                        case_id VARCHAR(50) NOT NULL REFERENCES investigation_cases(case_id) ON DELETE CASCADE,
                        evidence_type VARCHAR(100) NOT NULL,
                        description TEXT NOT NULL,
                        collected_at VARCHAR(50) NOT NULL,
                        location_found TEXT NOT NULL,
                        status VARCHAR(50) NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS investigation_interviews (
                        id VARCHAR(50) PRIMARY KEY,
                        case_id VARCHAR(50) NOT NULL REFERENCES investigation_cases(case_id) ON DELETE CASCADE,
                        interviewee_name VARCHAR(100) NOT NULL,
                        role VARCHAR(50) NOT NULL,
                        summary TEXT NOT NULL,
                        interview_date VARCHAR(50) NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS investigation_suspects (
                        id VARCHAR(50) PRIMARY KEY,
                        case_id VARCHAR(50) NOT NULL REFERENCES investigation_cases(case_id) ON DELETE CASCADE,
                        name VARCHAR(100) NOT NULL,
                        alias VARCHAR(100),
                        status VARCHAR(50) NOT NULL,
                        alibi_status TEXT NOT NULL,
                        notes TEXT
                    );

                    CREATE TABLE IF NOT EXISTS investigation_locations (
                        id VARCHAR(50) PRIMARY KEY,
                        case_id VARCHAR(50) NOT NULL REFERENCES investigation_cases(case_id) ON DELETE CASCADE,
                        location_name VARCHAR(150) NOT NULL,
                        location_type VARCHAR(50) NOT NULL,
                        address TEXT NOT NULL
                    );
                """)
                seed_investigation_data(cur, conn)

    except Exception as e:
        logger.error(f"Failed to initialize Supabase database: {e}")


def seed_investigation_data(cur, conn):
    """Seed investigation cases and pipeline mock dataset if empty."""
    try:
        cur.execute("SELECT COUNT(*) as count FROM investigation_cases;")
        res = cur.fetchone()
        if res and res.get("count", 0) > 0:
            return

        logger.info("Seeding investigation decision support cases and logs...")

        cases = [
            ("CASE-2026-KOR-001", "FIR-2026-KOR-001", "Koramangala Commercial Safe Heist", "Commercial Burglary & Safe Heist", "Koramangala Police Station", "Active", "2026-07-20 02:15:00", "Commercial Gold Exchange, 80 Feet Road, Koramangala", "Nighttime vault break-in at Commercial Gold Exchange. Culprits forced open rear ventilation grill using hydraulic jacks, deployed a 433MHz RF signal jammer to disable silent alarm alerts, and used an oxy-acetylene torch to cut open the inner wall safe. Disables CCTV DVR storage unit.", "Inspector R. Shankara", None),
            ("CASE-2026-IND-002", "FIR-2026-IND-002", "Indiranagar Luxury Boutique Robbery", "Armed Robbery & Jewelry Heist", "Indiranagar Police Station", "Active", "2026-07-21 21:45:00", "Royal Gems Boutique, 100 Feet Road, Indiranagar", "Armed robbery at closing time. Masked suspects bypassed rear fire door security sensors, held staff at gunpoint, used RF shielding Faraday bags to block GPS tracking tags on diamond trays, and fled in a black SUV.", "Sub-Inspector M. Lakshmi", None),
            ("CASE-2026-WHI-003", "FIR-2026-WHI-003", "Whitefield Corporate Ransomware & Wire Fraud", "Cyber Crime & Corporate Wire Extortion", "Whitefield Police Station", "Active", "2026-07-19 14:30:00", "Apex Technology Park, Whitefield", "Corporate spear-phishing attack compromising finance executive credentials. Attackers initiated fraudulent wire transfers totaling ₹2.4 Crores to mule accounts, deploying crypto ransomware on internal servers to obscure log traces.", "Inspector K. Ponnappa", None),
            ("CASE-2025-CLOSED-01", "FIR-2025-JAY-882", "Jayanagar Jewelers Vault Break-in", "Commercial Burglary & Safe Heist", "Jayanagar Police Station", "Closed", "2025-11-14 03:00:00", "Jayanagar 4th Block Gold Plaza", "Nighttime vault break-in using oxy-acetylene torch, hydraulic jacks, RF signal jammer to disable GSM alarm alerts, and removal of CCTV DVR units.", "Inspector V. Nanjappa", "Solved after tracing 433MHz RF signal jammer serial number to specialized electronics store in SP Road. Toolmark analysis on safe metal slag matched custom oxy-acetylene nozzle confiscated during raid on gang hideout in Peenya. 3 suspects convicted, 95% stolen jewelry recovered."),
            ("CASE-2025-CLOSED-02", "FIR-2025-MAL-412", "Malleshwaram Electronics Safe Breach", "Commercial Burglary & Safe Heist", "Malleshwaram Police Station", "Closed", "2025-08-09 01:45:00", "Sampige Road Malleshwaram", "Safecracking using heavy hydraulic cutters, ventilation shaft entry, partial latent fingerprint on air duct grill, getaway vehicle Mahindra Scorpio.", "Inspector S. Patil", "Solved by cross-referencing cell tower dump records at incident window with registered MO safe breakers. Fingerprint from air duct matched suspect Ramesh Kumar (Kala Ramesh). Surveillance team apprehended gang members in Mysore bus station with ₹45 Lakh cash."),
            ("CASE-2025-CLOSED-03", "FIR-2025-CUB-109", "M.G. Road Watch Showroom Armed Robbery", "Armed Robbery & Jewelry Heist", "Cubbon Park Police Station", "Closed", "2025-05-22 20:15:00", "M.G. Road Promenade", "Masked armed robbery using RF shielding Faraday bags to block GPS tracking chips, rear fire exit getaway, dark SUV with fake license plates.", "Inspector B. Suresh", "Solved by tracing specialized Faraday pouch online purchases and analyzing ANPR (Automatic Number Plate Recognition) cameras along Outer Ring Road, identifying getaway SUV registered under alias. All 4 gang members arrested."),
            ("CASE-2025-CLOSED-04", "FIR-2025-WHI-704", "Hebbal Tech Park Financial Wire Fraud", "Cyber Crime & Corporate Wire Extortion", "Whitefield Police Station", "Closed", "2025-03-11 11:00:00", "Hebbal Tech Ring", "Spear-phishing email compromise targeting corporate finance leads, mule account transfers, ransomware log wipe.", "Inspector K. Ponnappa", "Solved by freezing beneficiary mule accounts within 2 hours of report and analyzing IP transit logs from cloud VPN endpoints. Cyber Crime Cell apprehended ringleader operating out of cyber cafe in Yelahanka.")
        ]

        for c in cases:
            cur.execute("""
                INSERT INTO investigation_cases (case_id, case_number, title, crime_type, police_station, status, incident_date, location, description, investigating_officer, outcome)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (case_id) DO NOTHING;
            """, c)

        logs = [
            ("LOG-KOR-101", "CASE-2026-KOR-001", "2026-07-20 02:15:00", "Central Dispatch", "LOG", "Silent motion sensor alarm tripped at Commercial Gold Exchange, 80 Feet Road. Patrol Car 14 dispatched."),
            ("LOG-KOR-102", "CASE-2026-KOR-001", "2026-07-20 02:22:00", "Patrol Officer Naik", "LOG", "First responders arrived. Front glass intact. Rear ventilation grill breached using hydraulic spreader tools."),
            ("LOG-KOR-103", "CASE-2026-KOR-001", "2026-07-20 03:00:00", "Inspector R. Shankara", "LOG", "Crime Scene Investigation team cordoned area. Main safe cut open using oxy-acetylene torch. Local CCTV DVR missing."),
            ("LOG-KOR-104", "CASE-2026-KOR-001", "2026-07-20 05:30:00", "Forensic Expert Dr. Aruna", "EVIDENCE_COLLECTED", "Recovered 433MHz active RF signal jammer hidden in air duct near safe room. Torch burn slag collected for metallurgical testing."),
            ("LOG-KOR-105", "CASE-2026-KOR-001", "2026-07-20 09:15:00", "SI Chethan", "EVIDENCE_COLLECTED", "Obtained secondary CCTV footage from HDFC ATM across the street showing grey Mahindra Scorpio parked at 01:45 AM."),
            ("LOG-KOR-106", "CASE-2026-KOR-001", "2026-07-20 11:30:00", "Inspector R. Shankara", "INTERVIEW_RECORDED", "Recorded witness statement of night watchman Somanna. Reported seeing 3 men in dark overalls loading duffel bags at 02:10 AM."),
            ("LOG-KOR-107", "CASE-2026-KOR-001", "2026-07-21 14:00:00", "Fingerprint Bureau", "FORENSIC_ANALYSIS", "Partial thumbprint lifted from ventilation duct frame matched criminal record of Ramesh Kumar alias Kala Ramesh.")
        ]

        for l in logs:
            cur.execute("""
                INSERT INTO investigation_logs (id, case_id, timestamp, actor, log_type, description)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING;
            """, l)

        evidence = [
            ("EVD-KOR-001", "CASE-2026-KOR-001", "Oxy-Acetylene Torch Slag & Burn Mark Samples", "Metal residue extracted from safe door cut borders", "2026-07-20 03:30:00", "Main Vault Safe Door", "In Forensic Lab"),
            ("EVD-KOR-002", "CASE-2026-KOR-001", "433MHz Active RF Signal Jammer", "Portable multi-channel jammer used to block GSM cellular security alerts", "2026-07-20 05:30:00", "Air Ventilation Duct", "Secured in Evidence Locker"),
            ("EVD-KOR-003", "CASE-2026-KOR-001", "Partial Latent Fingerprint Lift", "Thumbprint lifted from metallic ventilation grill frame", "2026-07-20 04:15:00", "Rear Ventilation Shaft", "Matched to Suspect Record"),
            ("EVD-KOR-004", "CASE-2026-KOR-001", "HDFC ATM Exterior CCTV Footage", "Video clip showing grey SUV parked 30m from crime scene between 01:45 AM and 02:12 AM", "2026-07-20 09:15:00", "HDFC Bank ATM CCTV Server", "Digital Archive")
        ]

        for e in evidence:
            cur.execute("""
                INSERT INTO investigation_evidence (id, case_id, evidence_type, description, collected_at, location_found, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING;
            """, e)

        interviews = [
            ("INT-KOR-001", "CASE-2026-KOR-001", "Somanna (Age 52)", "Witness (Night Watchman)", "Stated he saw a grey SUV with blurred rear plate idling with parking lights on around 01:50 AM. Observed three men carrying heavy bags into the trunk before driving towards Madiwala at high speed.", "2026-07-20 11:30:00"),
            ("INT-KOR-002", "CASE-2026-KOR-001", "Venkatesh Rao (Age 45)", "Victim (Store Owner)", "Confirmed theft of 4.2 kg gold bullion and ₹18 Lakhs cash. Stated only 3 senior employees possessed safe combination, but torch cut bypassed keylock.", "2026-07-20 10:00:00")
        ]

        for i in interviews:
            cur.execute("""
                INSERT INTO investigation_interviews (id, case_id, interviewee_name, role, summary, interview_date)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING;
            """, i)

        suspects = [
            ("SUS-KOR-001", "CASE-2026-KOR-001", "Ramesh Kumar", "Kala Ramesh", "Prime Suspect", "Unverified Alibi", "Known safe breaker with 4 prior convictions involving oxy-acetylene torching. Partial fingerprint match on ventilation shaft grill."),
            ("SUS-KOR-002", "CASE-2026-KOR-001", "Sunil Kumar", "Chota Suresh", "Person of Interest", "Claims in Hosur", "Electronics specialist known for assembling RF signal jammers. Frequently collaborates with Kala Ramesh.")
        ]

        for s in suspects:
            cur.execute("""
                INSERT INTO investigation_suspects (id, case_id, name, alias, status, alibi_status, notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING;
            """, s)

        locations = [
            ("LOC-KOR-001", "CASE-2026-KOR-001", "Commercial Gold Exchange Premises", "Crime Scene", "80 Feet Road, Koramangala 4th Block, Bengaluru"),
            ("LOC-KOR-002", "CASE-2026-KOR-001", "Koramangala 100ft Junction", "Escape Route", "Koramangala 100 Feet Road Signal to Madiwala Underpass"),
            ("LOC-KOR-003", "CASE-2026-KOR-001", "Peenya Industrial Hideout", "Suspect Hideout", "Plot 42, Peenya 2nd Stage Industrial Area")
        ]

        for loc in locations:
            cur.execute("""
                INSERT INTO investigation_locations (id, case_id, location_name, location_type, address)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING;
            """, loc)

        conn.commit()
        logger.info("Successfully seeded investigation decision support dataset.")
    except Exception as err:
        logger.error(f"Failed to seed Python investigation database: {err}")

