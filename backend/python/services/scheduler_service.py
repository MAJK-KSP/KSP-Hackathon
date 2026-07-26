import logging
import uuid
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from services.db import get_db_connection
from tools.daily_brief_tool import generate_daily_brief

logger = logging.getLogger("uvicorn.error")

scheduler = AsyncIOScheduler()

async def automate_morning_briefing():
    """
    Scheduled task that generates the daily brief.
    Runs at 12:15 PM every day. Submits an AppSail Job to bypass timeouts.
    """
    logger.info("Running scheduled job: automate_morning_briefing")
    try:
        # Submit the job to Catalyst instead of running synchronously
        import zcatalyst_sdk
        app = zcatalyst_sdk.initialize()
        job_scheduling = app.job_scheduling()
        
        appsail_job = job_scheduling.JOB.submit_job({
            'job_name': f'daily_brief_cron_{int(datetime.now().timestamp())}',
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
        logger.info(f"Successfully submitted automated daily briefing job to Catalyst: {appsail_job}")
        
    except Exception as e:
        logger.error(f"Error submitting automate_morning_briefing job: {e}")

def start_scheduler():
    """Initializes and starts the APScheduler with the registered jobs."""
    # Schedule to run every day at 12:15 PM (IST)
    scheduler.add_job(
        automate_morning_briefing,
        CronTrigger(hour=12, minute=51, timezone='Asia/Kolkata'),
        id="morning_briefing_job",
        replace_existing=True
    )
    scheduler.start()
    logger.info("APScheduler started. Morning briefing scheduled for 12:15 PM Asia/Kolkata.")
