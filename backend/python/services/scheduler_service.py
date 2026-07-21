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
    Scheduled task that generates the daily brief and inserts it into the database.
    Runs at 12:15 PM every day.
    """
    logger.info("Running scheduled job: automate_morning_briefing")
    try:
        # 1. Generate the briefing using AI (via existing tool)
        brief_response = await generate_daily_brief()
        
        brief_id = str(uuid.uuid4())
        now_str = datetime.now(timezone.utc).isoformat()
        effective_date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        title = f"Daily Operational Briefing - {effective_date_str}"
        content = brief_response.brief
        priority = "high"  # Make it high priority so it stands out
        
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # 2. Get an admin or the first user to attribute this briefing to
                cur.execute("SELECT id FROM users ORDER BY created_at ASC LIMIT 1;")
                user_row = cur.fetchone()
                
                if not user_row:
                    logger.warning("No users found in the database. Scheduled briefing will not be created to prevent foreign key constraint failures.")
                    return
                
                created_by = user_row["id"]
                
                # 3. Insert the briefing into the daily_briefings table
                cur.execute("""
                    INSERT INTO daily_briefings (
                        id, created_by, title, content, priority, effective_date, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (
                    brief_id, created_by, title, content, priority, effective_date_str, now_str
                ))
                conn.commit()
                
        logger.info(f"Successfully generated and published automated daily briefing (ID: {brief_id})")
        
    except Exception as e:
        logger.error(f"Error in automate_morning_briefing task: {e}")

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
