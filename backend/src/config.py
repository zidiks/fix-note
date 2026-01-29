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
    
    # Whisper
    whisper_api_url: str = "http://whisper:9000"
    
    # Server
    api_port: int = 8000
    public_url: str = ""  # For Mini App WebApp URL
    
    @property
    def allowed_user_ids_list(self) -> List[int]:
        """Parse allowed_user_ids as a list of integers."""
        if not self.allowed_user_ids:
            return []
        try:
            return [int(uid.strip()) for uid in self.allowed_user_ids.split(",") if uid.strip()]
        except ValueError:
            return []
    
    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
