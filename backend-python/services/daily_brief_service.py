"""
Daily Brief Service — Business logic for assembling operational data.

Single responsibility: Load and assemble operational data from the data source.

Currently reads from mock JSON. When PostgreSQL is added in Sprint 2,
ONLY this file changes. The method signature stays the same; the
implementation switches from json.load() to a database query.
"""

import json
from pathlib import Path

from models.briefing import DailyBriefData


class ServiceError(Exception):
    """Raised when the service layer encounters an unrecoverable error."""
    pass


# Path to mock data — resolved relative to this file for cross-platform support
_MOCK_DATA_PATH = Path(__file__).parent.parent / "mock_data" / "daily_brief.json"


def get_daily_brief_data() -> DailyBriefData:
    """
    Load and validate the daily brief data.

    Returns:
        DailyBriefData: A validated, typed data object containing all
        operational data for the daily brief.

    Raises:
        ServiceError: If the data file is missing or contains invalid data.
    """
    try:
        if not _MOCK_DATA_PATH.exists():
            raise ServiceError(
                f"Mock data file not found: {_MOCK_DATA_PATH}. "
                "Ensure mock_data/daily_brief.json exists in the backend directory."
            )

        with open(_MOCK_DATA_PATH, "r", encoding="utf-8") as f:
            raw_data = json.load(f)

        # Pydantic validates every field against the schema
        return DailyBriefData(**raw_data)

    except json.JSONDecodeError as e:
        raise ServiceError(f"Invalid JSON in mock data file: {e}") from e
    except ValueError as e:
        raise ServiceError(f"Data validation failed: {e}") from e
