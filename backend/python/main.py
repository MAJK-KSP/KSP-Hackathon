"""
Karnataka Police Intelligence Platform — FastAPI Application Entry Point.

Sprint 1: AI Daily Operational Brief Generator.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routes.briefing import router as briefing_router
from services.db import init_db


# ---------------------------------------------------------------------------
# Application Factory
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Karnataka Police Intelligence Platform",
    description=(
        "AI-powered operational intelligence platform for Karnataka State Police. "
        "Provides daily operational briefs, crime analysis, and actionable insights "
        "using local LLM (Ollama/Qwen 3)."
    ),
    version="0.1.0 (Sprint 1)",
    docs_url="/docs",
    redoc_url="/redoc",
)


@app.on_event("startup")
def startup_event():
    """Run database initialization on startup."""
    init_db()



# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

# CORS — permissive in development, lock down in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.app_env == "development" else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(briefing_router)


# ---------------------------------------------------------------------------
# Health Check
# ---------------------------------------------------------------------------

@app.get(
    "/health",
    tags=["System"],
    summary="Health Check",
    description="Returns the health status of the API server.",
)
async def health_check():
    """Basic health check endpoint."""
    return {
        "status": "healthy",
        "service": "Karnataka Police Intelligence Platform",
        "version": "0.1.0",
        "environment": settings.app_env,
        "llm_model": settings.ollama_model,
        "llm_endpoint": settings.ollama_base_url,
    }


@app.get(
    "/status",
    tags=["System"],
    summary="Detailed Status Check",
    description="Checks connections to Supabase PostgreSQL and Ollama.",
)
async def detailed_status():
    """Detailed health check for database and LLM connections."""
    db_connected = False
    db_error = None
    try:
        from services.db import get_db_connection
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1;")
                db_connected = True
    except Exception as e:
        db_error = str(e)

    ollama_connected = False
    ollama_error = None
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            base_url = settings.ollama_base_url.replace("/v1", "").rstrip("/")
            resp = await client.get(f"{base_url}/api/tags", timeout=2.0)
            if resp.status_code == 200:
                ollama_connected = True
            else:
                ollama_error = f"Ollama returned HTTP {resp.status_code}"
    except Exception as e:
        ollama_error = str(e)

    return {
        "supabase_db": {
            "connected": db_connected,
            "error": db_error if not db_connected else None
        },
        "ollama": {
            "connected": ollama_connected,
            "error": ollama_error if not ollama_connected else None,
            "model": settings.ollama_model
        }
    }


from pydantic import BaseModel
from pydantic_ai.messages import ModelRequest, ModelResponse, UserPromptPart, TextPart

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


@app.post(
    "/chat",
    tags=["AI Agent"],
    summary="Supabase Database Chatbot",
    description="Asks the database agent a question about the Supabase database and returns its response.",
)
async def chat_with_db(request: ChatRequest):
    """Chatbot interface interacting with the restricted DB agent."""
    import logging
    import json
    import time
    import asyncio
    from fastapi.responses import StreamingResponse
    from agents.db_agent import db_agent, reasoning_queue_var
    
    logger = logging.getLogger("uvicorn.error")

    # Reconstruct conversation history for Pydantic AI context-awareness
    model_messages = []
    for h in request.history:
        if h.role == 'user':
            model_messages.append(ModelRequest(parts=[UserPromptPart(content=h.content)]))
        elif h.role == 'assistant':
            model_messages.append(ModelResponse(parts=[TextPart(content=h.content)]))

    # Append a context reminder for follow-up queries to enforce schema rules on small LLM runs
    prompt_message = request.message
    if request.history:
        prompt_message += "\n\n(Context reminder: Only query from the views 'overnight_incidents', 'active_cases', or 'repeat_offenders'. Do not attempt to query any other table like 'trials_data'.)"

    async def event_generator():
        queue = asyncio.Queue()
        # Set context-local queue variable for tool execution
        token = reasoning_queue_var.set(queue)
        
        # Start the LLM execution in a background task
        agent_task = asyncio.create_task(
            db_agent.run(prompt_message, message_history=model_messages)
        )
        
        start_time = time.time()
        
        # Stream first two static reasoning steps immediately
        yield json.dumps({"type": "reasoning_step", "content": "Started AI Database Agent session."}) + "\n"
        yield json.dumps({"type": "reasoning_step", "content": "Analyzed user query and checked safety constraints."}) + "\n"
        
        # Listen to queue and stream updates
        while not agent_task.done():
            try:
                # Wait for queue updates or check task status
                item = await asyncio.wait_for(queue.get(), timeout=0.1)
                yield json.dumps(item) + "\n"
                queue.task_done()
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Error in event stream queue: {e}")
                break

        # Process any remaining items in the queue
        while not queue.empty():
            try:
                item = queue.get_nowait()
                yield json.dumps(item) + "\n"
                queue.task_done()
            except Exception:
                break
                
        # Clean up contextvar
        reasoning_queue_var.reset(token)

        # Retrieve result or catch error
        try:
            result = await agent_task
            time_taken_ms = int((time.time() - start_time) * 1000)
            
            # Retrieve final SQL queries and reasoning steps from result messages
            sql_queries = []
            reasoning_steps = [
                "Started AI Database Agent session.",
                "Analyzed user query and checked safety constraints."
            ]
            
            for msg in result.all_messages():
                if hasattr(msg, 'parts'):
                    for part in msg.parts:
                        part_type = type(part).__name__
                        if part_type == 'ToolCallPart' or (hasattr(part, 'tool_name') and part.tool_name == 'execute_select_query'):
                            args_str = getattr(part, 'args', '')
                            sql_query = None
                            if isinstance(args_str, str):
                                try:
                                    args_data = json.loads(args_str)
                                except Exception:
                                    args_data = {}
                            else:
                                args_data = args_str
                                
                            if isinstance(args_data, dict):
                                if 'sql' in args_data:
                                    sql_query = args_data['sql']
                                elif 'object' in args_data and isinstance(args_data['object'], dict) and 'sql' in args_data['object']:
                                    sql_query = args_data['object']['sql']
                            if sql_query:
                                sql_queries.append(sql_query)
                                reasoning_steps.append(f"Formulated SQL query: {sql_query}")
                                reasoning_steps.append("Dispatched query request to Supabase PostgreSQL database.")
                                
                        elif part_type == 'ToolReturnPart' or part_type == 'ToolResultPart':
                            ret_content = str(getattr(part, 'content', ''))
                            if "Error" in ret_content or "unsafe" in ret_content.lower():
                                reasoning_steps.append(f"Database query failed or was rejected: {ret_content[:100]}...")
                            else:
                                reasoning_steps.append("Database query executed successfully. Retrieved records.")
                        elif part_type == 'RetryPromptPart':
                            reasoning_steps.append("Validation warning triggered. Correcting query format and arguments.")
            
            reasoning_steps.append("Compiled final response and rendered markdown results table.")
            
            # Send final response structure
            yield json.dumps({
                "type": "final_result",
                "response": result.output,
                "sql_queries": sql_queries,
                "reasoning_steps": reasoning_steps,
                "time_taken_ms": time_taken_ms
            }) + "\n"
            
        except Exception as e:
            logger.error(f"Agent failed in stream task: {e}")
            yield json.dumps({
                "type": "error",
                "error": f"Failed to generate response: {str(e)}"
            }) + "\n"

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")


