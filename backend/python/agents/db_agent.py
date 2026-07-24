"""
@file db_agent.py
@description AI agent utilizing Pydantic AI to validate and run database query tasks safely (against SQL injection/mutations).
Configured with authoritative schema map for all 49 PostgreSQL tables (10,000+ real records).
"""

import json
import logging
import re
import contextvars
from pydantic_ai import Agent
from services.db import get_db_connection, get_auth_db_connection
from llm.quickml_client import get_quickml_model

logger = logging.getLogger("uvicorn.error")

# restricted list of mutating keywords to block SQL injection
MUTATION_KEYWORDS = [
    r"\binsert\b", r"\bupdate\b", r"\bdelete\b", r"\bdrop\b",
    r"\balter\b", r"\btruncate\b", r"\bcreate\b", r"\bgrant\b",
    r"\brevoke\b", r"\breplace\b"
]

def clean_sql_string(raw_sql: str) -> str:
    """Extract clean SQL statement from raw LLM tool input strings."""
    if not raw_sql:
        return ""
    
    query = str(raw_sql).strip()
    
    # Try parsing stringified JSON or dict representation
    try:
        json_match = re.search(r'\{.*\}', query, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group(0))
            if isinstance(data, dict):
                query = data.get('sql') or data.get('query') or query
    except Exception:
        pass
        
    if not isinstance(query, str):
        query = str(query)

    # Extract starting from SELECT or WITH
    select_match = re.search(r'\b(SELECT|WITH)\b.*', query, re.IGNORECASE | re.DOTALL)
    if select_match:
        query = select_match.group(0).strip()
        # Remove trailing closing quotes/parens/markdown tags
        query = re.sub(r'[\}\)\]"`]+$', '', query).strip()
        
    return query


def check_query_is_safe(sql: str) -> bool:
    """Ensure the SQL query is strictly read-only SELECT or WITH statement and contains no mutating commands."""
    sql_lower = sql.strip().lower()
    
    # Strip SQL comments
    clean_sql = re.sub(r'--.*$', '', sql_lower, flags=re.MULTILINE).strip()
    clean_sql = re.sub(r'/\*.*?\*/', '', clean_sql, flags=re.DOTALL).strip()

    # Must contain SELECT
    if "select" not in clean_sql:
        log_reasoning_step("Blocked: Query must be a valid SQL SELECT statement.")
        return False

    # Must start with SELECT or WITH
    if not (clean_sql.startswith("select") or clean_sql.startswith("with")):
        log_reasoning_step("Blocked: Query must start with SELECT or WITH.")
        return False

    # Check for mutating keywords
    for keyword in MUTATION_KEYWORDS:
        if re.search(keyword, clean_sql):
            log_reasoning_step("Blocked: Detected write operation in query.")
            return False
            
    return True


# Initialize model pointing to Zoho QuickML with patch transport
model = get_quickml_model()

BASE_SYSTEM_PROMPT = """You are the Karnataka State Police (KSP) Command Intelligence Assistant.
You are an expert SQL Data Analyst for police officers. You answer questions strictly based on the real PostgreSQL database.

CRITICAL DIRECTIVES:
1. ALWAYS execute an SQL query using the `execute_select_query` tool BEFORE answering any question about cases, FIR numbers, officers, locations, suspects, or crime statistics.
2. NEVER invent, fabricate, or hallucinate case numbers, officer names, or crime statistics.
3. Use `LIKE` pattern matching when searching for case numbers (e.g. '%300060036202400507%', '%FIR-2026-KOR-001%'), police stations, officer names, or aliases.

EXHAUSTIVE AUTHORITATIVE DATABASE SCHEMA (HISTORICAL DATASET & ACTIVE INVESTIGATION TABLES):

1. `casemaster` (Historical FIR Dataset - 10,000 FIR Cases):
   - `casemasterid` (integer), `caseno` (varchar - FIR Number), `brieffacts` (text), `landmark` (varchar), `crimeregistereddate` (timestamp), `policestationid` (integer), `crimemajorheadid` (integer), `casestatusid` (integer), `policepersonid` (integer), `latitude` (numeric), `longitude` (numeric)

2. `unit` (Police Stations & Units):
   - `unitid` (integer), `unitname` (varchar - e.g. 'Hubballi Suburban Police Station', 'Koramangala Police Station')

3. `crimehead` (Crime Classification Categories):
   - `crimeheadid` (integer), `crimegroupname` (varchar - e.g. 'BURGLARY NIGHT', 'THEFT', 'CYBER CRIME')

4. `accused` (Accused & Suspect Master Records):
   - `accusedmasterid` (integer), `casemasterid` (integer - Joins `casemaster.casemasterid`), `accusedname` (varchar), `ageyear` (integer)

5. `complainantdetails` (Complainant Records):
   - `complainantid` (integer), `casemasterid` (integer - Joins `casemaster.casemasterid`), `complainantname` (varchar), `ageyear` (integer)

6. `victim` (Victim Records):
   - `victimmasterid` (integer), `casemasterid` (integer - Joins `casemaster.casemasterid`), `victimname` (varchar), `ageyear` (integer)

7. `employee` (Police Officers & Personnel):
   - `employeeid` (integer), `firstname` (varchar), `rankid` (integer)

8. `casestatusmaster` (Case Status Directory):
   - `casestatusid` (integer), `casestatusname` (varchar - e.g. 'Pending Investigation', 'Under Trial', 'Disposed')

9. `investigation_cases` (Detailed Police Investigation Dossiers):
   - `case_id` (text), `case_number` (text), `title` (text), `crime_type` (text), `police_station` (text), `status` (text), `incident_date` (text), `location` (text), `description` (text), `investigating_officer` (text), `outcome` (text)

10. `investigation_suspects` (Accused & Suspect Records):
    - `id` (text), `case_id` (text - Joins `investigation_cases.case_id`), `name` (text), `alias` (text), `status` (text), `alibi_status` (text), `notes` (text)

11. `investigation_evidence` (Physical, Digital, Vehicle & Weapon Evidence):
    - `id` (text), `case_id` (text - Joins `investigation_cases.case_id`), `evidence_type` (text), `description` (text), `collected_at` (text), `location_found` (text), `status` (text)

12. `investigation_interviews` (Witness & Complainant Statements):
    - `id` (text), `case_id` (text - Joins `investigation_cases.case_id`), `interviewee_name` (text), `role` (text), `summary` (text), `interview_date` (text)

13. `investigation_locations` (Location Hotspots):
    - `id` (text), `case_id` (text - Joins `investigation_cases.case_id`), `location_name` (text), `location_type` (text), `address` (text)

14. `investigation_logs` (Police Chronological Action Timeline):
    - `id` (text), `case_id` (text - Joins `investigation_cases.case_id`), `timestamp` (text), `actor` (text), `log_type` (text), `description` (text)

15. `cases` (Spatial GIS Case Records):
    - `id` (text), `case_number` (text), `crime_type` (text), `jurisdiction` (text), `police_station` (text), `landmark` (text), `latitude` (real), `longitude` (real), `reported_date` (text), `status` (text)

16. `overnight_incidents` (Recent 24h Incidents):
    - `station_name` (varchar), `briefing_date` (date), `fir_number` (text), `time` (text), `type` (text), `location` (text), `description` (text), `severity` (text), `status` (text), `investigating_officer` (text)

17. `active_cases` (Ongoing Briefing Cases):
    - `station_name` (varchar), `briefing_date` (date), `cr_number` (text), `fir_number` (text), `type` (text), `accused` (text), `status` (text), `next_hearing` (text), `priority` (text), `remarks` (text)

18. `repeat_offenders` (Repeat Offender Database):
    - `station_name` (varchar), `briefing_date` (date), `name` (text), `alias` (text), `age` (text), `address` (text), `risk_level` (text), `total_cases` (text), `last_seen` (text), `remarks` (text)

19. `daily_operational_data` (Station Operational Data JSON):
    - `station_name` (varchar), `briefing_date` (date), `data` (jsonb)

20. `officer_profiles`: `user_id` (uuid), `badge_number` (text), `rank` (text), `post` (text), `jurisdiction` (text), `area` (text), `station` (text)
21. `daily_briefings`: `id` (uuid), `title` (text), `content` (text), `priority` (text), `target_role` (text), `target_station` (text)
22. `users`, `user_roles`, `sessions`, `chat_conversations`, `chat_messages`, `ai_audit_logs`, `rbac_audit_logs`, `ai_dataset_registry`

Instructions for Query Execution & Report Formatting:
1. ALWAYS USE FUZZY / STATION FALLBACK SEARCH:
   - When searching for a case number or police station (e.g. 'FIR-2026-ULS-005' or 'Ulsoor Police Station'), query `investigation_cases`, `cases`, AND `casemaster` joined with `unit` and `crimehead`.
   - If an exact FIR number returns 0 rows, DO NOT give up or output a generic 'NO RECORDS FOUND' debugging report. Immediately execute a fallback query searching for records at that Police Station (e.g., `SELECT cm.caseno, cm.brieffacts, u.unitname, ch.crimegroupname FROM casemaster cm JOIN unit u ON cm.policestationid = u.unitid JOIN crimehead ch ON cm.crimemajorheadid = ch.crimeheadid WHERE LOWER(u.unitname) LIKE '%ulsoor%' ORDER BY cm.crimeregistereddate DESC LIMIT 5;`).

2. POLISHED COMMAND CENTER RESPONSE STYLE:
   - Structure final responses as an authoritative KSP Intelligence Report.
   - DO NOT print internal table debugging logs or statements like "The casemaster table was queried... 0 Rows Returned."
   - If an exact FIR number is not found in the database, clearly state that FIR #X was not found, but immediately present the actual registered FIR records for that station (e.g., Ulsoor Police Station) retrieved directly from `casemaster` and `investigation_cases`.
"""

db_agent = Agent(
    model,
    system_prompt=BASE_SYSTEM_PROMPT,
)

# Global context-local queue for streaming agent reasoning events
reasoning_queue_var = contextvars.ContextVar("reasoning_queue", default=None)

def log_reasoning_step(step: str):
    """Log reasoning step locally and push it to the streaming queue if active."""
    logger.info(f"Reasoning Step: {step}")
    q = reasoning_queue_var.get()
    if q is not None:
        try:
            q.put_nowait({"type": "reasoning_step", "content": step})
        except Exception as e:
            logger.error(f"Failed to push reasoning step to queue: {e}")

def log_sql_query(sql: str):
    """Log SQL query and push it to the streaming queue if active."""
    q = reasoning_queue_var.get()
    if q is not None:
        try:
            q.put_nowait({"type": "sql_query", "content": sql})
        except Exception as e:
            logger.error(f"Failed to push SQL query to queue: {e}")

@db_agent.tool_plain
def execute_select_query(sql: str = "", **kwargs) -> str:
    """
    Execute a read-only PostgreSQL SELECT query against the Supabase database.

    Args:
        sql: The SQL SELECT statement to execute.

    Returns:
        str: A string representation of the rows returned or an error message.
    """
    raw_input = sql
    if not raw_input and 'query' in kwargs:
        raw_input = str(kwargs['query'])
    if not raw_input and 'object' in kwargs and isinstance(kwargs['object'], dict):
        raw_input = kwargs['object'].get('sql') or kwargs['object'].get('query') or ''
        
    query = clean_sql_string(raw_input)

    if not query:
        logger.warning(f"Received empty query request with arguments: sql={sql}, kwargs={kwargs}")
        return "ERROR: Missing query statement. Please supply a valid read-only SQL SELECT query."

    log_reasoning_step(f"Executing SQL: {query}")
    log_sql_query(query)
    
    if not check_query_is_safe(query):
        logger.warning(f"Rejected unsafe query request: {query}")
        return "ERROR: Unsafe query rejected. Only read-only SELECT and WITH statements are allowed."
        
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query)
                rows = cur.fetchall()
                logger.info(f"SQL execution returned {len(rows)} rows.")
                if not rows:
                    log_reasoning_step("Query returned 0 results.")
                    return "Query returned 0 rows."
                log_reasoning_step(f"Retrieved {len(rows)} records from database.")
                return json.dumps(rows, default=str, indent=2)
    except Exception as e:
        logger.error(f"SQL execution error: {e}")
        log_reasoning_step(f"Query error: {str(e)}")
        return f"Database Error: {str(e)}"
