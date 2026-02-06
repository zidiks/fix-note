import base64
from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List, Optional


class Settings(BaseSettings):
    # Telegram
    telegram_bot_token: str
    allowed_user_ids: str = ""  # Comma-separated list or empty
    
    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_key: str
    
    # AI Services
    deepseek_api_key: str
    deepseek_api_url: str = "https://api.deepseek.com"
    openai_api_key: str  # For embeddings

    # Notes encryption
    notes_master_key: str
    notes_master_key_version: int = 1
    
    # Whisper
    whisper_api_url: str = "http://whisper:9000"
    
    # Server
    api_port: int = 8000
    public_url: str = ""  # For Mini App WebApp URL
    
    # Notion OAuth (optional - for sync feature)
    notion_client_id: str = ""
    notion_client_secret: str = ""
    notion_redirect_uri: str = ""  # e.g., https://your-app.com/api/sync/notion/callback
    
    @property
    def allowed_user_ids_list(self) -> List[int]:
        """Parse allowed_user_ids as a list of integers."""
        if not self.allowed_user_ids:
            return []
        try:
            return [int(uid.strip()) for uid in self.allowed_user_ids.split(",") if uid.strip()]
        except ValueError:
            return []

    @property
    def notes_master_key_bytes(self) -> bytes:
        return base64.b64decode(self.notes_master_key)

    @field_validator("notes_master_key")
    @classmethod
    def validate_notes_master_key(cls, v: str) -> str:
        try:
            raw = base64.b64decode(v)
        except Exception as exc:
            raise ValueError("NOTES_MASTER_KEY must be valid base64") from exc
        if len(raw) != 32:
            raise ValueError("NOTES_MASTER_KEY must decode to 32 bytes")
        return v
    
    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
