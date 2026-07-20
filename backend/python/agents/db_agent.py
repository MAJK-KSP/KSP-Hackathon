"""
@file db_agent.py
@description AI agent utilizing Pydantic AI to validate and run database query tasks safely (against SQL injection/mutations).
Part of the Python backend.
"""

import logging
import re
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

def check_query_is_safe(sql: str) -> bool:
    """Ensure the SQL query is strictly read-only SELECT or WITH statement and contains no mutating commands."""
    sql_lower = sql.strip().lower()
    
    # Must start with SELECT or WITH
    if not (sql_lower.startswith("select") or sql_lower.startswith("with")):
        log_reasoning_step(f"Blocked: Query must start with SELECT or WITH.")
        return False
    
    # Check for mutating keywords
    for keyword in MUTATION_KEYWORDS:
        if re.search(keyword, sql_lower):
            log_reasoning_step(f"Blocked: Detected write operation in query.")
            return False
            
    return True

# Initialize model pointing to Zoho QuickML with patch transport
model = get_quickml_model()

BASE_SYSTEM_PROMPT = """You are the Karnataka State Police (KSP) Database Analyst Chatbot.
Your sole purpose is to answer questions by querying the Supabase PostgreSQL database.
Do NOT use external knowledge. Only answer based on what is in the database.
If a question is unrelated to the database or requires external facts, politely say that you can only assist with information present in the database.

Primary Tables and Views available in the Database:

1. `casemaster` (Historical FIR & Crime Database - 10,400+ cases):
   - `casemasterid` (int)
   - `crimeno` / `caseno` (text)
   - `crimeregistereddate` (datetime)
   - `brieffacts` (text)
   - `latitude` / `longitude` (float)
   - `landmark` (text)
   - `crimemajorheadid` (int, joins with `crimehead.crimeheadid`)
   - `policestationid` (int, joins with `unit.unitid`)
   - `casestatusid` (int, joins with `casestatusmaster.casestatusid`)

2. `crimehead` (Crime Categories):
   - `crimeheadid` (int)
   - `crimegroupname` (text, e.g. 'THEFT', 'BURGLARY', 'MURDER', 'CYBER CRIME')

3. `unit` (Police Stations):
   - `unitid` (int)
   - `unitname` (text, e.g. 'Koramangala Police Station', 'Indiranagar PS')

4. `casestatusmaster` (Case Status Names):
   - `casestatusid` (int)
   - `casestatusname` (text, e.g. 'Under Investigation', 'Pending Trial', 'Closed')

5. `overnight_incidents` (Recent 24h Incidents):
   - `station_name`, `briefing_date`, `fir_number`, `time`, `type`, `location`, `description`, `severity`, `status`, `investigating_officer`

6. `active_cases` (Ongoing Briefing Cases):
   - `station_name`, `briefing_date`, `cr_number`, `fir_number`, `type`, `accused`, `status`, `next_hearing`, `priority`, `remarks`

7. `repeat_offenders` (High-Risk Offenders):
   - `name`, `alias`, `age`, `address`, `risk_level`, `total_cases`, `last_seen`, `remarks`

Other accessible operational tables: `accused`, `victim`, `complainantdetails`, `chargesheetdetails`, `act`, `section`, `arrestsurrender`.
"""

db_agent = Agent(
    model=model,
    retries=3,
)

def get_registered_datasets():
    """Fetch enabled datasets from the Authorization database."""
    datasets = []
    try:
        with get_auth_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT table_name, description FROM ai_dataset_registry WHERE is_enabled = 1;")
                datasets = cur.fetchall()
        if datasets:
            table_names = ", ".join([f"'{d['table_name']}'" for d in datasets])
            logger.info(f"Authorized custom datasets retrieved: {table_names}")
    except Exception as e:
        logger.error(f"Error fetching registered datasets: {e}")
    return datasets

def get_table_schema(table_name: str) -> str:
    """Fetch column schema for a given table from the Operational database."""
    columns_info = []
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_schema = 'public' AND table_name = %s
                    ORDER BY ordinal_position;
                """, (table_name,))
                columns_info = cur.fetchall()
    except Exception as e:
        logger.error(f"Error fetching schema for {table_name}: {e}")
    
    if not columns_info:
        return f"   (Columns in `{table_name}` table could not be retrieved.)\n"
    
    schema_str = f"   Columns in `{table_name}` table:\n"
    for col in columns_info:
        schema_str += f"     - `{col['column_name']}` ({col['data_type']})\n"
    return schema_str

@db_agent.system_prompt
def build_system_prompt() -> str:
    datasets = get_registered_datasets()
    prompt = BASE_SYSTEM_PROMPT
    
    if datasets:
        prompt += "\nIn addition to standard tables, you are also authorized to query the following registered operational datasets:\n\n"
        for d in datasets:
            table_name = d["table_name"]
            description = d["description"] or "No description provided."
            prompt += f"Table: `{table_name}`\n"
            prompt += f"Description: {description}\n"
            prompt += get_table_schema(table_name)
            prompt += "\n"

    prompt += """
RULES OF ENGAGEMENT:
1. You MUST call the `execute_select_query` tool to retrieve data from the database before answering any data question. Do NOT output a query in text without executing it.
2. For greetings or non-data questions (like "Hello", "Hi", "Thank you"), respond naturally WITHOUT calling any tools.
3. Formulate standard PostgreSQL queries against tables or views. For example:
   * To find cases for Ravi: `SELECT * FROM active_cases WHERE accused ILIKE '%ravi%';`
   * To search casemaster: `SELECT c.casemasterid, c.crimeno, c.brieffacts, ch.crimegroupname FROM casemaster c LEFT JOIN crimehead ch ON c.crimemajorheadid = ch.crimeheadid LIMIT 20;`
   * To list repeat offenders: `SELECT name, alias, risk_level FROM repeat_offenders;`
   * To count incidents: `SELECT count(*) FROM overnight_incidents;`
4. Present findings in a clear markdown table or bullet points.
5. If no matching records are returned, output: "No records found matching your query."
6. You are strictly allowed to run read-only SELECT or WITH statements.
7. If the user asks for a brief, summary, or general description of cases, query counts or sample rows first before giving the overview.
8. If a query returns an error, use the error details to formulate a corrected SQL query and execute it again.
9. You are authorized to query ANY table or view in the dataset (casemaster, active_cases, overnight_incidents, repeat_offenders, crimehead, unit, casestatusmaster, accused, victim, etc.).
10. For analytical requests, use PostgreSQL aggregations (`COUNT()`, `GROUP BY`, `ORDER BY`).
11. To link tables, perform standard SQL JOINs on foreign keys or matching text columns.
"""
    return prompt

import contextvars

# Global context-local queue for streaming agent reasoning events
reasoning_queue_var = contextvars.ContextVar("reasoning_queue", default=None)

def log_reasoning_step(step: str):
    """Log reasoning step locally and push it to the streaming queue if active."""
    logger.info(f"Reasoning Step: {step}")
    q = reasoning_queue_var.get()
    if q is not None:
        try:
            import asyncio
            # Use call_soon_threadsafe or put_nowait to push safely
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
    query = sql
    if not query and 'query' in kwargs:
        query = str(kwargs['query'])
    if not query and 'object' in kwargs and isinstance(kwargs['object'], dict):
        query = kwargs['object'].get('sql') or kwargs['object'].get('query') or ''
        
    if query:
        # Strip leading variable names like query= or sql= or query:
        query = re.sub(r"^(?:query|sql)\s*[:=]\s*", "", query, flags=re.IGNORECASE).strip()
        # Strip outer quotes wrapping the query
        if (query.startswith('"') and query.endswith('"')) or (query.startswith("'") and query.endswith("'")):
            query = query[1:-1].strip()
        # Strip XML-like tags and markdown code blocks that the LLM may wrap the query in
        query = re.sub(r"</?(?:sql|query|tool_code|execute_select_query)?>", "", query).strip()
        query = re.sub(r"```[a-zA-Z]*", "", query).strip()
        
    if not query:
        logger.warning(f"Received empty query request with arguments: sql={sql}, kwargs={kwargs}")
        return "ERROR: Missing query statement. Please supply a valid read-only SQL SELECT query."

    log_reasoning_step(f"Executing SQL: {query}")
    log_sql_query(query)
    
    if not check_query_is_safe(query):
        logger.warning(f"Rejected unsafe query request: {query}")
        return "ERROR: Unsafe query rejected. Only read-only SELECT and WITH statements are allowed."
        
    try:
        import json
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

