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
    UsageStats, InvoiceRequest, InvoiceResponse, LanguageUpdate
)
from .services.notes_service import NotesService
from .services.rag_service import RAGService

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
