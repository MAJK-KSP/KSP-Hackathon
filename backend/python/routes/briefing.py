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
from services.db import get_db_connection
import uuid
from datetime import datetime, timezone
import logging

router = APIRouter(tags=["Briefing"])
logger = logging.getLogger("uvicorn.error")


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


@router.post(
    "/daily-brief/job",
    summary="Submit Daily Operational Brief Job",
    description="Submits a background job to Catalyst AppSail to generate the daily brief, bypassing the 30-second timeout.",
)
async def submit_daily_brief_job():
    """
    Submit a Zoho Catalyst AppSail job to generate the daily brief in the background.
    """
    try:
        import zcatalyst_sdk
        app = zcatalyst_sdk.initialize()
        job_scheduling = app.job_scheduling()
        
        # create appsail job
        appsail_job = job_scheduling.JOB.submit_job({
            'job_name': f'daily_brief_{int(datetime.now().timestamp())}', 
            'jobpool_name': 'test', 
            'target_type': 'AppSail', 
            'target_name': 'ksp-api-engine', 
            'request_method': 'POST', 
            'url': '/internal/jobs/daily-brief', 
            'headers': {
                'IS_JOB_REQUEST': 'true'
            },
            'job_config': {
                'number_of_retries': 2,
                'retry_interval': 15 * 60 * 1000 
            }
        })
        
        return {"status": "success", "job_details": appsail_job}
    except Exception as e:
        logger.error(f"Failed to submit AppSail job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/internal/jobs/daily-brief",
    summary="Internal Job Executor",
    description="The actual execution endpoint for the background job to generate and save the brief.",
    include_in_schema=False
)
async def execute_daily_brief_job():
    """
    Generates the daily brief and saves it to the database.
    This is intended to be called by the Catalyst Job Scheduler.
    """
    logger.info("Executing background job for daily briefing...")
    try:
        result = await process_request("generate daily brief")
        
        if isinstance(result, dict):
            content = result.get("content", "Brief generated but no content found.")
        else:
            content = result.brief
            
        brief_id = str(uuid.uuid4())
        now_str = datetime.now(timezone.utc).isoformat()
        effective_date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM users ORDER BY created_at ASC LIMIT 1;")
                user_row = cur.fetchone()
                
                if user_row:
                    created_by = user_row["id"]
                    cur.execute("""
                        INSERT INTO daily_briefings (
                            id, created_by, title, content, priority, effective_date, created_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """, (
                        brief_id, created_by, f"Daily Operational Briefing - {effective_date_str}", 
                        content, "high", effective_date_str, now_str
                    ))
                    conn.commit()
                    logger.info(f"Background job successfully saved brief {brief_id}")
                else:
                    logger.warning("No users found to assign brief to.")
                    
        return {"status": "success", "brief_id": brief_id}
    except Exception as e:
        logger.error(f"Error executing brief background job: {e}")
        raise HTTPException(status_code=500, detail=str(e))
