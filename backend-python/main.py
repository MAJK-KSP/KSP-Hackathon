"""
Karnataka Police Intelligence Platform — FastAPI Application Entry Point.

Sprint 1: AI Daily Operational Brief Generator.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routes.briefing import router as briefing_router


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
