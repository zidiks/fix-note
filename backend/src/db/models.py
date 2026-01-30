from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from uuid import UUID


class User(BaseModel):
    """User model."""
    id: UUID
    telegram_id: int
    username: Optional[str] = None
    first_name: Optional[str] = None
    language_code: str = "ru"
    created_at: datetime
    updated_at: datetime


class UserCreate(BaseModel):
    """User creation model."""
    telegram_id: int
    username: Optional[str] = None
    first_name: Optional[str] = None
    language_code: str = "ru"


class Note(BaseModel):
    """Note model."""
    id: UUID
    user_id: UUID
    content: str
    summary: Optional[str] = None
    source: str = "text"  # 'voice' | 'text'
    duration_seconds: Optional[int] = None
    share_token: Optional[str] = None
    is_public: bool = False
    created_at: datetime
    updated_at: datetime


class PublicNote(BaseModel):
    """Public note model (limited fields)."""
    id: UUID
    content: str
    summary: Optional[str] = None
    source: str = "text"
    duration_seconds: Optional[int] = None
    created_at: datetime


class NoteCreate(BaseModel):
    """Note creation model."""
    content: str
    summary: Optional[str] = None
    source: str = "text"
    duration_seconds: Optional[int] = None


class NoteUpdate(BaseModel):
    """Note update model."""
    content: Optional[str] = None
    summary: Optional[str] = None


class SearchQuery(BaseModel):
    """Search query model."""
    query: str
    limit: int = Field(default=5, ge=1, le=20)


class SearchResult(BaseModel):
    """Search result model."""
    id: UUID
    content: str
    summary: Optional[str] = None
    similarity: float
    created_at: datetime


class FTSSearchResult(BaseModel):
    """Full-text search result model."""
    id: UUID
    content: str
    summary: Optional[str] = None
    source: str = "text"
    duration_seconds: Optional[int] = None
    created_at: datetime
    rank: float


class ShareResponse(BaseModel):
    """Share link response."""
    share_url: str
    share_token: str
    is_public: bool


class NoteWithHighlight(Note):
    """Note with search relevance."""
    similarity: Optional[float] = None


class StatsResponse(BaseModel):
    """Statistics response model."""
    total_notes: int
    voice_notes: int
    text_notes: int
    notes_this_week: int
    notes_this_month: int


