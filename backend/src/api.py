import logging
import hashlib
import hmac
from urllib.parse import parse_qs
from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, HTTPException, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import settings
from .db.models import (
    Note, NoteCreate, NoteUpdate, SearchQuery, SearchResult, StatsResponse, 
    PublicNote, FTSSearchResult, ShareResponse, SubscriptionInfo, SubscriptionLimits,
    UsageStats, InvoiceRequest, InvoiceResponse, LanguageUpdate,
    # Sync models
    IntegrationConnectionPublic, NoteSyncStatus, SyncHistoryEntry,
    NotionOAuthStartResponse, NotionOAuthCallbackRequest, NotionOAuthCallbackResponse,
    SetNotionDatabaseRequest, UpdateSyncSettingsRequest, SyncNoteRequest,
    SyncNoteResponse, SyncAllResponse, ResolveConflictRequest,
    IntegrationsListResponse, SyncHistoryResponse, IntegrationProvider, SyncMode
)
from .services.notes_service import NotesService
from .services.rag_service import RAGService
from .services.sync_service import SyncService

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
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data")
):
    """
    Dependency to get current user from Telegram init data.
    """
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Missing Telegram init data")
    
    user_data = validate_telegram_init_data(x_telegram_init_data)
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid Telegram init data")
    
    telegram_id = user_data.get("id")
    if not telegram_id:
        raise HTTPException(status_code=401, detail="Missing user ID")
    
    # Check if user is allowed
    allowed_ids = settings.allowed_user_ids_list
    if allowed_ids and telegram_id not in allowed_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get or create user
    user = await notes_service.get_or_create_user(
        telegram_id=telegram_id,
        username=user_data.get("username"),
        first_name=user_data.get("first_name"),
        language_code=user_data.get("language_code", "ru")
    )
    
    return user


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
    user=Depends(get_current_user)
):
    """Create a new note."""
    note = await notes_service.create_note(user.id, note_data)
    
    # Index for RAG
    await rag_service.index_note(str(note.id), note.content)
    
    return note


@router.put("/notes/{note_id}", response_model=Note)
async def update_note(
    note_id: UUID,
    note_data: NoteUpdate,
    user=Depends(get_current_user)
):
    """Update a note."""
    note = await notes_service.update_note(note_id, user.id, note_data)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # Re-index if content changed
    if note_data.content:
        await rag_service.index_note(str(note.id), note.content)
    
    return note


@router.delete("/notes/{note_id}")
async def delete_note(
    note_id: UUID,
    user=Depends(get_current_user)
):
    """Delete a note."""
    deleted = await notes_service.delete_note(note_id, user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Note not found")
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
        summary=note.summary,
        source=note.source,
        duration_seconds=note.duration_seconds,
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
    """Create a Telegram Stars invoice for subscription."""
    from .config import settings
    
    # Pricing in Telegram Stars
    pricing = {
        "pro": {"monthly": 350, "yearly": 3500},
        "ultra": {"monthly": 800, "yearly": 8000},
    }
    
    plan = request.plan
    period = request.billing_period
    amount = pricing[plan][period]
    
    # Create invoice link through bot
    if _bot_instance is None:
        raise HTTPException(status_code=503, detail="Bot not available")
    
    try:
        from aiogram.types import LabeledPrice
        import uuid
        
        # Create invoice payload
        title = f"FixNote {plan.title()} - {period.title()}"
        description = f"Subscription to FixNote {plan.title()} plan ({period})"
        
        # Generate unique payload for this purchase
        payload = f"{user.id}:{plan}:{period}:{uuid.uuid4().hex[:8]}"
        
        # Create invoice link using Telegram Stars (XTR)
        # For Stars payments, provider_token must be empty string
        invoice_link = await _bot_instance.create_invoice_link(
            title=title,
            description=description,
            payload=payload,
            provider_token="",  # Empty for Telegram Stars
            currency="XTR",
            prices=[LabeledPrice(label=title, amount=amount)],
        )
        
        return InvoiceResponse(
            invoice_link=invoice_link,
            plan=plan,
            billing_period=period,
            amount=amount
        )
    except Exception as e:
        logger.error(f"Failed to create invoice: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create invoice: {str(e)}")


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
    for intg in integrations:
        if intg.get("is_active"):
            public_integrations.append(IntegrationConnectionPublic(
                id=intg["id"],
                provider=intg["provider"],
                is_active=intg["is_active"],
                workspace_name=intg.get("workspace_name"),
                database_name=intg.get("database_name"),
                sync_mode=intg.get("sync_mode", "two_way"),
                auto_sync_enabled=intg.get("auto_sync_enabled", False),
                last_sync_at=intg.get("last_sync_at"),
                last_error=intg.get("last_error"),
            ))
    
    return IntegrationsListResponse(
        integrations=public_integrations,
        available_providers=AVAILABLE_INTEGRATIONS,
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
            from ..db.supabase import get_supabase_client
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
    from ..db.supabase import get_supabase_client
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
    from ..db.supabase import get_supabase_client
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
