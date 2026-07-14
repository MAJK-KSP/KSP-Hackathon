"""
Daily Brief Service — Business logic for assembling operational data.

Single responsibility: Load and assemble operational data from the data source.

Currently reads from mock JSON. When PostgreSQL is added in Sprint 2,
ONLY this file changes. The method signature stays the same; the
implementation switches from json.load() to a database query.
"""

import json
import logging
from pathlib import Path

from models.briefing import DailyBriefData
from services.db import get_db_connection

logger = logging.getLogger("uvicorn.error")


class ServiceError(Exception):
    """Raised when the service layer encounters an unrecoverable error."""
    pass


# Path to mock data — resolved relative to this file for cross-platform support
_MOCK_DATA_PATH = Path(__file__).parent.parent / "mock_data" / "daily_brief.json"


def get_daily_brief_data() -> DailyBriefData:
    """
    Load and validate the daily brief data.

    Attempts to fetch the latest daily operational brief from the Supabase
    PostgreSQL database. Falls back to local mock JSON if the database
    is unconfigured, offline, or empty.

    Returns:
        DailyBriefData: A validated, typed data object containing all
        operational data for the daily brief.

    Raises:
        ServiceError: If both database fetch and mock data fallback fail.
    """
    # 1. Try fetching from Supabase PostgreSQL database
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT data FROM daily_operational_data 
                    ORDER BY briefing_date DESC LIMIT 1;
                """)
                row = cur.fetchone()
                if row and "data" in row:
                    logger.info("Successfully fetched latest daily operational data from Supabase.")
                    return DailyBriefData(**row["data"])
                else:
                    logger.warning("No operational data found in Supabase table daily_operational_data.")
    except Exception as e:
        logger.warning(f"Could not fetch operational data from Supabase (falling back to mock JSON): {e}")

    # 2. Fallback to mock JSON data
    try:
        if not _MOCK_DATA_PATH.exists():
            raise ServiceError(
                f"Mock data file not found: {_MOCK_DATA_PATH}. "
                "Ensure mock_data/daily_brief.json exists in the backend directory."
            )

        with open(_MOCK_DATA_PATH, "r", encoding="utf-8") as f:
            raw_data = json.load(f)

        logger.info("Loaded daily operational data from local mock JSON.")
        return DailyBriefData(**raw_data)

    except json.JSONDecodeError as e:
        raise ServiceError(f"Invalid JSON in mock data file: {e}") from e
    except ValueError as e:
        raise ServiceError(f"Data validation failed: {e}") from e

