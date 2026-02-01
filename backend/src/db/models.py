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


# ==================== Sync Models ====================

IntegrationProvider = Literal["notion", "obsidian", "anytype"]
SyncMode = Literal["two_way", "app_to_external", "external_to_app"]
SyncStatus = Literal["pending", "syncing", "synced", "error", "conflict"]


class IntegrationConnection(BaseModel):
    """Integration connection model."""
    id: UUID
    user_id: UUID
    provider: IntegrationProvider
    is_active: bool = True
    workspace_id: Optional[str] = None
    workspace_name: Optional[str] = None
    database_id: Optional[str] = None
    database_name: Optional[str] = None
    sync_mode: SyncMode = "two_way"
    auto_sync_enabled: bool = False
    last_sync_at: Optional[datetime] = None
    last_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class IntegrationConnectionPublic(BaseModel):
    """Public integration info (no tokens)."""
    id: UUID
    provider: IntegrationProvider
    is_active: bool
    workspace_name: Optional[str] = None
    database_id: Optional[str] = None
    database_name: Optional[str] = None
    sync_mode: SyncMode
    auto_sync_enabled: bool
    last_sync_at: Optional[datetime] = None
    last_error: Optional[str] = None


class NoteSyncStatus(BaseModel):
    """Note sync status model."""
    id: UUID
    note_id: UUID
    integration_id: UUID
    external_id: Optional[str] = None
    external_url: Optional[str] = None
    sync_status: SyncStatus = "pending"
    local_version: int = 1
    external_version: int = 0
    last_synced_at: Optional[datetime] = None
    last_error: Optional[str] = None


class SyncHistoryEntry(BaseModel):
    """Sync history entry model."""
    id: UUID
    user_id: UUID
    integration_id: Optional[UUID] = None
    note_id: Optional[UUID] = None
    operation: str
    direction: str
    status: str
    details: Optional[dict] = None
    error_message: Optional[str] = None
    created_at: datetime


# Request/Response models for sync API

class NotionOAuthStartResponse(BaseModel):
    """Response for starting Notion OAuth."""
    authorization_url: str


class NotionOAuthCallbackRequest(BaseModel):
    """Request for Notion OAuth callback."""
    code: str
    state: str


class NotionOAuthCallbackResponse(BaseModel):
    """Response for Notion OAuth callback."""
    success: bool
    integration: Optional[IntegrationConnectionPublic] = None
    has_database: bool = False
    available_databases: Optional[List[dict]] = None


class SetNotionDatabaseRequest(BaseModel):
    """Request to set Notion database."""
    database_id: str


class UpdateSyncSettingsRequest(BaseModel):
    """Request to update sync settings."""
    sync_mode: Optional[SyncMode] = None
    auto_sync_enabled: Optional[bool] = None


class SyncNoteRequest(BaseModel):
    """Request to sync a single note."""
    force: bool = False


class SyncNoteResponse(BaseModel):
    """Response for note sync operation."""
    status: str
    operation: Optional[str] = None
    external_id: Optional[str] = None
    external_url: Optional[str] = None
    reason: Optional[str] = None
    error: Optional[str] = None


class SyncAllResponse(BaseModel):
    """Response for syncing all notes."""
    synced: int
    failed: int
    skipped: int
    errors: List[dict] = []


class ResolveConflictRequest(BaseModel):
    """Request to resolve a sync conflict."""
    resolution: Literal["keep_local", "keep_external", "keep_both"]


class IntegrationsListResponse(BaseModel):
    """Response with list of integrations."""
    integrations: List[IntegrationConnectionPublic]
    available_providers: List[dict]


class SyncHistoryResponse(BaseModel):
    """Response with sync history."""
    history: List[SyncHistoryEntry]
    total: int


