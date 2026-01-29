import httpx
import logging
from pathlib import Path
from typing import Optional

from ..config import settings

logger = logging.getLogger(__name__)


class TranscriptionService:
    """Service for transcribing audio files using Whisper API."""
    
    def __init__(self):
        self.api_url = settings.whisper_api_url
        self.timeout = httpx.Timeout(120.0, connect=10.0)
    
    async def transcribe(self, audio_path: str, language: str = "ru") -> Optional[str]:
        """
        Transcribe audio file to text.
        
        Args:
            audio_path: Path to the audio file
            language: Language code for transcription
            
        Returns:
            Transcribed text or None if failed
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                with open(audio_path, "rb") as audio_file:
                    files = {
                        "audio_file": (Path(audio_path).name, audio_file, "audio/ogg")
                    }
                    params = {
                        "language": language,
                        "output": "txt"
                    }
                    
                    response = await client.post(
                        f"{self.api_url}/asr",
                        files=files,
                        params=params
                    )
                    
                    if response.status_code == 200:
                        text = response.text.strip()
                        logger.info(f"Transcription successful: {len(text)} chars")
                        return text
                    else:
                        logger.error(f"Transcription failed: {response.status_code} - {response.text}")
                        return None
                        
        except httpx.TimeoutException:
            logger.error("Transcription timeout")
            return None
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return None
    
    async def transcribe_bytes(self, audio_data: bytes, filename: str = "audio.ogg",
                                language: str = "ru") -> Optional[str]:
        """
        Transcribe audio from bytes.
        
        Args:
            audio_data: Audio file bytes
            filename: Filename for the upload
            language: Language code for transcription
            
        Returns:
            Transcribed text or None if failed
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                files = {
                    "audio_file": (filename, audio_data, "audio/ogg")
                }
                params = {
                    "language": language,
                    "output": "txt"
                }
                
                response = await client.post(
                    f"{self.api_url}/asr",
                    files=files,
                    params=params
                )
                
                if response.status_code == 200:
                    text = response.text.strip()
                    logger.info(f"Transcription successful: {len(text)} chars")
                    return text
                else:
                    logger.error(f"Transcription failed: {response.status_code} - {response.text}")
                    return None
                    
        except httpx.TimeoutException:
            logger.error("Transcription timeout")
            return None
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return None
    
    async def health_check(self) -> bool:
        """Check if Whisper service is available."""
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
                response = await client.get(f"{self.api_url}/")
                return response.status_code == 200
        except Exception:
            return False


