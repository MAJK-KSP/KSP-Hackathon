"""
Text-to-Audio Synthesis API Routes — HTTP contract for text-to-speech conversion.

Sends synthesis requests to Zoho Catalyst Zia Text-to-Audio Synthesis API.
"""

import logging
from typing import Literal
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field, validator
import httpx

from config import settings
from llm.quickml_client import get_zoho_token

logger = logging.getLogger("uvicorn.error")

router = APIRouter(tags=["Audio Synthesis"])


class SynthesizeRequest(BaseModel):
    """Request schema for text-to-audio synthesis."""
    text: str = Field(..., description="The input text to synthesize into speech.")
    language: str = Field("English", description="Language selection: English, Hindi, or Kannada (or en, hi, kn).")
    speaker: str = Field("female", description="Speaker configuration/voice identifier.")
    emotion: str = Field("neutral", description="Emotion parameter: neutral, happy, sad, angry.")

    @validator("language")
    def validate_language(cls, v: str) -> str:
        v_str = str(v).strip()
        allowed = ["English", "Hindi", "Kannada", "en", "hi", "kn"]
        if v_str not in allowed:
            v_lower = v_str.lower()
            mapping = {
                "english": "English",
                "hindi": "Hindi",
                "kannada": "Kannada",
                "en": "English",
                "hi": "Hindi",
                "kn": "Kannada"
            }
            if v_lower in mapping:
                return mapping[v_lower]
            raise ValueError(f"Language must be one of English, Hindi, or Kannada (or en, hi, kn). Got: '{v}'")
        code_map = {"en": "English", "hi": "Hindi", "kn": "Kannada"}
        return code_map.get(v_str, v_str)

    @validator("emotion")
    def validate_emotion(cls, v: str) -> str:
        v_lower = str(v).strip().lower()
        allowed = ["neutral", "happy", "sad", "angry"]
        if v_lower not in allowed:
            raise ValueError(f"Emotion must be one of: {', '.join(allowed)}. Got: '{v}'")
        return v_lower


@router.post(
    "/synthesize",
    summary="Synthesize text to audio using Zoho Catalyst Zia TTS",
    description="Dynamically passes input text, language (English, Hindi, Kannada), speaker configuration, and emotion parameters into Zoho Zia TTS API."
)
@router.post(
    "/tts/synthesize",
    include_in_schema=False
)
async def synthesize_text(request: SynthesizeRequest):
    """
    HTTP handler for text-to-audio synthesis.
    
    Dynamically constructs request payload with text, language, speaker, and emotion,
    authenticates using Zoho OAuth access token, and forwards to Zoho Catalyst Zia TTS endpoint.
    """
    try:
        # 1. Fetch valid Zoho OAuth access token
        try:
            token = await get_zoho_token()
        except Exception as e:
            logger.error(f"[Synthesize] Error fetching Zoho token: {e}")
            token = settings.zoho_access_token

        if not token:
            logger.error("[Synthesize] Zoho Catalyst token is not available.")
            raise HTTPException(status_code=503, detail="Zoho Catalyst token is not available.")

        # 2. Setup endpoint URL and required headers
        url = getattr(settings, "zia_tts_endpoint_url", "https://api.catalyst.zoho.in/quickml/api/v1/models/zia/tts/synthesize")
        catalyst_org = getattr(settings, "catalyst_org", "80076334355") or "80076334355"

        headers = {
            "Content-Type": "application/json",
            "CATALYST-ORG": catalyst_org,
            "Authorization": f"Zoho-oauthtoken {token}"
        }

        # 3. Construct JSON body with dynamic parameters
        payload = {
            "text": request.text,
            "language": request.language,
            "speaker": request.speaker,
            "emotion": request.emotion
        }

        logger.info(
            f"[Synthesize] Sending TTS request to Zoho Zia endpoint: {url}. "
            f"Lang: {request.language}, Speaker: {request.speaker}, Emotion: {request.emotion}"
        )

        # 4. Dispatch request to Zoho Catalyst Zia API
        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.post(url, headers=headers, json=payload, timeout=30.0)

            logger.info(f"[Synthesize] Zoho Zia TTS API status code: {resp.status_code}")

            if resp.status_code == 200:
                content_type = resp.headers.get("content-type", "")
                if "application/json" in content_type:
                    return resp.json()
                else:
                    return Response(
                        content=resp.content,
                        media_type=content_type or "audio/wav"
                    )
            elif resp.status_code == 400:
                resp_text = resp.text
                logger.error(f"[Synthesize] Zoho Zia API Validation error 400: {resp_text}")
                return {
                    "success": False,
                    "error": f"Validation error from Zoho Zia TTS: {resp_text}"
                }
            else:
                logger.error(f"[Synthesize] Zoho Zia API responded with HTTP {resp.status_code}: {resp.text}")
                raise HTTPException(
                    status_code=resp.status_code,
                    detail=f"Zoho Zia TTS synthesis error: {resp.text}"
                )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Synthesize] Failed to synthesize text to audio: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal audio synthesis service error: {str(e)}"
        )
