"""
@file db_agent.py
@description AI agent utilizing Pydantic AI to validate and run database query tasks safely (against SQL injection/mutations).
Part of the Python backend.
"""

import logging
import re
from pydantic_ai import Agent
from services.db import get_db_connection, get_auth_db_connection
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
    
    log_reasoning_step("Verifying SQL query safety constraints and structure...")
    
    # Must start with SELECT or WITH
    if not (sql_lower.startswith("select") or sql_lower.startswith("with")):
        log_reasoning_step(f"Safety Validation Failed: Query must start with read-only 'SELECT' or 'WITH'. Received snippet: '{sql[:50]}...'")
        return False
    
    # Check for mutating keywords
    for keyword in MUTATION_KEYWORDS:
        if re.search(keyword, sql_lower):
            log_reasoning_step(f"Safety Validation Failed: Detected illegal SQL mutation keyword '{keyword}' in query.")
            return False
            
    log_reasoning_step("Safety Validation Passed: Query contains only read-only SELECT/WITH statements.")
    return True

# Initialize model pointing to local Ollama with patch transport
model = get_ollama_model()

BASE_SYSTEM_PROMPT = """You are the Karnataka State Police (KSP) Database Analyst Chatbot.
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
"""

db_agent = Agent(
    model=model,
    retries=3,
)

def get_registered_datasets():
    """Fetch enabled datasets from the Authorization database."""
    log_reasoning_step("Querying Supabase PostgreSQL auth registry for custom datasets...")
    datasets = []
    try:
        with get_auth_db_connection() as conn:
            log_reasoning_step("Connected to authorization database. Fetching custom dataset registry...")
            with conn.cursor() as cur:
                cur.execute("SELECT table_name, description FROM ai_dataset_registry WHERE is_enabled = 1;")
                datasets = cur.fetchall()
        if datasets:
            table_names = ", ".join([f"'{d['table_name']}'" for d in datasets])
            log_reasoning_step(f"Authorized custom datasets retrieved from registry: {table_names}")
        else:
            log_reasoning_step("No additional custom datasets are currently registered or enabled.")
    except Exception as e:
        logger.error(f"Error fetching registered datasets: {e}")
        log_reasoning_step(f"Failed to query dataset registry: {str(e)}")
    return datasets

def get_table_schema(table_name: str) -> str:
    """Fetch column schema for a given table from the Operational database."""
    log_reasoning_step(f"Retrieving schema definition for table '{table_name}' from PostgreSQL Information Schema...")
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
        log_reasoning_step(f"Failed to fetch schema for table '{table_name}': {str(e)}")
    
    if not columns_info:
        log_reasoning_step(f"Failed to retrieve columns for '{table_name}' from Information Schema.")
        return f"   (Columns in `{table_name}` table could not be retrieved.)\n"
    
    schema_str = f"   Columns in `{table_name}` table:\n"
    for col in columns_info:
        schema_str += f"     - `{col['column_name']}` ({col['data_type']})\n"
    log_reasoning_step(f"Loaded schema for '{table_name}' with {len(columns_info)} columns.")
    return schema_str

@db_agent.system_prompt
def build_system_prompt() -> str:
    log_reasoning_step("Initiating system prompt construction...")
    # Get registered datasets
    datasets = get_registered_datasets()
    
    # Base instructions and views
    prompt = BASE_SYSTEM_PROMPT
    
    # If there are registered datasets, add them to the prompt
    if datasets:
        prompt += "\nIn addition to the three standard views, you are also authorized and encouraged to query the following registered operational datasets:\n\n"
        for d in datasets:
            table_name = d["table_name"]
            description = d["description"] or "No description provided."
            prompt += f"Table: `{table_name}`\n"
            prompt += f"Description: {description}\n"
            # Get table schema
            prompt += get_table_schema(table_name)
            prompt += "\n"
    else:
        prompt += "\nNo additional custom datasets are currently registered.\n"

    # Add standard rules of engagement
    prompt += """
RULES OF ENGAGEMENT:
1. You MUST call the `execute_select_query` tool to retrieve data from the database before answering. Do NOT output a query in text and say you will run it—you must invoke the tool.
2. Formulate standard PostgreSQL queries against the VIEWS or registered tables. For example:
   * To find cases for Ravi: `SELECT * FROM active_cases WHERE accused ILIKE '%ravi%';`
   * To list repeat offenders: `SELECT name, alias, risk_level FROM repeat_offenders;`
   * To list overnight incidents: `SELECT * FROM overnight_incidents;`
   * To list all unique crimes/crime types alphabetically: `SELECT DISTINCT type FROM active_cases UNION SELECT DISTINCT type FROM overnight_incidents ORDER BY type ASC;`
3. Present your findings in a clean markdown table.
4. If no matching records are returned, output: "No records found matching your query."
5. You are strictly allowed to run only read-only SELECT or WITH statements.
6. If the user asks for a brief, summary, or general description of the database or what is in it, you must still query the database first (for example, by selecting counts from the views, such as `SELECT count(*) FROM overnight_incidents;` or similar) to ground your answer before giving the overview.
7. If the tool returns an error, use the error details to formulate a corrected SQL query and execute it again.
"""
    # Dynamically build Rule 8 based on allowed tables
    allowed_tables_list = ["overnight_incidents", "active_cases", "repeat_offenders"] + [d["table_name"] for d in datasets]
    allowed_tables_str = ", ".join([f"'{t}'" for t in allowed_tables_list])
    prompt += f"\n8. You are ONLY allowed to query the views or registered tables: {allowed_tables_str}. You must NEVER query any other table or view (e.g. do NOT query 'trials_data', 'criminals', 'officers', etc.). If you need details about repeat offenders or age, you must select them from the 'repeat_offenders' view.\n"

    prompt += """9. For complex analytical requests (e.g. counting total incidents, calculating average workloads, or grouping cases by priority/status), you must formulate accurate PostgreSQL aggregation statements using `COUNT()`, `GROUP BY`, and `ORDER BY` to compute exact figures.
10. To link entities across tables (such as matching repeat offenders to active cases), perform standard SQL JOINs matching unique keys (e.g., `fir_number`) or use fuzzy string matching on text columns (e.g., `active_cases.accused ILIKE '%' || repeat_offenders.name || '%'`).
"""
    log_reasoning_step("Dynamically constructed system prompt with views, tables, and rules of engagement.")
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
    if not query and 'object' in kwargs and isinstance(kwargs['object'], dict) and 'sql' in kwargs['object']:
        query = kwargs['object']['sql']
        
    if not query:
        logger.warning(f"Received empty query request with arguments: sql={sql}, kwargs={kwargs}")
        log_reasoning_step("Execution halted: Missing SQL query string.")
        return "ERROR: Missing query statement. Please supply a valid read-only SQL SELECT query."

    log_reasoning_step("Tool invoked: Parsing and validation of SQL statement...")
    log_reasoning_step(f"Formulated SQL query: {query}")
    log_sql_query(query)
    
    if not check_query_is_safe(query):
        logger.warning(f"Rejected unsafe query request: {query}")
        return "ERROR: Unsafe query rejected. Only read-only SELECT and WITH statements are allowed."
        
    log_reasoning_step("Establishing pool connection to Supabase PostgreSQL operational database...")
    try:
        with get_db_connection() as conn:
            log_reasoning_step("Connection established. Dispatching query execution...")
            with conn.cursor() as cur:
                cur.execute(query)
                rows = cur.fetchall()
                logger.info(f"SQL execution returned {len(rows)} rows.")
                if not rows:
                    log_reasoning_step("Database query execution finished. Returned 0 matches.")
                    return "Query returned 0 rows."
                log_reasoning_step(f"Database query executed successfully. Retrieved {len(rows)} records.")
                # Formats results as a list of dicts string representation
                return str(rows)
    except Exception as e:
        logger.error(f"SQL execution error: {e}")
        log_reasoning_step(f"Database execution failed with error: {str(e)}")
        return f"Database Error: {str(e)}"

