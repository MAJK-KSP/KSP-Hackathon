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

class ChatRequest(BaseModel):
    message: str


@app.post(
    "/chat",
    tags=["AI Agent"],
    summary="Supabase Database Chatbot",
    description="Asks the database agent a question about the Supabase database and returns its response.",
)
async def chat_with_db(request: ChatRequest):
    """Chatbot interface interacting with the restricted DB agent."""
    import logging
    logger = logging.getLogger("uvicorn.error")
    try:
        from agents.db_agent import db_agent
        result = await db_agent.run(request.message)
        return {"response": result.output}
    except Exception as e:
        logger.error(f"Error running DB agent: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate response: {str(e)}")


