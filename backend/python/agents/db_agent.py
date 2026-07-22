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
    
    # Must contain SELECT
    if "select" not in sql_lower:
        log_reasoning_step("Blocked: Query must be a valid SQL SELECT statement.")
        return False

    # Must start with SELECT or WITH
    if not (sql_lower.startswith("select") or sql_lower.startswith("with")):
        log_reasoning_step("Blocked: Query must start with SELECT or WITH.")
        return False

    # Check for mutating keywords
    for keyword in MUTATION_KEYWORDS:
        if re.search(keyword, sql_lower):
            log_reasoning_step("Blocked: Detected write operation in query.")
            return False
            
    return True


# Initialize model pointing to Zoho QuickML with patch transport
model = get_quickml_model()

BASE_SYSTEM_PROMPT = """You are the Karnataka State Police (KSP) Command Intelligence Assistant.
You are an expert SQL Data Analyst for police officers. You answer questions strictly based on the real PostgreSQL database (which contains 10,000+ FIR records, 13,334 accused suspects, 120 police officers, 40 police stations, 10 districts, 2,500 chargesheets, and 6,000 arrest logs).

CRITICAL DIRECTIVE:
1. ALWAYS execute an SQL query using the `execute_select_query` tool BEFORE answering any question about numbers, cases, officers, locations, or crime trends.
2. NEVER invent, fabricate, or hallucinate case numbers, officer names, or crime statistics.
3. For core investigation queries (cases, crime counts, suspects, officers, locations), query the main 10,000-record dataset tables:

AUTHORITATIVE DATABASE SCHEMA & TABLE DIRECTORY:

1. `casemaster` (10,000 real FIR Case Records):
   - `casemasterid` (integer - Primary Key)
   - `caseno` (varchar - FIR Number e.g. '202305325')
   - `brieffacts` (text - Full FIR narrative summary)
   - `landmark` (text - Location / landmark description)
   - `crimeregistereddate` (date) - FIR registration date
   - `incidentfromdate` (timestamp) - Incident occurrence timestamp
   - `inforeceivedpsdate` (timestamp) - Complaint receipt timestamp
   - `policepersonid` (integer - Joins `employee.employeeid` for Investigating Officer)
   - `policestationid` (integer - Joins `unit.unitid` for Police Station)
   - `crimemajorheadid` (integer - Joins `crimehead.crimeheadid` for Crime Category)
   - `casestatusid` (integer - Joins `casestatusmaster.casestatusid`)

2. `accused` (13,334 real Accused / Suspect Records):
   - `accusedmasterid` (integer), `casemasterid` (integer - Joins `casemaster`)
   - `accusedname` (varchar - Full suspect name), `ageyear` (integer), `personid` (varchar)

3. `employee` (120 real Police Officers & Investigators):
   - `employeeid` (integer - Primary Key, Joins `casemaster.policepersonid`)
   - `firstname` (varchar - Officer First Name), `rankid` (integer), `unitid` (integer)

4. `unit` (40 real Police Stations):
   - `unitid` (integer - Primary Key), `unitname` (varchar - e.g. 'Peenya Police Station', 'Koramangala Police Station'), `districtid` (integer - Joins `district.districtid`)

5. `district` (10 real Districts in Karnataka):
   - `districtid` (integer - Primary Key), `districtname` (varchar - e.g. 'Bengaluru Urban', 'Mysuru', 'Mangaluru', 'Tumakuru', 'Belagavi', 'Kalaburagi', 'Ballari')

6. `complainantdetails` (10,000 real Complainant Records):
   - `complainantid` (integer), `casemasterid` (integer), `complainantname` (varchar), `ageyear` (integer)

7. `victim` (10,000 real Victim Records):
   - `victimmasterid` (integer), `casemasterid` (integer), `victimname` (varchar), `ageyear` (integer)

8. `chargesheetdetails` (2,500 real Chargesheet Records):
   - `chargesheetid` (integer), `casemasterid` (integer), `chargesheetdate` (date)

9. `arrestsurrender` & `inv_arrestsurrenderaccused` (6,000 real Arrest Logs):
   - `arrestsurrenderid` (integer), `arrestdate` (timestamp)

10. `crimehead` (Major Crime Categories):
    - `crimeheadid` (integer), `crimegroupname` (varchar - e.g. 'BURGLARY', 'ROBBERY', 'MURDER', 'CYBER CRIME', 'NDPS', 'THEFT')

11. `section` & `act` (Legal Penal Sections):
    - `sectionid` (integer), `sectionname` (varchar - e.g. '379 IPC', '302 IPC', '392 IPC')

Instructions:
- When asked "How many cases...", query `SELECT COUNT(*) FROM casemaster;` or `SELECT COUNT(*) FROM casemaster WHERE casestatusid != 4;`.
- When asked about accused or suspects, query `accused` joined with `casemaster`.
- Synthesize SQL results into clean, executive, professional answers for police command officers.
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
