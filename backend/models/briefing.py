"""
Pydantic data models for the Daily Operational Brief.

These models serve triple duty:
1. Validate mock JSON on load (and later, DB query results)
2. Serialize cleanly for LLM prompt construction
3. Define the API response contract (auto-generates OpenAPI schema)
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class Severity(str, Enum):
    """Incident / alert severity levels."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class IncidentStatus(str, Enum):
    """Current status of an overnight incident."""
    FIR_REGISTERED = "FIR Registered"
    UNDER_INVESTIGATION = "Under Investigation"
    ARRESTED = "Arrested"
    CASE_CLOSED = "Case Closed"
    PENDING = "Pending"


class CasePriority(str, Enum):
    """Investigation priority classification."""
    URGENT = "urgent"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class TrendDirection(str, Enum):
    """Week-over-week crime trend direction."""
    UP = "up"
    DOWN = "down"
    STABLE = "stable"


class RiskLevel(str, Enum):
    """Repeat offender risk assessment."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class AlertType(str, Enum):
    """Type of operational alert."""
    VIP_MOVEMENT = "VIP Movement"
    WEATHER = "Weather"
    LAW_AND_ORDER = "Law & Order"
    SECURITY = "Security"
    GENERAL = "General"


# ---------------------------------------------------------------------------
# Component Models
# ---------------------------------------------------------------------------

class StationInfo(BaseModel):
    """Police station identification and context."""
    station_name: str = Field(..., description="Full name of the police station")
    district: str = Field(..., description="District the station belongs to")
    subdivision: str = Field(..., description="Sub-division within the district")
    date: date = Field(..., description="Briefing date")
    officer_in_charge: str = Field(..., description="Name and rank of the OIC")
    contact_number: str = Field(..., description="Station contact number")


class OvernightIncident(BaseModel):
    """A single incident that occurred during the overnight shift."""
    fir_number: str = Field(..., description="FIR number (e.g., 142/2026)")
    time: str = Field(..., description="Time of occurrence (e.g., 02:30 hrs)")
    type: str = Field(..., description="Type of incident (e.g., Theft, Assault)")
    location: str = Field(..., description="Location where the incident occurred")
    description: str = Field(..., description="Brief description of the incident")
    severity: Severity = Field(..., description="Incident severity level")
    status: IncidentStatus = Field(..., description="Current status")
    investigating_officer: str = Field(..., description="Assigned investigating officer")


class CaseStatus(BaseModel):
    """Status of an active case under investigation."""
    cr_number: str = Field(..., description="Crime Register number")
    fir_number: str = Field(..., description="FIR number")
    type: str = Field(..., description="Type of crime")
    accused: Optional[str] = Field(None, description="Name of accused, if known")
    status: str = Field(..., description="Current investigation status")
    next_hearing: Optional[str] = Field(None, description="Next court hearing date")
    priority: CasePriority = Field(..., description="Investigation priority")
    remarks: str = Field("", description="Additional remarks from IO")


class RepeatOffender(BaseModel):
    """Known repeat offender requiring monitoring."""
    name: str = Field(..., description="Full name of the offender")
    alias: Optional[str] = Field(None, description="Known alias")
    age: int = Field(..., description="Age of the offender")
    address: str = Field(..., description="Last known address")
    offenses: list[str] = Field(..., description="List of past offense types")
    total_cases: int = Field(..., description="Total number of cases registered")
    risk_level: RiskLevel = Field(..., description="Current risk assessment")
    last_seen: str = Field(..., description="Last known sighting date/location")
    remarks: str = Field("", description="Monitoring notes")


class CrimeTrend(BaseModel):
    """Week-over-week crime trend for a specific category."""
    category: str = Field(..., description="Crime category (e.g., Theft, Assault)")
    current_week_count: int = Field(..., description="Cases this week")
    previous_week_count: int = Field(..., description="Cases last week")
    trend: TrendDirection = Field(..., description="Trend direction")
    percentage_change: float = Field(..., description="Percentage change (can be negative)")


class Alert(BaseModel):
    """An active operational alert."""
    type: AlertType = Field(..., description="Type of alert")
    message: str = Field(..., description="Alert message content")
    severity: Severity = Field(..., description="Alert severity")
    issued_by: str = Field(..., description="Authority that issued the alert")
    valid_until: str = Field(..., description="Alert validity period")


# ---------------------------------------------------------------------------
# Aggregate Models
# ---------------------------------------------------------------------------

class DailyBriefData(BaseModel):
    """
    Complete data payload for a single daily operational brief.

    This is the aggregate model that the service layer assembles
    and the tool layer passes to the LLM for generation.
    """
    station_info: StationInfo
    overnight_incidents: list[OvernightIncident]
    active_cases: list[CaseStatus]
    repeat_offenders: list[RepeatOffender]
    crime_trends: list[CrimeTrend]
    alerts: list[Alert]


class DailyBriefResponse(BaseModel):
    """
    Final API response returned to the client.

    Contains the AI-generated brief text plus metadata
    for audit and traceability.
    """
    brief: str = Field(..., description="AI-generated operational brief text")
    station_name: str = Field(..., description="Station the brief was generated for")
    generated_at: datetime = Field(..., description="Timestamp of generation")
    model_used: str = Field(..., description="LLM model that generated the brief")
    data_source: str = Field(
        "mock",
        description="Data source: 'mock' or 'database'"
    )
