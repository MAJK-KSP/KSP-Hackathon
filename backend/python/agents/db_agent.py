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
from services.db import get_db_connection
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

BASE_SYSTEM_PROMPT = """You are Karnataka State Police (KSP) Command AI Assistant. Read the user's input text carefully first.

DIRECTIVES:
1. GREETINGS & CASUAL TALK:
   - For greetings or general conversation (e.g. 'hello', 'hi', 'good morning', 'who are you', 'help', 'thanks'), respond directly and conversationally in English, Kannada (ಕನ್ನಡ), or Hindi (हिंदी) WITHOUT calling any SQL tools!
2. CRIME & DATABASE DATA QUERIES:
   - Execute an SQL query using `execute_select_query` ONLY when the user specifically asks for crime records, FIR numbers, accused, victims, locations, investigation status, or criminal history. ALWAYS use LIMIT (e.g., LIMIT 5) to minimize tokens, and SELECT only the required columns (avoid SELECT *). Use strict WHERE clauses.
3. CONTEXT & PATTERN MATCHING:
   - Use conversation history context for follow-up queries. Use ILIKE '%term%' for names and case numbers.
4. KEY DATABASE TABLES & RELATIONSHIPS:
   - CaseMaster (CaseMasterID, CrimeNo, CaseNo, BriefFacts, PolicePersonID, PoliceStationID, CaseCategoryID, CrimeMajorHeadID, CrimeMinorHeadID, CaseStatusID, CourtID)
   - ComplainantDetails (ComplainantID, CaseMasterID, ComplainantName, AgeYear)
   - Victim (VictimMasterID, CaseMasterID, VictimName, AgeYear)
   - Accused (AccusedMasterID, CaseMasterID, AccusedName, AgeYear)
   - ArrestSurrender (ArrestSurrenderID, CaseMasterID, ArrestSurrenderDate, PoliceStationID, IOID, AccusedMasterID)
   - Unit (UnitID, UnitName, TypeID, StateID, DistrictID)
   - Employee (EmployeeID, UnitID, RankID, DesignationID, FirstName)
   - CrimeHead (CrimeHeadID, CrimeGroupName)
   - CrimeSubHead (CrimeSubHeadID, CrimeHeadID, CrimeHeadName)
   - ActSectionAssociation (CaseMasterID, ActID, SectionID), Act (ActCode, ActDescription), Section (ActCode, SectionCode)
   - CaseStatusMaster (CaseStatusID, CaseStatusName)
   [CRITICAL JOIN CONDITIONS]:
   - CaseMaster.CaseMasterID = ComplainantDetails.CaseMasterID = Victim.CaseMasterID = Accused.CaseMasterID = ArrestSurrender.CaseMasterID
   - CaseMaster.PoliceStationID = Unit.UnitID
   - CaseMaster.PolicePersonID = Employee.EmployeeID
   - CaseMaster.CrimeMajorHeadID = CrimeHead.CrimeHeadID
   - CaseMaster.CrimeMinorHeadID = CrimeSubHead.CrimeSubHeadID
   - ArrestSurrender.AccusedMasterID = Accused.AccusedMasterID
5. FULL DATABASE ACCESS (51 TABLES):
   - You have access to the following tables: accused, act, active_cases, actsectionassociation, ai_dataset_registry, arrestsurrender, casecategory, casemaster, cases, casestatusmaster, castemaster, chargesheetdetails, chat_conversations, chat_messages, complainantdetails, court, crimehead, crimeheadactsection, crimesubhead, daily_briefings, daily_operational_data, designation, district, employee, geography_columns, geometry_columns, gravityoffence, inv_arrestsurrenderaccused, inv_occurancetime, investigation_cases, investigation_evidence, investigation_interviews, investigation_locations, investigation_logs, investigation_suspects, occupationmaster, officer_profiles, overnight_incidents, rank, religionmaster, repeat_offenders, section, sessions, spatial_ref_sys, state, unit, unittype, user_roles, users, victim
6. CONVERSATIONAL SUMMARIES INSTEAD OF FORMAL REPORTS:
   - Always respond as a friendly, helpful conversational assistant chatting directly with an officer.
   - Provide clear, concise natural language summaries in 2-4 sentences or quick bullet points. DO NOT output rigid formal document headers (like 'Police Intelligence Dossier', 'Official Status Report', 'Status Report').
   - Keep answers easy to read, conversational, and available in English, Kannada (ಕನ್ನಡ), or Hindi (हिंदी)."""

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
