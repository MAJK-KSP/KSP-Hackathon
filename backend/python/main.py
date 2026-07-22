"""
Karnataka Police Intelligence Platform — FastAPI Application Entry Point.

Sprint 1: AI Daily Operational Brief Generator.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routes.briefing import router as briefing_router
from routes.transcribe import router as transcribe_router
from routes.synthesize import router as synthesize_router
from routes.network_routes import router as network_router
from routes.decision_support import router as decision_support_router
from services.db import init_db


# ---------------------------------------------------------------------------
# Application Factory
# ---------------------------------------------------------------------------

import os

# Set root_path in Vercel to support proxy mapping behind /api/internal-python
root_path = "/api/internal-python" if os.getenv("VERCEL") else ""

app = FastAPI(
    title="Karnataka Police Intelligence Platform",
    description=(
        "AI-powered operational intelligence platform for Karnataka State Police. "
        "Provides daily operational briefs, crime analysis, and actionable insights "
        "using Zoho Catalyst QuickML (Qwen-35B)."
    ),
    version="0.1.0 (Sprint 1)",
    docs_url="/docs",
    redoc_url="/redoc",
    root_path=root_path,
)


@app.on_event("startup")
def startup_event():
    """Run database initialization and start scheduler on startup."""
    init_db()
    
    # Start background job scheduler
    from services.scheduler_service import start_scheduler
    start_scheduler()



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
app.include_router(transcribe_router)
app.include_router(synthesize_router)
app.include_router(network_router)
app.include_router(decision_support_router)


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
        "llm_model": settings.quickml_model,
        "llm_endpoint": settings.quickml_base_url,
    }


@app.get(
    "/status",
    tags=["System"],
    summary="Detailed Status Check",
    description="Checks connections to Supabase PostgreSQL and Zoho QuickML.",
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

    quickml_connected = False
    quickml_error = None
    try:
        from llm.quickml_client import get_zoho_token
        token = await get_zoho_token()
        if not token:
            quickml_error = "Zoho access token or refresh token is missing."
        else:
            import httpx
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    settings.quickml_endpoint_url,
                    headers={
                        "Content-Type": "application/json",
                        "CATALYST-ORG": settings.catalyst_org,
                        "Authorization": f"Zoho-oauthtoken {token}"
                    },
                    json={"prompt": "ping", "model": "VL-Qwen3.6-35B-A3B"},
                    timeout=3.0
                )
                if resp.status_code in [200, 400]:
                    if "INVALID_OAUTHTOKEN" in resp.text:
                        quickml_error = "Zoho API returned INVALID_OAUTHTOKEN. Please check token validity."
                    else:
                        quickml_connected = True
                else:
                    quickml_error = f"QuickML endpoint returned HTTP {resp.status_code}"
    except Exception as e:
        quickml_error = str(e)

    return {
        "supabase_db": {
            "connected": db_connected,
            "error": db_error if not db_connected else None
        },
        "quickml": {
            "connected": quickml_connected,
            "error": quickml_error if not quickml_connected else None,
            "model": "VL-Qwen3.6-35B-A3B"
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
    # Limit to last 4 messages to keep context focused and prevent the model
    # from losing awareness of its tools in long conversations
    recent_history = request.history[-4:] if len(request.history) > 4 else request.history
    model_messages = []
    for h in recent_history:
        if h.role == 'user':
            model_messages.append(ModelRequest(parts=[UserPromptPart(content=h.content)]))
        elif h.role == 'assistant':
            # Truncate long assistant responses to keep context compact
            truncated = h.content[:300] + '...' if len(h.content) > 300 else h.content
            model_messages.append(ModelResponse(parts=[TextPart(content=truncated)]))

    prompt_message = request.message
    # When there's conversation history and the message looks like a data question,
    # inject table names so the model uses correct names in follow-up queries.
    # Skip for greetings, thanks, and casual messages.
    if model_messages:
        msg_lower = request.message.strip().lower()
        greeting_patterns = ['hello', 'hi', 'hey', 'thanks', 'thank you', 'ok', 'okay', 'bye', 'good', 'great', 'nice', 'cool', 'sure', 'yes', 'no', 'got it']
        is_greeting = any(msg_lower.startswith(g) or msg_lower == g for g in greeting_patterns) and len(msg_lower) < 50
        if not is_greeting:
            prompt_message += "\n\n[Core Database Tables (10,000+ records): casemaster (10k FIRs), accused (13.3k suspects), employee (120 officers), unit (40 stations), district (10 districts), complainantdetails (10k), victim (10k), chargesheetdetails (2.5k), arrestsurrender (6k), crimehead, section. Use execute_select_query tool.]"

    async def event_generator():
        queue = asyncio.Queue()
        # Set context-local queue variable for tool execution
        token = reasoning_queue_var.set(queue)
        
        # Start the LLM execution in a background task
        agent_task = asyncio.create_task(
            db_agent.run(prompt_message, message_history=model_messages)
        )
        
        start_time = time.time()
        
        # Accumulators for streamed details (no hardcoded steps — only real ones)
        streamed_steps = []
        streamed_queries = []
        
        def process_queue_item(item):
            """Accumulate unique streamed reasoning steps and SQL queries."""
            if isinstance(item, dict):
                if item.get("type") == "reasoning_step":
                    content = item.get("content")
                    if content and content not in streamed_steps:
                        streamed_steps.append(content)
                elif item.get("type") == "sql_query":
                    content = item.get("content")
                    if content and content not in streamed_queries:
                        streamed_queries.append(content)
        
        # Listen to queue and stream updates
        while not agent_task.done():
            try:
                # Wait for queue updates or check task status
                item = await asyncio.wait_for(queue.get(), timeout=0.1)
                process_queue_item(item)
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
                process_queue_item(item)
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
            
            # Retrieve final SQL queries and reasoning steps from result messages, avoiding duplicates
            sql_queries = list(streamed_queries)
            reasoning_steps = list(streamed_steps)
            
            # Extract any SQL queries from tool calls that weren't caught during streaming
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
                            if sql_query and sql_query not in sql_queries:
                                sql_queries.append(sql_query)
            
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

# Trigger reload comment 6


