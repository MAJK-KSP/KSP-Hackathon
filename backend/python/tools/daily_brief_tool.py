"""
Daily Brief Tool — Orchestrates service data + LLM generation.

This is the bridge between raw operational data and the AI-generated brief.
It knows HOW to accomplish the task; the agent only knows WHICH tool to call.

Flow:
1. Call service to get structured data
2. Load system prompt
3. Serialize data for LLM
4. Call LLM to generate the brief
5. Return typed response with metadata
"""

from datetime import datetime, timezone
from pathlib import Path

from config import settings
from llm.quickml_client import generate_briefing
from models.briefing import DailyBriefData, DailyBriefResponse
from services.daily_brief_service import get_daily_brief_data, ServiceError


# Prompt file path — resolved relative to this file
_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "daily_brief_prompt.txt"


def _load_system_prompt() -> str:
    """Load the system prompt from the prompts directory."""
    if not _PROMPT_PATH.exists():
        raise FileNotFoundError(
            f"System prompt not found: {_PROMPT_PATH}. "
            "Ensure prompts/daily_brief_prompt.txt exists."
        )
    return _PROMPT_PATH.read_text(encoding="utf-8").strip()


def _serialize_data_for_llm(data: DailyBriefData) -> str:
    """
    Serialize the daily brief data into a structured text format
    suitable for LLM consumption.

    Uses JSON serialization with indentation for clarity.
    The LLM system prompt is designed to parse this format.
    """
    return data.model_dump_json(indent=2)


async def generate_daily_brief() -> DailyBriefResponse:
    """
    Generate a complete daily operational brief.

    Orchestrates the full pipeline:
    1. Load operational data from the service layer
    2. Load the system prompt
    3. Serialize data for the LLM
    4. Generate the brief via Zoho QuickML
    5. Package the response with metadata

    Returns:
        DailyBriefResponse: The generated brief with metadata.

    Raises:
        ServiceError: If data loading fails.
        FileNotFoundError: If the prompt file is missing.
        Exception: If LLM generation fails (e.g., QuickML is down).
    """
    # Step 1: Get structured data
    data: DailyBriefData = get_daily_brief_data()

    # Step 2: Load system prompt
    system_prompt = _load_system_prompt()

    # Step 3: Serialize data for the LLM
    serialized_data = _serialize_data_for_llm(data)

    # Step 4: Generate the brief
    brief_text = await generate_briefing(
        system_prompt=system_prompt,
        data=serialized_data,
    )

    # Step 5: Package response with metadata
    return DailyBriefResponse(
        brief=brief_text,
        station_name=data.station_info.station_name,
        generated_at=datetime.now(timezone.utc),
        model_used=settings.quickml_model,
        data_source="mock",
    )
