"""
Zoho Catalyst QuickML Zia Text Translation API Integration.
Endpoint: https://api.catalyst.zoho.in/quickml/api/v1/models/zia/translate
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
    Translates text using Zoho Catalyst QuickML Zia Translate, then LLM fallback.
    """
    if not req.text or not req.text.strip():
        return {"translated_text": "", "target_language": req.target_language}

    target_lang = LANGUAGE_MAP.get(req.target_language.lower(), req.target_language.lower())
    lang_name = LANGUAGE_NAMES.get(target_lang, target_lang)

    # Truncate to avoid token limits
    text = req.text.strip()[:1500]

    token = await get_zoho_token()
    catalyst_org = getattr(settings, "catalyst_org", "80076334355") or "80076334355"

    # ─── Attempt 1: Zoho Zia Translate API ───
    zia_url = "https://api.catalyst.zoho.in/quickml/api/v1/models/zia/translate"
    headers = {
        "Content-Type": "application/json",
        "CATALYST-ORG": catalyst_org,
        "Authorization": f"Zoho-oauthtoken {token}",
    }

    # Try the most likely payload format first
    payload = {"text": text, "target_language": target_lang}
    try:
        async with httpx.AsyncClient(verify=False, timeout=5.0) as client:
            resp = await client.post(zia_url, headers=headers, json=payload)
            logger.info(f"[Translate] Zia API status={resp.status_code}, body={resp.text[:300]}")

            if resp.status_code == 200:
                data = resp.json()
                translated = (
                    data.get("translated_text")
                    or data.get("result")
                    or data.get("translation")
                    or data.get("output")
                    or (isinstance(data.get("data"), dict) and data["data"].get("translated_text"))
                )
                if translated and translated.strip() != text:
                    logger.info(f"[Translate] Zia Translate succeeded -> {target_lang}")
                    return {
                        "translated_text": translated,
                        "target_language": target_lang,
                        "provider": "zoho_zia_translate",
                    }
                else:
                    logger.warning(f"[Translate] Zia returned same text or empty. Falling back.")
            else:
                logger.warning(f"[Translate] Zia HTTP {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.warning(f"[Translate] Zia Translate API error: {e}")

    # ─── Attempt 2: Zoho QuickML LLM translation ───
    try:
        quickml_url = settings.quickml_endpoint_url
        prompt = (
            f"Translate the following English text into {lang_name} ({target_lang}). "
            f"Output ONLY the translated text. No explanations, no English, no commentary.\n\n"
            f"{text}"
        )
        llm_payload = {
            "prompt": prompt,
            "model": "VL-Qwen3.6-35B-A3B",
            "images": ["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="],
            "system_prompt": f"You are a professional translator. Translate text accurately into {lang_name}. Output only the translation.",
            "temperature": 0.3,
            "max_tokens": 1024,
        }

        async with httpx.AsyncClient(verify=False, timeout=20.0) as client:
            resp = await client.post(quickml_url, headers=headers, json=llm_payload)
            logger.info(f"[Translate] QuickML LLM status={resp.status_code}, body={resp.text[:300]}")

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
                    # Remove markdown/commentary wrapping if present
                    for prefix in ["```", "Translation:", "Translated text:", f"{lang_name}:"]:
                        if generated.lower().startswith(prefix.lower()):
                            generated = generated[len(prefix):].strip()
                    generated = generated.rstrip("`").strip()

                    if generated and generated != text:
                        logger.info(f"[Translate] QuickML LLM translation succeeded -> {target_lang}")
                        return {
                            "translated_text": generated,
                            "target_language": target_lang,
                            "provider": "zoho_quickml_llm",
                        }
    except Exception as e:
        logger.error(f"[Translate] QuickML LLM fallback error: {e}")

    # ─── Fallback: return original text ───
    logger.error(f"[Translate] All translation attempts failed for target={target_lang}")
    return {
        "translated_text": text,
        "target_language": target_lang,
        "provider": "fallback_original",
    }
