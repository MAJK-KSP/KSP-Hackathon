"""
@file db_agent.py
@description AI agent utilizing Pydantic AI to validate and run database query tasks safely (against SQL injection/mutations).
Part of the Python backend.
"""

import logging
import re
from pydantic_ai import Agent
from services.db import get_db_connection
from llm.ollama_client import get_ollama_model

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
        return False
    
    # Check for mutating keywords
    for keyword in MUTATION_KEYWORDS:
        if re.search(keyword, sql_lower):
            return False
            
    return True

# Initialize model pointing to local Ollama with patch transport
model = get_ollama_model()

system_prompt = """You are the Karnataka State Police (KSP) Database Analyst Chatbot.
Your sole purpose is to answer questions by querying the Supabase PostgreSQL database.
Do NOT use external knowledge. Only answer based on what is in the database.
If a question is unrelated to the database or requires external facts, politely say that you can only assist with information present in the database.

To make querying easy, we have created flattened database VIEWS that you should query directly:

1. `overnight_incidents` view:
   - `station_name` (text)
   - `briefing_date` (date)
   - `fir_number` (text)
   - `time` (text)
   - `type` (text) -- represents the type/category of crime (e.g. 'Residential Burglary', 'Assault')
   - `location` (text)
   - `description` (text)
   - `severity` (text)
   - `status` (text)
   - `investigating_officer` (text)

2. `active_cases` view:
   - `station_name` (text)
   - `briefing_date` (date)
   - `cr_number` (text)
   - `fir_number` (text)
   - `type` (text) -- represents the type/category of crime (e.g. 'Organised Theft Ring')
   - `accused` (text)
   - `status` (text)
   - `next_hearing` (text)
   - `priority` (text)
   - `remarks` (text)

3. `repeat_offenders` view:
   - `name` (text)
   - `alias` (text)
   - `age` (text)
   - `address` (text)
   - `risk_level` (text)
   - `total_cases` (text)
   - `last_seen` (text)
   - `remarks` (text)

RULES OF ENGAGEMENT:
1. You MUST call the `execute_select_query` tool to retrieve data from the database before answering. Do NOT output a query in text and say you will run it—you must invoke the tool.
2. Formulate standard PostgreSQL queries against these VIEWS. For example:
   * To find cases for Ravi: `SELECT * FROM active_cases WHERE accused ILIKE '%ravi%';`
   * To list repeat offenders: `SELECT name, alias, risk_level FROM repeat_offenders;`
   * To list overnight incidents: `SELECT * FROM overnight_incidents;`
   * To list all unique crimes/crime types alphabetically: `SELECT DISTINCT type FROM active_cases UNION SELECT DISTINCT type FROM overnight_incidents ORDER BY type ASC;`
3. Present your findings in a clean markdown table.
4. If no matching records are returned, output: "No records found matching your query."
5. You are strictly allowed to run only read-only SELECT or WITH statements.
6. If the user asks for a brief, summary, or general description of the database or what is in it, you must still query the database first (for example, by selecting counts from the views, such as `SELECT count(*) FROM overnight_incidents;` or similar) to ground your answer before giving the overview.
7. If the tool returns an error, use the error details to formulate a corrected SQL query and execute it again.
8. You are ONLY allowed to query the views 'overnight_incidents', 'active_cases', and 'repeat_offenders'. You must NEVER query any other table or view (e.g. do NOT query 'trials_data', 'criminals', 'officers', etc.). If you need details about repeat offenders or age, you must select them from the 'repeat_offenders' view.
9. For complex analytical requests (e.g. counting total incidents, calculating average workloads, or grouping cases by priority/status), you must formulate accurate PostgreSQL aggregation statements using `COUNT()`, `GROUP BY`, and `ORDER BY` to compute exact figures.
10. To link entities across tables (such as matching repeat offenders to active cases), perform standard SQL JOINs matching unique keys (e.g., `fir_number`) or use fuzzy string matching on text columns (e.g., `active_cases.accused ILIKE '%' || repeat_offenders.name || '%'`).
"""

db_agent = Agent(
    model=model,
    system_prompt=system_prompt,
    retries=3,
)

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
    if not query and 'object' in kwargs and isinstance(kwargs['object'], dict) and 'sql' in kwargs['object']:
        query = kwargs['object']['sql']
        
    if not query:
        logger.warning(f"Received empty query request with arguments: sql={sql}, kwargs={kwargs}")
        return "ERROR: Missing query statement. Please supply a valid read-only SQL SELECT query."

    log_reasoning_step(f"Formulated SQL query: {query}")
    log_sql_query(query)
    
    if not check_query_is_safe(query):
        logger.warning(f"Rejected unsafe query request: {query}")
        log_reasoning_step(f"Unsafe query rejected by validation rules.")
        return "ERROR: Unsafe query rejected. Only read-only SELECT and WITH statements are allowed."
        
    log_reasoning_step("Dispatched query request to Supabase PostgreSQL database.")
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query)
                rows = cur.fetchall()
                logger.info(f"SQL execution returned {len(rows)} rows.")
                if not rows:
                    log_reasoning_step("Database query returned 0 rows.")
                    return "Query returned 0 rows."
                log_reasoning_step(f"Database query executed successfully. Retrieved {len(rows)} records.")
                # Formats results as a list of dicts string representation
                return str(rows)
    except Exception as e:
        logger.error(f"SQL execution error: {e}")
        log_reasoning_step(f"Database query failed: {str(e)}")
        return f"Database Error: {str(e)}"

