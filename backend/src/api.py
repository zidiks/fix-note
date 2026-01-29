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
from .db.models import Note, NoteCreate, NoteUpdate, SearchQuery, SearchResult, StatsResponse
from .services.notes_service import NotesService
from .services.rag_service import RAGService

logger = logging.getLogger(__name__)

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
    results = await rag_service.search(
        query=search.query,
        user_id=str(user.id),
        limit=search.limit
    )
    
    return SearchResponse(results=results, query=search.query)


@router.get("/stats", response_model=StatsResponse)
async def get_stats(user=Depends(get_current_user)):
    """Get user statistics."""
    return await notes_service.get_stats(user.id)
