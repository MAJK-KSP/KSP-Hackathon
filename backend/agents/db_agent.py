import logging
import re
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.ollama import OllamaProvider
from config import settings
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
   - `type` (text)
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
   - `type` (text)
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
3. Present your findings in a clean markdown table.
4. If no matching records are returned, output: "No records found matching your query."
5. You are strictly allowed to run only read-only SELECT or WITH statements.
"""

db_agent = Agent(
    model=model,
    system_prompt=system_prompt,
)

@db_agent.tool_plain
def execute_select_query(sql: str) -> str:
    """
    Execute a read-only PostgreSQL SELECT query against the Supabase database.

    Args:
        sql: The SQL SELECT statement to execute.

    Returns:
        str: A string representation of the rows returned or an error message.
    """
    logger.info(f"DB Agent requested SQL: {sql}")
    
    if not check_query_is_safe(sql):
        logger.warning(f"Rejected unsafe query request: {sql}")
        return "ERROR: Unsafe query rejected. Only read-only SELECT and WITH statements are allowed."
        
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(sql)
                rows = cur.fetchall()
                logger.info(f"SQL execution returned {len(rows)} rows.")
                if not rows:
                    return "Query returned 0 rows."
                # Formats results as a list of dicts string representation
                return str(rows)
    except Exception as e:
        logger.error(f"SQL execution error: {e}")
        return f"Database Error: {str(e)}"
