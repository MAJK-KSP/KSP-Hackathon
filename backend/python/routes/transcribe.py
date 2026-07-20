"""
Transcription API Routes — HTTP contract for audio-to-text conversion.
Sends audio files to Zoho Zia speech recognition service.
"""

import base64
import logging
import asyncio
import subprocess
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx

from config import settings
from llm.quickml_client import get_zoho_token

logger = logging.getLogger("uvicorn.error")

router = APIRouter(tags=["Transcription"])

class TranscribeRequest(BaseModel):
    audio: str  # Base64 encoded audio bytes
    language: str = "en"  # "en", "hi", or "kn"
    mimeType: str = "audio/wav"  # MIME type of the recorded blob

def transcode_to_wav_sync(audio_bytes: bytes) -> bytes:
    """
    Transcodes any input audio bytes (WebM, MP4, MP3, etc.) to 16kHz PCM WAV format using FFmpeg.
    Synchronous implementation to avoid Windows SelectorEventLoop NotImplementedError.
    """
    cmd = [
        "ffmpeg",
        "-y",                     # Overwrite output files without asking
        "-i", "pipe:0",           # Read input from stdin
        "-f", "wav",              # Output format WAV
        "-acodec", "pcm_s16le",   # PCM 16-bit
        "-ar", "16000",           # 16kHz sample rate
        "-ac", "1",               # 1 channel (mono)
        "pipe:1"                  # Write output to stdout
    ]
    
    try:
        result = subprocess.run(
            cmd,
            input=audio_bytes,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=10.0            # Enforce a 10 second timeout on transcoding
        )
    except subprocess.TimeoutExpired:
        logger.error("FFmpeg transcoding timed out after 10 seconds.")
        return audio_bytes
    except Exception as e:
        logger.exception("FFmpeg process execution failed")
        return audio_bytes
    
    if result.returncode != 0:
        logger.error(f"FFmpeg transcoding failed (exit code {result.returncode}): {result.stderr.decode('utf-8', errors='ignore')}")
        # If transcoding fails, fallback to original bytes to be safe
        return audio_bytes
        
    return result.stdout

async def transcode_to_wav(audio_bytes: bytes) -> bytes:
    # Run the synchronous transcoding function in a worker thread to prevent blocking the event loop
    return await asyncio.to_thread(transcode_to_wav_sync, audio_bytes)

@router.post(
    "/transcribe",
    summary="Transcribe audio recording to text",
    description="Decodes base64 audio and transcribes it using Zoho Zia speech recognition API."
)
async def transcribe_audio(request: TranscribeRequest):
    try:
        # Decode base64 audio bytes
        try:
            audio_bytes = base64.b64decode(request.audio)
            logger.info(f"[Transcribe] Decoded base64 audio payload. Size: {len(audio_bytes)} bytes.")
        except Exception as e:
            logger.error(f"[Transcribe] Failed to decode base64 audio: {e}")
            raise HTTPException(status_code=400, detail=f"Invalid base64 audio payload: {str(e)}")
        
        # Transcode WebM/MP4 to WAV format using FFmpeg
        try:
            logger.info(f"[Transcribe] Starting WAV transcoding for input format: {request.mimeType}")
            audio_bytes = await transcode_to_wav(audio_bytes)
            logger.info(f"[Transcribe] Transcoding completed. Result size: {len(audio_bytes)} bytes.")
        except Exception as e:
            logger.error(f"[Transcribe] Error transcoding audio to WAV: {e}")
        
        # Retrieve fresh Zoho Access Token
        try:
            token = await get_zoho_token()
        except Exception as e:
            logger.error(f"[Transcribe] Error fetching Zoho token for transcription: {e}")
            token = settings.zoho_access_token # fallback to static token
            
        if not token:
            logger.error("[Transcribe] Zoho Catalyst token is not available.")
            raise HTTPException(status_code=503, detail="Zoho Catalyst token is not available.")
            
        url = "https://api.catalyst.zoho.in/quickml/api/v1/models/zia/audio/transcribe"
        headers = {
            "CATALYST-ORG": settings.catalyst_org,
            "Authorization": f"Zoho-oauthtoken {token}"
        }
        
        files = {
            "file": ("audio.wav", audio_bytes, "audio/wav")
        }
        data = {
            "language": request.language
        }
        
        # Send post request to Zoho QuickML Zia API
        # Bypassing SSL verify for robustness under development cert configs
        logger.info(f"[Transcribe] Sending audio file to Zoho Zia. Language: {request.language}")
        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.post(url, headers=headers, data=data, files=files, timeout=30.0)
            
            logger.info(f"[Transcribe] Zoho Zia API responded with status: {resp.status_code}")
            if resp.status_code == 200:
                res_data = resp.json()
                logger.info(f"[Transcribe] Zoho Zia response: {res_data}")
                if res_data.get("status") == "success":
                    return {
                        "success": True,
                        "text": res_data.get("text"),
                        "language": res_data.get("language")
                    }
                else:
                    logger.error(f"[Transcribe] Zoho Zia audio transcription failed: {res_data}")
                    return {
                        "success": False,
                        "error": res_data.get("message") or "Unknown error from Zoho Zia"
                    }
            elif resp.status_code == 400:
                res_text = resp.text
                logger.error(f"[Transcribe] Zoho Zia API Validation error 400: {res_text}")
                return {
                    "success": False,
                    "error": f"Validation error from Zoho Zia: {res_text}"
                }
            else:
                logger.error(f"[Transcribe] Zoho Zia API responded with HTTP {resp.status_code}: {resp.text}")
                raise HTTPException(status_code=resp.status_code, detail=f"Zoho Zia transcription error: {resp.text}")
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Transcribe] Failed to transcribe audio: {e}")
        raise HTTPException(status_code=500, detail=f"Internal transcription service error: {str(e)}")
