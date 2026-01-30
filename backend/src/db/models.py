from datetime import datetime
from typing import Optional, List, Literal
from pydantic import BaseModel, Field
from uuid import UUID


SubscriptionPlan = Literal["free", "trial", "pro", "ultra"]
BillingPeriod = Literal["monthly", "yearly"]


class User(BaseModel):
    """User model."""
    id: UUID
    telegram_id: int
    username: Optional[str] = None
    first_name: Optional[str] = None
    language_code: str = "ru"
    subscription_plan: SubscriptionPlan = "trial"
    subscription_started_at: Optional[datetime] = None
    subscription_expires_at: Optional[datetime] = None
    trial_started_at: Optional[datetime] = None
    trial_ends_at: Optional[datetime] = None
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


class SubscriptionLimits(BaseModel):
    """Subscription limits model."""
    summaries_per_month: Optional[int] = None
    voice_minutes_per_month: Optional[int] = None
    ai_chat_enabled: bool = False
    ai_chat_fast: bool = False
    sync_enabled: bool = False
    auto_sync: bool = False
    price_monthly_stars: int = 0
    price_yearly_stars: int = 0


class UsageStats(BaseModel):
    """Usage statistics model."""
    summaries_used: int = 0
    voice_seconds_used: int = 0
    chat_messages_used: int = 0


class SubscriptionInfo(BaseModel):
    """Subscription info response model."""
    plan: SubscriptionPlan
    subscription_started_at: Optional[datetime] = None
    subscription_expires_at: Optional[datetime] = None
    trial_started_at: Optional[datetime] = None
    trial_ends_at: Optional[datetime] = None
    limits: SubscriptionLimits
    usage: UsageStats


class InvoiceRequest(BaseModel):
    """Invoice creation request."""
    plan: Literal["pro", "ultra"]
    billing_period: BillingPeriod


class InvoiceResponse(BaseModel):
    """Invoice response model."""
    invoice_link: str
    plan: str
    billing_period: str
    amount: int


class LanguageUpdate(BaseModel):
    """Language update request."""
    language: str


