"""
Briefing API Routes — HTTP contract for daily operational brief.

Handles only request/response concerns. All business logic is delegated
to the Master Agent, which routes to the appropriate tool.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from agents.master_agent import process_request
from models.briefing import DailyBriefResponse
from services.daily_brief_service import ServiceError


router = APIRouter(tags=["Briefing"])


@router.get(
    "/daily-brief",
    response_model=DailyBriefResponse,
    summary="Generate Daily Operational Brief",
    description=(
        "Generates an AI-powered daily operational brief for the station. "
        "The brief includes overnight incidents, investigation status, "
        "repeat offenders, crime trends, alerts, and operational priorities."
    ),
    responses={
        200: {"description": "Successfully generated daily brief"},
        503: {"description": "LLM service (QuickML) is unavailable"},
        500: {"description": "Internal server error"},
    },
)
async def get_daily_brief():
    """
    Generate and return the daily operational brief.

    Delegates to the Master Agent with a 'generate daily brief' intent,
    which routes to the Daily Brief Tool for orchestration.
    """
    try:
        result = await process_request("generate daily brief")

        # If the agent returned a dict (unrecognized intent), return it as JSON
        if isinstance(result, dict):
            return JSONResponse(content=result, status_code=200)

        return result

    except ServiceError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Data service error: {str(e)}",
        )
    except ConnectionError as e:
        raise HTTPException(
            status_code=503,
            detail=(
                "LLM service (QuickML) is unavailable. "
                "Ensure Zoho QuickML API is accessible. "
                f"Details: {str(e)}"
            ),
        )
    except Exception as e:
        # Catch-all for unexpected errors (QuickML connection issues, etc.)
        error_msg = str(e).lower()
        if "connection" in error_msg or "refused" in error_msg or "timeout" in error_msg:
            raise HTTPException(
                status_code=503,
                detail=(
                    "LLM service (QuickML) appears to be offline. "
                    "Please ensure Zoho QuickML API is configured with valid credentials. "
                    f"Details: {str(e)}"
                ),
            )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate daily brief: {str(e)}",
        )
