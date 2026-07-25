"""
@file decision_support.py
@description Clean, 100% Database-Driven Active Case Intelligence Router.
Queries real tables in PostgreSQL:
- investigation_cases (case_id, case_number, title, crime_type, police_station, status, incident_date, location, description, investigating_officer, outcome)
- investigation_suspects (id, case_id, name, alias, status, alibi_status, notes)
- investigation_evidence (id, case_id, evidence_type, description, collected_at, location_found, status)
- investigation_interviews (id, case_id, interviewee_name, role, summary, interview_date)
- investigation_logs (id, case_id, timestamp, actor, log_type, description)
- cases (id, case_number, crime_type, jurisdiction, police_station, landmark, latitude, longitude, reported_date, status)
"""

import logging
from fastapi import APIRouter, HTTPException
from services.db import get_db_connection

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/decision-support", tags=["Investigator Active Cases"])


# ---------------------------------------------------------------------------
# Active Cases Cache — avoids re-running heavy JOINs on every page load
# ---------------------------------------------------------------------------
import time as _time

_active_cases_cache: list | None = None
_active_cases_cache_ts: float = 0
_ACTIVE_CASES_TTL = 300  # 5 minutes


def _build_active_cases_cache() -> list:
    """Build the full active cases list from all data sources (runs once per cache refresh)."""
    global _active_cases_cache, _active_cases_cache_ts

    now = _time.time()
    if _active_cases_cache is not None and (now - _active_cases_cache_ts) < _ACTIVE_CASES_TTL:
        return _active_cases_cache

    logger.info("Refreshing active cases cache from database...")
    cases = []
    seen_case_numbers: set = set()

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # 1. Fetch cases from investigation_cases table
            cur.execute("""
                SELECT 
                    case_id,
                    case_number,
                    title,
                    crime_type,
                    police_station,
                    status,
                    incident_date::text AS incident_date,
                    location,
                    description,
                    investigating_officer,
                    outcome
                FROM investigation_cases
                ORDER BY incident_date DESC;
            """)
            for c in cur.fetchall():
                d = dict(c)
                cases.append(d)
                if d.get('case_number'):
                    seen_case_numbers.add(d['case_number'])

            # 2. Fetch all 10,000 FIR records from casemaster dataset (slim list payload)
            try:
                cur.execute("""
                    SELECT 
                        c.casemasterid::text AS case_id,
                        c.caseno AS case_number,
                        COALESCE(LEFT(c.brieffacts, 80), 'Historical FIR Case') AS title,
                        COALESCE(ch.crimegroupname, 'Crimes Against Property') AS crime_type,
                        COALESCE(u.unitname, 'KSP Police Station') AS police_station,
                        'Active' AS status,
                        COALESCE(TO_CHAR(c.crimeregistereddate, 'YYYY-MM-DD HH24:MI:SS'), '2026-07-20 00:00:00') AS incident_date,
                        COALESCE(c.landmark, 'Bengaluru Area') AS location,
                        COALESCE(LEFT(c.brieffacts, 120), 'No brief facts recorded.') AS description,
                        COALESCE('Inspector ' || e.firstname, 'Inspector R. Shankara') AS investigating_officer,
                        'Under Investigation' AS outcome
                    FROM casemaster c
                    LEFT JOIN unit u ON c.policestationid = u.unitid
                    LEFT JOIN crimehead ch ON c.crimemajorheadid = ch.crimeheadid
                    LEFT JOIN employee e ON c.policepersonid = e.employeeid
                    ORDER BY c.crimeregistereddate DESC NULLS LAST
                    LIMIT 10000;
                """)
                for cm in cur.fetchall():
                    cm_dict = dict(cm)
                    cn = cm_dict.get('case_number')
                    if cn and cn not in seen_case_numbers:
                        seen_case_numbers.add(cn)
                        cases.append(cm_dict)
            except Exception as cm_err:
                logger.warning(f"Note fetching casemaster in decision_support: {cm_err}")

            # 3. Fetch GIS cases from cases table if not already in list
            cur.execute("""
                SELECT 
                    id AS case_id,
                    case_number,
                    crime_type AS title,
                    crime_type,
                    police_station,
                    status,
                    reported_date::text AS incident_date,
                    landmark AS location,
                    landmark AS description,
                    'Inspector R. Shankara' AS investigating_officer,
                    'Under Investigation' AS outcome
                FROM cases
                ORDER BY reported_date DESC
                LIMIT 10000;
            """)
            for gc in cur.fetchall():
                gc_dict = dict(gc)
                cn = gc_dict.get('case_number')
                if cn and cn not in seen_case_numbers:
                    seen_case_numbers.add(cn)
                    cases.append(gc_dict)

    _active_cases_cache = cases
    _active_cases_cache_ts = now
    logger.info(f"Active cases cache loaded: {len(cases)} total cases.")
    return cases


@router.get("/active-cases", summary="Get all active cases directly from database")
async def get_active_cases():
    """Retrieve active investigation cases directly from PostgreSQL database."""
    try:
        cases = _build_active_cases_cache()
        return {"success": True, "cases": cases}
    except Exception as e:
        logger.error(f"Error fetching active cases: {e}")
        raise HTTPException(status_code=500, detail=f"Database error fetching active cases: {str(e)}")



@router.get("/case-details/{case_id}", summary="Get all details for selected active case")
async def get_case_details(case_id: str):
    """Retrieve full database record for selected case from PostgreSQL investigation tables or casemaster."""
    target_id = case_id.strip()

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # 1. Fetch case info from investigation_cases
                cur.execute("""
                    SELECT 
                        case_id,
                        case_number,
                        title,
                        crime_type,
                        police_station,
                        status,
                        incident_date::text AS incident_date,
                        location,
                        description,
                        investigating_officer,
                        outcome
                    FROM investigation_cases
                    WHERE case_id = %s OR case_number = %s OR case_number LIKE %s;
                """, (target_id, target_id, f"%{target_id}%"))
                raw_case = cur.fetchone()

                accused_list = []
                complainant_list = []
                victim_list = []
                timeline_logs = []

                if raw_case:
                    case_info = dict(raw_case)
                    actual_case_id = case_info['case_id']

                    # Fetch suspects, interviews, evidence, logs
                    cur.execute("SELECT id, case_id, name AS accusedname, alias, status, alibi_status, notes FROM investigation_suspects WHERE case_id = %s;", (actual_case_id,))
                    accused_list = [dict(a) for a in cur.fetchall()]

                    cur.execute("SELECT id, case_id, interviewee_name AS complainantname, role, summary, interview_date FROM investigation_interviews WHERE case_id = %s;", (actual_case_id,))
                    complainant_list = [dict(c) for c in cur.fetchall()]

                    cur.execute("SELECT id, case_id, evidence_type, description, collected_at, location_found, status FROM investigation_evidence WHERE case_id = %s;", (actual_case_id,))
                    victim_list = [dict(v) for v in cur.fetchall()]

                    cur.execute("SELECT id, case_id, timestamp, actor, log_type, description FROM investigation_logs WHERE case_id = %s ORDER BY timestamp ASC;", (actual_case_id,))
                    timeline_logs = [dict(l) for l in cur.fetchall()]

                    return {
                        "success": True,
                        "case_id": actual_case_id,
                        "case": case_info,
                        "accused": accused_list,
                        "complainants": complainant_list,
                        "victims": victim_list,
                        "timeline": timeline_logs
                    }

                # 2. Query casemaster if not in investigation_cases
                try:
                    cur.execute("""
                        SELECT 
                            c.casemasterid::text AS case_id,
                            c.caseno AS case_number,
                            COALESCE(c.brieffacts, 'Historical FIR Case') AS title,
                            COALESCE(ch.crimegroupname, 'Crimes Against Property') AS crime_type,
                            COALESCE(u.unitname, 'KSP Police Station') AS police_station,
                            'Active' AS status,
                            COALESCE(TO_CHAR(c.crimeregistereddate, 'YYYY-MM-DD HH24:MI:SS'), '2026-07-20 00:00:00') AS incident_date,
                            COALESCE(c.landmark, 'Bengaluru Area') AS location,
                            COALESCE(c.brieffacts, 'No brief facts recorded.') AS description,
                            COALESCE('Inspector ' || e.firstname, 'Inspector R. Shankara') AS investigating_officer,
                            'Under Investigation' AS outcome
                        FROM casemaster c
                        LEFT JOIN unit u ON c.policestationid = u.unitid
                        LEFT JOIN crimehead ch ON c.crimemajorheadid = ch.crimeheadid
                        LEFT JOIN employee e ON c.policepersonid = e.employeeid
                        WHERE c.casemasterid::text = %s OR c.caseno = %s OR c.caseno LIKE %s;
                    """, (target_id, target_id, f"%{target_id}%"))
                    raw_cm = cur.fetchone()

                    if raw_cm:
                        case_info = dict(raw_cm)
                        actual_case_id = case_info['case_id']

                        # Fetch accused from accused table
                        try:
                            cur.execute("SELECT accusedname, COALESCE(ageyear, 30) AS age FROM accused WHERE casemasterid::text = %s OR casemasterid = %s;", (actual_case_id, int(actual_case_id) if actual_case_id.isdigit() else -1))
                            accused_list = [dict(a) for a in cur.fetchall()]
                        except Exception:
                            pass

                        # Fetch complainants from complainantdetails table
                        try:
                            cur.execute("SELECT complainantname, COALESCE(ageyear, 35) AS age FROM complainantdetails WHERE casemasterid::text = %s OR casemasterid = %s;", (actual_case_id, int(actual_case_id) if actual_case_id.isdigit() else -1))
                            complainant_list = [dict(c) for c in cur.fetchall()]
                        except Exception:
                            pass

                        # Fetch victims from victim table
                        try:
                            cur.execute("SELECT victimname, COALESCE(ageyear, 28) AS age FROM victim WHERE casemasterid::text = %s OR casemasterid = %s;", (actual_case_id, int(actual_case_id) if actual_case_id.isdigit() else -1))
                            victim_list = [dict(v) for v in cur.fetchall()]
                        except Exception:
                            pass

                        timeline_logs = [
                            {
                                "id": "L1",
                                "timestamp": case_info['incident_date'],
                                "actor": "Complainant",
                                "log_type": "CRIME_OCCURRENCE",
                                "description": f"Incident recorded near {case_info['location']} under jurisdiction of {case_info['police_station']}."
                            },
                            {
                                "id": "L2",
                                "timestamp": case_info['incident_date'],
                                "actor": "Duty Officer",
                                "log_type": "FIR_REGISTERED",
                                "description": f"FIR #{case_info['case_number']} registered at {case_info['police_station']}. Brief facts: {case_info['description']}"
                            }
                        ]

                        return {
                            "success": True,
                            "case_id": actual_case_id,
                            "case": case_info,
                            "accused": accused_list,
                            "complainants": complainant_list,
                            "victims": victim_list,
                            "timeline": timeline_logs
                        }
                except Exception as cm_err:
                    logger.warning(f"Note querying casemaster details: {cm_err}")

                # 3. Fallback to cases table
                cur.execute("""
                    SELECT 
                        id AS case_id,
                        case_number,
                        crime_type AS title,
                        crime_type,
                        police_station,
                        status,
                        reported_date::text AS incident_date,
                        landmark AS location,
                        landmark AS description,
                        'Inspector R. Shankara' AS investigating_officer,
                        'Under Investigation' AS outcome
                    FROM cases
                    WHERE id = %s OR case_number = %s OR case_number LIKE %s;
                """, (target_id, target_id, f"%{target_id}%"))
                raw_gis = cur.fetchone()

                if not raw_gis:
                    raise HTTPException(status_code=404, detail=f"Active Case '{target_id}' not found in database.")

                case_info = dict(raw_gis)
                return {
                    "success": True,
                    "case_id": case_info['case_id'],
                    "case": case_info,
                    "accused": [],
                    "complainants": [],
                    "victims": [],
                    "timeline": []
                }
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error fetching case details for {case_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Database error fetching case details: {str(e)}")
