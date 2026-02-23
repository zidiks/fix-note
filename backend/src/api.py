import logging
import hashlib
import hmac
from urllib.parse import parse_qs
from typing import Optional, List
from uuid import UUID
import uuid

import jwt as pyjwt
from fastapi import APIRouter, HTTPException, Depends, Header, Query, BackgroundTasks, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

from .config import settings
from .db.models import (
    Note, NoteCreate, NoteUpdate, SearchQuery, SearchResult, StatsResponse, 
    PublicNote, FTSSearchResult, ShareResponse, SubscriptionInfo, SubscriptionLimits,
    UsageStats, InvoiceRequest, InvoiceResponse, CancelSubscriptionResponse, LanguageUpdate,
    # Sync models
    IntegrationConnectionPublic, NoteSyncStatus, SyncHistoryEntry,
    NotionOAuthStartResponse, NotionOAuthCallbackRequest, NotionOAuthCallbackResponse,
    SetNotionDatabaseRequest, UpdateSyncSettingsRequest, SyncNoteRequest,
    SyncNoteResponse, SyncAllResponse, ResolveConflictRequest,
    IntegrationsListResponse, SyncHistoryResponse, IntegrationProvider, SyncMode
)
from .services.notes_service import NotesService
from .services.rag_service import RAGService
from .services.sync_service import SyncService, NotionClient

logger = logging.getLogger(__name__)

# Reference to bot (will be set from main.py)
_bot_instance = None

def set_bot_instance(bot):
    """Set bot instance for sending messages from API."""
    global _bot_instance
    _bot_instance = bot

# Create router instead of app
router = APIRouter(prefix="/api", tags=["api"])

# Services
notes_service = NotesService()
rag_service = RAGService()
sync_service = SyncService()


# Auto-sync trigger for Ultra users
async def trigger_auto_sync_for_note(user_id: str, note_id: str):
    """
    Trigger auto-sync for a specific note if user has auto_sync_enabled.
    Called as background task after note creation/update.
    """
    try:
        # Check if user has auto-sync enabled
        integration = await sync_service.get_integration(UUID(user_id), "notion")
        
        if not integration:
            return
        
        if not integration.get("is_active"):
            return
            
        if not integration.get("auto_sync_enabled"):
            return
            
        if not integration.get("database_id"):
            return
        
        # Sync this specific note
        logger.info(f"Auto-sync triggered for note {note_id} (user {user_id})")
        await sync_service.sync_note_to_notion(UUID(user_id), UUID(note_id), force=False)
        
    except Exception as e:
        logger.error(f"Auto-sync failed for note {note_id}: {e}")


# Archive note in Notion when deleted
async def archive_note_in_notion(user_id: str, note_id: str):
    """
    Archive the corresponding Notion page when a note is deleted.
    Called as background task after note deletion.
    """
    try:
        result = await sync_service.delete_note_from_notion(UUID(user_id), UUID(note_id))
        if result.get("status") == "success":
            logger.info(f"Note {note_id} archived in Notion")
    except Exception as e:
        logger.error(f"Failed to archive note {note_id} in Notion: {e}")


# Telegram WebApp auth
def validate_telegram_init_data(init_data: str) -> Optional[dict]:
    """
    Validate Telegram WebApp init data.
    
    Returns user data if valid, None otherwise.
    """
    if not init_data:
        return None
    
    try:
        # Parse init data
        parsed = parse_qs(init_data)
        
        # Get hash
        received_hash = parsed.get("hash", [None])[0]
        if not received_hash:
            return None
        
        # Build data check string
        data_check_arr = []
        for key, value in sorted(parsed.items()):
            if key != "hash":
                data_check_arr.append(f"{key}={value[0]}")
        data_check_string = "\n".join(data_check_arr)
        
        # Compute secret key
        secret_key = hmac.new(
            b"WebAppData",
            settings.telegram_bot_token.encode(),
            hashlib.sha256
        ).digest()
        
        # Compute hash
        computed_hash = hmac.new(
            secret_key,
            data_check_string.encode(),
            hashlib.sha256
        ).hexdigest()
        
        if computed_hash != received_hash:
            logger.warning("Invalid Telegram init data hash")
            return None
        
        # Extract user data
        import json
        user_data = parsed.get("user", [None])[0]
        if user_data:
            return json.loads(user_data)
        
        return None
        
    except Exception as e:
        logger.error(f"Init data validation error: {e}")
        return None


async def get_current_user(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
):
    """
    Dual-path authentication dependency.
    - Path 1: Telegram WebApp initData (existing Mini App) via X-Telegram-Init-Data header
    - Path 2: JWT Bearer token (native app) via Authorization: Bearer <token> header
    """
    # Path 1: Legacy Telegram WebApp (Mini App) - keep working unchanged
    if x_telegram_init_data:
        user_data = validate_telegram_init_data(x_telegram_init_data)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid Telegram init data")

        telegram_id = user_data.get("id")
        if not telegram_id:
            raise HTTPException(status_code=401, detail="Missing user ID")

        allowed_ids = settings.allowed_user_ids_list
        if allowed_ids and telegram_id not in allowed_ids:
            raise HTTPException(status_code=403, detail="Access denied")

        return await notes_service.get_or_create_user(
            telegram_id=telegram_id,
            username=user_data.get("username"),
            first_name=user_data.get("first_name"),
            language_code=user_data.get("language_code", "ru"),
        )

    # Path 2: JWT Bearer token (native app)
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        if not settings.jwt_secret:
            raise HTTPException(status_code=500, detail="JWT not configured")
        try:
            payload = pyjwt.decode(
                token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
            )
            user_id = UUID(payload["sub"])
            user = await notes_service.get_user_by_id(user_id)
            if not user:
                raise HTTPException(status_code=401, detail="User not found")
            return user
        except pyjwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except (pyjwt.InvalidTokenError, KeyError, ValueError):
            raise HTTPException(status_code=401, detail="Invalid token")

    raise HTTPException(status_code=401, detail="Authentication required")


# Response models
class NotesListResponse(BaseModel):
    notes: List[Note]
    total: int


class SearchResponse(BaseModel):
    results: List[SearchResult]
    query: str


class FTSSearchResponse(BaseModel):
    results: List[FTSSearchResult]
    query: str


class SharedNoteResponse(BaseModel):
    note: PublicNote
    is_owner: bool
    can_edit: bool


# API Routes
@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


@router.get("/notes", response_model=NotesListResponse)
async def get_notes(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user=Depends(get_current_user)
):
    """Get all notes for the current user."""
    notes = await notes_service.get_notes(user.id, limit=limit, offset=offset)
    
    # Get total count (simplified - could be optimized)
    all_notes = await notes_service.get_notes(user.id, limit=1000, offset=0)
    
    return NotesListResponse(notes=notes, total=len(all_notes))


@router.get("/notes/{note_id}", response_model=Note)
async def get_note(
    note_id: UUID,
    user=Depends(get_current_user)
):
    """Get a single note by ID."""
    note = await notes_service.get_note(note_id, user.id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


@router.post("/notes", response_model=Note)
async def create_note(
    note_data: NoteCreate,
    background_tasks: BackgroundTasks,
    user=Depends(get_current_user)
):
    """Create a new note."""
    note = await notes_service.create_note(user.id, note_data, user.language_code)
    
    # Index for RAG
    await rag_service.index_note(str(note.id), str(user.id), note.content)
    
    # Trigger auto-sync for Ultra users (in background)
    background_tasks.add_task(trigger_auto_sync_for_note, str(user.id), str(note.id))
    
    return note


@router.put("/notes/{note_id}", response_model=Note)
async def update_note(
    note_id: UUID,
    note_data: NoteUpdate,
    background_tasks: BackgroundTasks,
    user=Depends(get_current_user)
):
    """Update a note."""
    note = await notes_service.update_note(note_id, user.id, note_data, user.language_code)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # Re-index if content changed
    if note_data.content:
        await rag_service.index_note(str(note.id), str(user.id), note.content)
    
    # Trigger auto-sync for Ultra users (in background)
    background_tasks.add_task(trigger_auto_sync_for_note, str(user.id), str(note.id))
    
    return note


@router.delete("/notes/{note_id}")
async def delete_note(
    note_id: UUID,
    background_tasks: BackgroundTasks,
    user=Depends(get_current_user)
):
    """Delete a note (soft delete)."""
    deleted = await notes_service.delete_note(note_id, user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Note not found")

    # Cleanup vector entry (best-effort)
    await rag_service.delete_note(str(note_id), str(user.id))
    
    # Archive in Notion if synced (in background)
    background_tasks.add_task(archive_note_in_notion, str(user.id), str(note_id))
    
    return {"success": True}


@router.post("/notes/search", response_model=SearchResponse)
async def search_notes(
    search: SearchQuery,
    user=Depends(get_current_user)
):
    """Semantic search over notes."""
    # Check subscription for AI chat/search feature
    can_use, plan, reason = await notes_service.can_use_feature(user.id, "chat")
    if not can_use:
        raise HTTPException(
            status_code=403, 
            detail=f"AI search not available on {plan} plan. Please upgrade your subscription."
        )
    
    results = await rag_service.search(
        query=search.query,
        user_id=str(user.id),
        limit=search.limit
    )
    
    # Track usage
    await notes_service.increment_usage(user.id, "chat_messages", 1)
    
    return SearchResponse(results=results, query=search.query)


@router.get("/stats", response_model=StatsResponse)
async def get_stats(user=Depends(get_current_user)):
    """Get user statistics."""
    return await notes_service.get_stats(user.id)


# Full-text search (faster, no AI required)
@router.post("/notes/search/fts", response_model=FTSSearchResponse)
async def search_notes_fts(
    search: SearchQuery,
    user=Depends(get_current_user)
):
    """Full-text search over notes (PostgreSQL FTS)."""
    results = await notes_service.search_notes_fts(
        user_id=user.id,
        query=search.query,
        limit=search.limit
    )
    return FTSSearchResponse(results=results, query=search.query)


# Share functionality
@router.post("/notes/{note_id}/share", response_model=ShareResponse)
async def create_share_link(
    note_id: UUID,
    is_public: bool = Query(default=False, description="Make note publicly viewable"),
    user=Depends(get_current_user)
):
    """Generate a share link for a note."""
    try:
        result = await notes_service.generate_share_token(note_id, user.id, is_public)
        if not result:
            raise HTTPException(status_code=404, detail="Note not found")
        
        # Build share URL
        share_url = f"{settings.public_url}/note/{result['share_token']}"
        
        return ShareResponse(
            share_url=share_url,
            share_token=result['share_token'],
            is_public=result['is_public']
        )
    except Exception as e:
        logger.error(f"Error creating share link for note {note_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create share link: {str(e)}")


@router.delete("/notes/{note_id}/share")
async def revoke_share_link(
    note_id: UUID,
    user=Depends(get_current_user)
):
    """Revoke share link for a note."""
    success = await notes_service.revoke_share_token(note_id, user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"success": True}


# Trigger bot to send message when mini app closes
@router.post("/prompt-add-note")
async def prompt_add_note(user=Depends(get_current_user)):
    """Send a message to user prompting them to add a note."""
    if _bot_instance is None:
        raise HTTPException(status_code=503, detail="Bot not available")
    
    try:
        await _bot_instance.send_message(
            chat_id=user.telegram_id,
            text="✏️ Отправь мне голосовое или текстовое сообщение, и я сохраню его как заметку!"
        )
        return {"success": True}
    except Exception as e:
        logger.error(f"Failed to send prompt message: {e}")
        raise HTTPException(status_code=500, detail="Failed to send message")


# Public access to shared notes (no auth required)
@router.get("/shared/{share_token}", response_model=SharedNoteResponse)
async def get_shared_note(
    share_token: str,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data")
):
    """Get a shared note by token. Returns ownership info if authenticated."""
    result = await notes_service.get_note_by_share_token(share_token)
    if not result:
        raise HTTPException(status_code=404, detail="Note not found or link expired")
    
    note = result["note"]
    owner_telegram_id = result["owner_telegram_id"]
    
    # Check if current user is the owner
    is_owner = False
    can_edit = False
    
    if x_telegram_init_data:
        user_data = validate_telegram_init_data(x_telegram_init_data)
        if user_data:
            current_telegram_id = user_data.get("id")
            is_owner = current_telegram_id == owner_telegram_id
            can_edit = is_owner  # Only owner can edit
    
    # If not public and not owner, deny access
    if not note.is_public and not is_owner:
        raise HTTPException(status_code=403, detail="Access denied. This note is private.")
    
    # Return public note data
    public_note = PublicNote(
        id=note.id,
        content=note.content,
        title=note.title,
        summary=note.summary,
        source=note.source,
        duration_seconds=note.duration_seconds,
        images=getattr(note, "images", []) or [],
        voice_url=getattr(note, "voice_url", None),
        created_at=note.created_at
    )
    
    return SharedNoteResponse(
        note=public_note,
        is_owner=is_owner,
        can_edit=can_edit
    )


# Subscription endpoints
@router.get("/subscription", response_model=SubscriptionInfo)
async def get_subscription(user=Depends(get_current_user)):
    """Get user's subscription info."""
    subscription_info = await notes_service.get_subscription_info(user.id)
    return subscription_info


@router.post("/subscription/invoice", response_model=InvoiceResponse)
async def create_subscription_invoice(
    request: InvoiceRequest,
    user=Depends(get_current_user)
):
    """Create Telegram Stars invoice for subscription."""
    monthly_subscription_period = 30 * 24 * 60 * 60  # 2592000 (Bot API recurring requirement)
    fallback_pricing = {
        "pro": {"monthly": 350, "yearly": 3500},
        "ultra": {"monthly": 800, "yearly": 8000},
    }

    plan = request.plan
    period = request.billing_period
    amount = fallback_pricing[plan][period]

    # Prefer dynamic pricing from DB if available.
    limits = notes_service.client.table("subscription_limits").select(
        "price_monthly_stars, price_yearly_stars"
    ).eq("plan", plan).execute()
    if limits.data:
        monthly_price = limits.data[0].get("price_monthly_stars")
        yearly_price = limits.data[0].get("price_yearly_stars")
        if period == "monthly" and monthly_price:
            amount = int(monthly_price)
        if period == "yearly" and yearly_price:
            amount = int(yearly_price)

    try:
        # Create invoice payload
        if period == "monthly":
            title = f"FixNote {plan.title()} Monthly"
            description = f"Recurring {plan.title()} subscription (30 days, auto-renew)"
        else:
            title = f"FixNote {plan.title()} Yearly"
            description = f"{plan.title()} subscription billed yearly"

        # Generate unique payload for this purchase
        payload = f"sub:v1:{user.id}:{plan}:{period}:{uuid.uuid4().hex[:12]}"

        # Call Bot API directly to use newest fields even on older aiogram versions.
        bot_api_url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/createInvoiceLink"
        req_payload = {
            "title": title,
            "description": description,
            "payload": payload,
            "provider_token": "",
            "currency": "XTR",
            "prices": [{"label": title, "amount": amount}],
        }
        # Telegram Stars recurring subscriptions currently support 30-day period.
        if period == "monthly":
            req_payload["subscription_period"] = monthly_subscription_period

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(bot_api_url, json=req_payload)

        data = response.json() if response.content else {}
        if (not response.is_success) or (not data.get("ok")):
            error_description = data.get("description", "Unknown Telegram API error")
            raise HTTPException(
                status_code=502,
                detail=f"Failed to create recurring invoice: {error_description}",
            )

        invoice_link = data.get("result")
        if not invoice_link:
            raise HTTPException(status_code=502, detail="Telegram API returned empty invoice link")

        return InvoiceResponse(
            invoice_link=invoice_link,
            plan=plan,
            billing_period=period,
            amount=amount,
            subscription_period=monthly_subscription_period if period == "monthly" else None,
            is_recurring=period == "monthly",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create invoice: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create invoice: {str(e)}")


@router.post("/subscription/cancel", response_model=CancelSubscriptionResponse)
async def cancel_monthly_subscription(user=Depends(get_current_user)):
    """Cancel monthly Telegram Stars auto-renewal for current user."""
    subscription = await notes_service.get_subscription_info(user.id)

    if subscription.plan not in ("pro", "ultra"):
        raise HTTPException(status_code=400, detail="No active paid subscription to cancel")
    if subscription.billing_period != "monthly":
        raise HTTPException(status_code=400, detail="Only monthly subscriptions can be canceled")
    if subscription.is_canceled:
        return CancelSubscriptionResponse(
            success=True,
            is_canceled=True,
            subscription_expires_at=subscription.subscription_expires_at,
        )

    charge_id = await notes_service.get_latest_monthly_subscription_charge_id(user.id)
    if not charge_id:
        raise HTTPException(status_code=400, detail="Subscription charge ID not found")

    bot_api_url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/editUserStarSubscription"
    req_payload = {
        "user_id": user.telegram_id,
        "telegram_payment_charge_id": charge_id,
        "is_canceled": True,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(bot_api_url, json=req_payload)

        data = response.json() if response.content else {}
        if (not response.is_success) or (not data.get("ok")):
            error_description = data.get("description", "Unknown Telegram API error")
            raise HTTPException(
                status_code=502,
                detail=f"Failed to cancel subscription: {error_description}",
            )

        updated = await notes_service.mark_subscription_canceled(user.id)
        if not updated:
            raise HTTPException(status_code=500, detail="Failed to persist cancellation state")

        refreshed = await notes_service.get_subscription_info(user.id)
        return CancelSubscriptionResponse(
            success=True,
            is_canceled=True,
            subscription_expires_at=refreshed.subscription_expires_at,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to cancel subscription: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to cancel subscription: {str(e)}")


# ──────────────────────────────────────────────
# Native IAP verification endpoints
# ──────────────────────────────────────────────

class AppleIAPRequest(BaseModel):
    receipt_data: str
    product_id: str
    transaction_id: str


class GooglePlayRequest(BaseModel):
    purchase_token: str
    product_id: str
    order_id: str


class IAPVerifyResponse(BaseModel):
    success: bool
    plan: str
    billing_period: str
    subscription_expires_at: Optional[str]


@router.post("/subscription/apple-iap", response_model=IAPVerifyResponse)
async def verify_apple_iap(
    request: AppleIAPRequest,
    user=Depends(get_current_user),
):
    """Verify Apple App Store IAP receipt and activate subscription."""
    from .services.iap_service import IAPService
    iap_service = IAPService()
    try:
        update = await iap_service.verify_apple_receipt(
            receipt_data=request.receipt_data,
            product_id=request.product_id,
            transaction_id=request.transaction_id,
        )
        await notes_service.update_subscription_from_iap(user.id, update)
        return IAPVerifyResponse(
            success=True,
            plan=update.plan,
            billing_period=update.billing_period,
            subscription_expires_at=update.expires_at.isoformat() if update.expires_at else None,
        )
    except Exception as e:
        logger.error(f"Apple IAP verification failed: {e}")
        raise HTTPException(status_code=400, detail=f"IAP verification failed: {e}")


@router.post("/subscription/google-play", response_model=IAPVerifyResponse)
async def verify_google_play(
    request: GooglePlayRequest,
    user=Depends(get_current_user),
):
    """Verify Google Play Billing purchase token and activate subscription."""
    from .services.iap_service import IAPService
    iap_service = IAPService()
    try:
        update = await iap_service.verify_google_purchase(
            purchase_token=request.purchase_token,
            product_id=request.product_id,
            order_id=request.order_id,
        )
        await notes_service.update_subscription_from_iap(user.id, update)
        return IAPVerifyResponse(
            success=True,
            plan=update.plan,
            billing_period=update.billing_period,
            subscription_expires_at=update.expires_at.isoformat() if update.expires_at else None,
        )
    except Exception as e:
        logger.error(f"Google Play verification failed: {e}")
        raise HTTPException(status_code=400, detail=f"IAP verification failed: {e}")


# ──────────────────────────────────────────────
# Voice note upload endpoint (for native app)
# ──────────────────────────────────────────────

@router.post("/notes/voice", response_model=Note)
async def create_voice_note(
    audio_file: UploadFile = File(...),
    language: str = Form(default="ru"),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    user=Depends(get_current_user),
):
    """
    Upload audio file, transcribe it, and create a voice note.
    Used by the native app for in-app voice recording.
    """
    from .services.transcription import TranscriptionService
    from .services.summarizer import SummarizerService
    from .db.models import NoteCreate as NoteCreateModel

    # Check voice feature access
    subscription = await notes_service.get_subscription_info(user.id)
    if subscription.plan == "free":
        raise HTTPException(status_code=403, detail="Voice notes require Pro or Ultra plan")

    # Read audio bytes
    audio_bytes = await audio_file.read()
    if len(audio_bytes) == 0:
        raise HTTPException(status_code=422, detail="Empty audio file")

    # Transcribe
    transcription_service = TranscriptionService()
    text = await transcription_service.transcribe_bytes(
        audio_bytes,
        filename=audio_file.filename or "audio.m4a",
        language=language,
    )
    if not text or not text.strip():
        raise HTTPException(status_code=422, detail="Transcription returned empty result")

    # Summarize
    summarizer = SummarizerService()
    title, summary = await summarizer.summarize(text, language=language)

    # Create note
    note_data = NoteCreateModel(
        content=text,
        title=title,
        summary=summary,
        source="voice",
    )
    note = await notes_service.create_note(user.id, note_data, language)

    # Track usage + auto-sync
    await rag_service.index_note(str(note.id), str(user.id), note.content)
    background_tasks.add_task(trigger_auto_sync_for_note, str(user.id), str(note.id))

    return note


@router.put("/user/language")
async def update_user_language(
    request: LanguageUpdate,
    user=Depends(get_current_user)
):
    """Update user's language preference."""
    await notes_service.update_user_language(user.id, request.language)
    return {"success": True}


# ==================== Sync Endpoints ====================

# Available integrations for display
AVAILABLE_INTEGRATIONS = [
    {"provider": "notion", "name": "Notion", "available": True, "icon": "📝"},
    {"provider": "obsidian", "name": "Obsidian", "available": False, "icon": "🔮", "coming_soon": True},
    {"provider": "anytype", "name": "Anytype", "available": False, "icon": "🧊", "coming_soon": True},
]


@router.get("/sync/integrations", response_model=IntegrationsListResponse)
async def get_integrations(user=Depends(get_current_user)):
    """Get all integration connections for user."""
    integrations = await sync_service.get_user_integrations(user.id)
    
    public_integrations = []
    notion_needs_database = False
    notion_integration = None
    
    for intg in integrations:
        if intg.get("is_active"):
            public_integrations.append(IntegrationConnectionPublic(
                id=intg["id"],
                provider=intg["provider"],
                is_active=intg["is_active"],
                workspace_name=intg.get("workspace_name"),
                database_id=intg.get("database_id"),
                database_name=intg.get("database_name"),
                sync_mode=intg.get("sync_mode", "two_way"),
                auto_sync_enabled=intg.get("auto_sync_enabled", False),
                last_sync_at=intg.get("last_sync_at"),
                last_error=intg.get("last_error"),
            ))
            # Check if Notion needs database selection
            if intg.get("provider") == "notion" and not intg.get("database_id"):
                notion_needs_database = True
                notion_integration = intg
    
    # Build available providers with databases if needed
    available_providers = []
    for provider_info in AVAILABLE_INTEGRATIONS:
        provider_data = dict(provider_info)
        
        # If Notion is connected but needs database, fetch available databases
        if provider_data["provider"] == "notion" and notion_needs_database and notion_integration:
            try:
                notion_client = NotionClient(notion_integration["access_token"])
                databases = await notion_client.search_databases()
                provider_data["databases"] = [
                    {
                        "id": db["id"],
                        "name": db.get("title", [{}])[0].get("plain_text", "Untitled") if db.get("title") else "Untitled"
                    }
                    for db in databases
                ]
                provider_data["needs_database_selection"] = True
            except Exception as e:
                logger.warning(f"Failed to fetch Notion databases: {e}")
        
        available_providers.append(provider_data)
    
    return IntegrationsListResponse(
        integrations=public_integrations,
        available_providers=available_providers,
    )


@router.get("/sync/notion/auth", response_model=NotionOAuthStartResponse)
async def start_notion_oauth(user=Depends(get_current_user)):
    """Start Notion OAuth flow."""
    # Check if user has sync permission
    subscription = await notes_service.get_subscription_info(user.id)
    if not subscription.limits.sync_enabled:
        raise HTTPException(
            status_code=403, 
            detail="Sync feature requires Pro or Ultra subscription"
        )
    
    if not settings.notion_client_id:
        raise HTTPException(
            status_code=503,
            detail="Notion integration not configured"
        )
    
    redirect_uri = settings.notion_redirect_uri or f"{settings.public_url}/api/sync/notion/callback"
    auth_url = sync_service.get_notion_oauth_url(user.id, redirect_uri)
    
    return NotionOAuthStartResponse(authorization_url=auth_url)


@router.get("/sync/notion/callback")
async def notion_oauth_callback_redirect(
    code: str = Query(...),
    state: str = Query(default=""),
    error: Optional[str] = Query(default=None),
):
    """
    Handle Notion OAuth redirect (GET).
    Stores pending OAuth code in database and shows success page.
    """
    from fastapi.responses import HTMLResponse
    
    if error:
        # OAuth was denied or failed
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>FixNote - Error</title>
            <style>
                body {{
                    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                    color: white;
                    text-align: center;
                    padding: 20px;
                }}
                .container {{
                    max-width: 400px;
                }}
                .icon {{ font-size: 64px; margin-bottom: 20px; }}
                h1 {{ font-size: 24px; margin-bottom: 10px; }}
                p {{ color: #8e8e93; font-size: 16px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="icon">❌</div>
                <h1>Подключение отменено</h1>
                <p>Вернитесь в Telegram и попробуйте снова</p>
            </div>
        </body>
        </html>
        """
        return HTMLResponse(content=html_content)
    
    # Store pending OAuth code in database
    # The state contains user_id
    try:
        if state:
            from .db.supabase import get_supabase_client
            from datetime import datetime
            client = get_supabase_client()
            
            logger.info(f"Storing pending OAuth for user_id: {state}, code length: {len(code)}")
            
            # Store pending OAuth code (expires in 5 minutes)
            # First try to delete existing, then insert new
            client.table("pending_oauth").delete().eq(
                "user_id", state
            ).eq("provider", "notion").execute()
            
            result = client.table("pending_oauth").insert({
                "user_id": state,
                "provider": "notion",
                "code": code,
            }).execute()
            
            logger.info(f"Pending OAuth stored successfully: {result.data}")
    except Exception as e:
        logger.error(f"Failed to store pending OAuth code: {e}", exc_info=True)
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>FixNote - Notion Connected</title>
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                color: white;
                text-align: center;
                padding: 20px;
            }}
            .container {{
                max-width: 400px;
            }}
            .icon {{ font-size: 64px; margin-bottom: 20px; }}
            h1 {{ font-size: 24px; margin-bottom: 10px; }}
            p {{ color: #8e8e93; font-size: 16px; margin-bottom: 24px; }}
            .btn {{
                display: inline-block;
                background: linear-gradient(135deg, #007AFF 0%, #5856D6 100%);
                color: white;
                text-decoration: none;
                padding: 14px 32px;
                border-radius: 12px;
                font-size: 17px;
                font-weight: 600;
                transition: transform 0.2s, opacity 0.2s;
            }}
            .btn:active {{
                transform: scale(0.95);
                opacity: 0.9;
            }}
            .hint {{
                font-size: 14px;
                color: #636366;
                margin-top: 20px;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="icon">✅</div>
            <h1>Notion подключён!</h1>
            <p>Авторизация прошла успешно.<br>Вернитесь в Telegram — подключение завершится автоматически.</p>
            
            <a href="https://t.me/fixnote_bot" class="btn">
                Открыть FixNote в Telegram
            </a>
            
            <div class="hint">
                Если кнопка не работает, откройте @fixnote_bot в Telegram вручную
            </div>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)


@router.get("/sync/notion/pending")
async def check_pending_notion_oauth(user=Depends(get_current_user)):
    """
    Check if there's a pending Notion OAuth code for this user.
    Called by Mini App when it regains focus to complete OAuth flow.
    """
    from .db.supabase import get_supabase_client
    client = get_supabase_client()
    
    # Check for pending OAuth code
    result = client.table("pending_oauth").select("*").eq(
        "user_id", str(user.id)
    ).eq("provider", "notion").execute()
    
    if not result.data:
        return {"pending": False}
    
    pending = result.data[0]
    
    # Check if expired (older than 5 minutes)
    from datetime import datetime, timedelta
    created_at = datetime.fromisoformat(pending["created_at"].replace("Z", "+00:00")).replace(tzinfo=None)
    if datetime.utcnow() - created_at > timedelta(minutes=5):
        # Delete expired code
        client.table("pending_oauth").delete().eq("id", pending["id"]).execute()
        return {"pending": False, "expired": True}
    
    # Return the code for the frontend to complete the OAuth
    return {
        "pending": True,
        "code": pending["code"],
    }


@router.delete("/sync/notion/pending")
async def clear_pending_notion_oauth(user=Depends(get_current_user)):
    """Clear pending OAuth code after successful connection."""
    from .db.supabase import get_supabase_client
    client = get_supabase_client()
    
    client.table("pending_oauth").delete().eq(
        "user_id", str(user.id)
    ).eq("provider", "notion").execute()
    
    return {"success": True}


@router.post("/sync/notion/callback", response_model=NotionOAuthCallbackResponse)
async def notion_oauth_callback(
    request: NotionOAuthCallbackRequest,
    user=Depends(get_current_user)
):
    """Handle Notion OAuth callback (POST from frontend)."""
    try:
        redirect_uri = settings.notion_redirect_uri or f"{settings.public_url}/api/sync/notion/callback"
        result = await sync_service.complete_notion_oauth(
            user.id,
            request.code,
            redirect_uri,
        )
        
        integration = result["integration"]
        public_integration = IntegrationConnectionPublic(
            id=integration["id"],
            provider=integration["provider"],
            is_active=integration["is_active"],
            workspace_name=integration.get("workspace_name"),
            database_name=integration.get("database_name"),
            sync_mode=integration.get("sync_mode", "two_way"),
            auto_sync_enabled=integration.get("auto_sync_enabled", False),
            last_sync_at=integration.get("last_sync_at"),
        )
        
        # Format databases for frontend
        databases = []
        for db in result.get("databases", []):
            title = db.get("title", [])
            name = title[0].get("plain_text", "Untitled") if title else "Untitled"
            databases.append({
                "id": db["id"],
                "name": name,
                "url": db.get("url"),
            })
        
        return NotionOAuthCallbackResponse(
            success=True,
            integration=public_integration,
            has_database=result["has_database"],
            available_databases=databases,
        )
    except Exception as e:
        logger.error(f"Notion OAuth callback failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sync/notion/database")
async def set_notion_database(
    request: SetNotionDatabaseRequest,
    user=Depends(get_current_user)
):
    """Set the Notion database to sync with."""
    try:
        await sync_service.set_notion_database(user.id, request.database_id)
        return {"success": True}
    except Exception as e:
        logger.error(f"Failed to set Notion database: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/sync/{provider}/settings")
async def update_sync_settings(
    provider: str,
    request: UpdateSyncSettingsRequest,
    user=Depends(get_current_user)
):
    """Update sync settings for an integration."""
    if provider not in ["notion", "obsidian", "anytype"]:
        raise HTTPException(status_code=400, detail="Invalid provider")
    
    # Check auto-sync permission (Ultra only)
    if request.auto_sync_enabled:
        subscription = await notes_service.get_subscription_info(user.id)
        if not subscription.limits.auto_sync:
            raise HTTPException(
                status_code=403,
                detail="Auto-sync requires Ultra subscription"
            )
    
    result = await sync_service.update_integration_settings(
        user.id,
        provider,
        sync_mode=request.sync_mode,
        auto_sync_enabled=request.auto_sync_enabled,
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Integration not found")
    
    return {"success": True}


@router.delete("/sync/{provider}")
async def disconnect_integration(
    provider: str,
    user=Depends(get_current_user)
):
    """Disconnect an integration."""
    if provider not in ["notion", "obsidian", "anytype"]:
        raise HTTPException(status_code=400, detail="Invalid provider")
    
    success = await sync_service.delete_integration(user.id, provider)
    if not success:
        raise HTTPException(status_code=404, detail="Integration not found")
    
    return {"success": True}


@router.post("/sync/notes/{note_id}", response_model=SyncNoteResponse)
async def sync_single_note(
    note_id: UUID,
    request: SyncNoteRequest = SyncNoteRequest(),
    user=Depends(get_current_user)
):
    """Sync a single note to connected integrations."""
    # Check subscription
    subscription = await notes_service.get_subscription_info(user.id)
    if not subscription.limits.sync_enabled:
        raise HTTPException(
            status_code=403,
            detail="Sync feature requires Pro or Ultra subscription"
        )
    
    # Get Notion integration
    integration = await sync_service.get_integration(user.id, "notion")
    if not integration or not integration.get("is_active"):
        raise HTTPException(
            status_code=400,
            detail="No active Notion integration. Please connect Notion first."
        )
    
    try:
        result = await sync_service.sync_note_to_notion(
            user.id, 
            note_id, 
            force=request.force
        )
        return SyncNoteResponse(**result)
    except Exception as e:
        logger.error(f"Failed to sync note {note_id}: {e}")
        return SyncNoteResponse(status="failed", error=str(e))


@router.post("/sync/notes/{note_id}/pull", response_model=SyncNoteResponse)
async def pull_note_from_external(
    note_id: UUID,
    user=Depends(get_current_user)
):
    """Pull updates from Notion for a specific note."""
    subscription = await notes_service.get_subscription_info(user.id)
    if not subscription.limits.sync_enabled:
        raise HTTPException(
            status_code=403,
            detail="Sync feature requires Pro or Ultra subscription"
        )
    
    try:
        result = await sync_service.sync_note_from_notion(user.id, note_id)
        return SyncNoteResponse(**result)
    except Exception as e:
        logger.error(f"Failed to pull note {note_id}: {e}")
        return SyncNoteResponse(status="failed", error=str(e))


@router.post("/sync/all", response_model=SyncAllResponse)
async def sync_all_notes(user=Depends(get_current_user)):
    """Sync all notes (Ultra plan feature)."""
    # Check for Ultra plan
    subscription = await notes_service.get_subscription_info(user.id)
    if not subscription.limits.auto_sync:
        raise HTTPException(
            status_code=403,
            detail="Bulk sync requires Ultra subscription"
        )
    
    try:
        result = await sync_service.sync_all_notes(user.id, "notion")
        return SyncAllResponse(**result)
    except Exception as e:
        logger.error(f"Failed to sync all notes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync/notes/{note_id}/resolve")
async def resolve_sync_conflict(
    note_id: UUID,
    request: ResolveConflictRequest,
    user=Depends(get_current_user)
):
    """Resolve a sync conflict."""
    try:
        result = await sync_service.resolve_conflict(
            user.id,
            note_id,
            request.resolution,
        )
        return result
    except Exception as e:
        logger.error(f"Failed to resolve conflict for note {note_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/sync/notes/{note_id}/status")
async def get_note_sync_status(
    note_id: UUID,
    user=Depends(get_current_user)
):
    """Get sync status for a specific note."""
    integration = await sync_service.get_integration(user.id, "notion")
    if not integration:
        return {"synced": False, "has_integration": False}
    
    status = await sync_service.get_note_sync_status(note_id, UUID(integration["id"]))
    
    return {
        "synced": status is not None and status.get("sync_status") == "synced",
        "has_integration": True,
        "sync_status": status.get("sync_status") if status else None,
        "external_url": status.get("external_url") if status else None,
        "last_synced_at": status.get("last_synced_at") if status else None,
        "has_conflict": status.get("sync_status") == "conflict" if status else False,
    }


@router.get("/sync/history", response_model=SyncHistoryResponse)
async def get_sync_history(
    limit: int = Query(default=50, ge=1, le=100),
    user=Depends(get_current_user)
):
    """Get sync history for user."""
    history = await sync_service.get_sync_history(user.id, limit)
    
    entries = [SyncHistoryEntry(**h) for h in history]
    
    return SyncHistoryResponse(history=entries, total=len(entries))
