"""
Zoho Catalyst QuickML & Zia Multilingual Text Translation API Integration.
Supported Languages: English, Hindi, Kannada, Tamil, Telugu, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Odia.
"""

from fastapi import APIRouter
from pydantic import BaseModel
import httpx
import json
import logging
from config import settings
from llm.quickml_client import get_zoho_token

router = APIRouter(prefix="/translate", tags=["Text Translation"])
logger = logging.getLogger("uvicorn.error")

LANGUAGE_MAP = {
    "kannada": "kn", "kn": "kn",
    "hindi": "hi", "hi": "hi",
    "english": "en", "en": "en",
    "tamil": "ta", "ta": "ta",
    "telugu": "te", "te": "te",
    "malayalam": "ml", "ml": "ml",
    "marathi": "mr", "mr": "mr",
    "bengali": "bn", "bn": "bn",
    "gujarati": "gu", "gu": "gu",
    "punjabi": "pa", "pa": "pa",
    "odia": "or", "or": "or",
}

LANGUAGE_NAMES = {
    "kn": "Kannada", "hi": "Hindi", "en": "English", "ta": "Tamil",
    "te": "Telugu", "ml": "Malayalam", "mr": "Marathi", "bn": "Bengali",
    "gu": "Gujarati", "pa": "Punjabi", "or": "Odia",
}


class TranslationRequest(BaseModel):
    text: str
    target_language: str = "kn"
    source_language: str = "auto"


@router.post("")
async def translate_text(req: TranslationRequest):
    """
    Translates text using Zoho Catalyst QuickML LLM Translation with bidirectional language support.
    """
    if not req.text or not req.text.strip():
        return {"translated_text": "", "target_language": req.target_language}

    target_lang = LANGUAGE_MAP.get(req.target_language.lower(), req.target_language.lower())
    lang_name = LANGUAGE_NAMES.get(target_lang, target_lang)

    text = req.text.strip()[:1500]

    token = await get_zoho_token()
    catalyst_org = settings.catalyst_org or "60076334355"

    headers = {
        "Content-Type": "application/json",
        "CATALYST-ORG": catalyst_org,
        "Authorization": f"Zoho-oauthtoken {token}",
    }

    quickml_url = settings.quickml_endpoint_url

    if target_lang == "en":
        prompt = (
            f"Translate the following Kannada / Indic text accurately into clear, natural English.\n"
            f"Output ONLY the translated English text. Do NOT output Kannada script or commentary.\n\n"
            f"{text}"
        )
        sys_prompt = "You are an expert official police translator. Translate Kannada and Indic texts into clear English. Output only the translation."
    else:
        prompt = (
            f"Translate the following text accurately into {lang_name} ({target_lang}).\n"
            f"Output ONLY the translated text in {lang_name}. No explanations, no commentary.\n\n"
            f"{text}"
        )
        sys_prompt = f"You are a professional translator. Translate text accurately into {lang_name}. Output only the translation."

    llm_payload = {
        "prompt": prompt,
        "model": "VL-Qwen3.6-35B-A3B",
        "images": ["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="],
        "system_prompt": sys_prompt,
        "temperature": 0.3,
        "max_tokens": 1024,
    }

    try:
        async with httpx.AsyncClient(verify=False, timeout=20.0) as client:
            resp = await client.post(quickml_url, headers=headers, json=llm_payload)
            logger.info(f"[Translate] QuickML LLM status={resp.status_code}")

            if resp.status_code == 200:
                data = resp.json()
                generated = (
                    data.get("response")
                    or data.get("output")
                    or data.get("result")
                    or data.get("generated_text")
                    or ""
                )
                if isinstance(generated, str):
                    generated = generated.strip()
                    for prefix in ["```", "Translation:", "Translated text:", f"{lang_name}:"]:
                        if generated.lower().startswith(prefix.lower()):
                            generated = generated[len(prefix):].strip()
                    generated = generated.rstrip("`").strip()

                    if generated:
                        logger.info(f"[Translate] Translation succeeded -> {target_lang}")
                        return {
                            "translated_text": generated,
                            "target_language": target_lang,
                            "provider": "zoho_quickml_llm",
                        }
    except Exception as e:
        logger.error(f"[Translate] QuickML translation error: {e}")

    return {
        "translated_text": text,
        "target_language": target_lang,
        "provider": "fallback_original",
    }
