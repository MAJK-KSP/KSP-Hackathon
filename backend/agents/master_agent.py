"""
Master Agent — Intent classifier and tool router.

NOT a PydanticAI agent (no LLM call needed for routing in Sprint 1).
Simple keyword-based intent matching — faster, cheaper, and deterministic.

When we have 5+ tools and need natural-language routing, we upgrade to a
PydanticAI agent — and only this file changes.

Extensibility: Adding a new capability = adding a new keyword pattern + tool import.
"""

from tools.daily_brief_tool import generate_daily_brief
from models.briefing import DailyBriefResponse


# Intent keyword patterns → tool mapping
_DAILY_BRIEF_KEYWORDS = [
    "daily brief",
    "operational brief",
    "morning brief",
    "daily briefing",
    "operational briefing",
    "morning briefing",
    "generate brief",
    "daily report",
    "station brief",
]


def _classify_intent(query: str) -> str | None:
    """
    Classify the user's intent based on keyword matching.

    Args:
        query: The input query string.

    Returns:
        The intent string if matched, None otherwise.
    """
    query_lower = query.lower().strip()

    for keyword in _DAILY_BRIEF_KEYWORDS:
        if keyword in query_lower:
            return "daily_brief"

    return None


async def process_request(query: str) -> DailyBriefResponse | dict:
    """
    Process an incoming request by classifying intent and routing to
    the appropriate tool.

    Args:
        query: The user's request string.

    Returns:
        DailyBriefResponse for daily brief requests, or a dict with
        an error/info message for unrecognized intents.
    """
    intent = _classify_intent(query)

    if intent == "daily_brief":
        return await generate_daily_brief()

    # Future intents will be added here:
    # elif intent == "crime_dna":
    #     return await generate_crime_dna(...)
    # elif intent == "recommendations":
    #     return await generate_recommendations(...)

    return {
        "message": "This functionality is not implemented yet.",
        "recognized_capabilities": ["daily brief", "operational brief"],
        "hint": "Try asking for a 'daily brief' or 'operational brief'.",
    }
