from typing import Optional, List
from uuid import UUID
from datetime import datetime, timedelta

from ..db.supabase import get_supabase_client
from ..db.models import User, UserCreate, Note, NoteCreate, NoteUpdate, StatsResponse, PublicNote, FTSSearchResult


class NotesService:
    """Service for managing notes and users."""
    
    def __init__(self):
        self.client = get_supabase_client()
    
    # User operations
    async def get_or_create_user(self, telegram_id: int, username: Optional[str] = None, 
                                  first_name: Optional[str] = None, 
                                  language_code: str = "ru") -> User:
        """Get existing user or create new one."""
        # Try to find existing user
        result = self.client.table("users").select("*").eq(
            "telegram_id", telegram_id
        ).execute()
        
        if result.data:
            user_data = result.data[0]
            # Update user info if changed
            updates = {}
            if username and user_data.get("username") != username:
                updates["username"] = username
            if first_name and user_data.get("first_name") != first_name:
                updates["first_name"] = first_name
            
            if updates:
                result = self.client.table("users").update(updates).eq(
                    "id", user_data["id"]
                ).execute()
                user_data = result.data[0]
            
            return User(**user_data)
        
        # Create new user
        new_user = {
            "telegram_id": telegram_id,
            "username": username,
            "first_name": first_name,
            "language_code": language_code
        }
        result = self.client.table("users").insert(new_user).execute()
        return User(**result.data[0])
    
    async def get_user_by_telegram_id(self, telegram_id: int) -> Optional[User]:
        """Get user by Telegram ID."""
        result = self.client.table("users").select("*").eq(
            "telegram_id", telegram_id
        ).execute()
        
        if result.data:
            return User(**result.data[0])
        return None
    
    # Note operations
    async def create_note(self, user_id: UUID, note_data: NoteCreate) -> Note:
        """Create a new note."""
        data = {
            "user_id": str(user_id),
            "content": note_data.content,
            "summary": note_data.summary,
            "source": note_data.source,
            "duration_seconds": note_data.duration_seconds
        }
        result = self.client.table("notes").insert(data).execute()
        return Note(**result.data[0])
    
    async def get_note(self, note_id: UUID, user_id: UUID) -> Optional[Note]:
        """Get a single note by ID."""
        result = self.client.table("notes").select("*").eq(
            "id", str(note_id)
        ).eq("user_id", str(user_id)).execute()
        
        if result.data:
            return Note(**result.data[0])
        return None
    
    async def get_notes(self, user_id: UUID, limit: int = 50, offset: int = 0) -> List[Note]:
        """Get all notes for a user."""
        result = self.client.table("notes").select("*").eq(
            "user_id", str(user_id)
        ).order("created_at", desc=True).range(offset, offset + limit - 1).execute()
        
        return [Note(**note) for note in result.data]
    
    async def update_note(self, note_id: UUID, user_id: UUID, 
                          note_data: NoteUpdate) -> Optional[Note]:
        """Update a note."""
        updates = note_data.model_dump(exclude_unset=True)
        if not updates:
            return await self.get_note(note_id, user_id)
        
        result = self.client.table("notes").update(updates).eq(
            "id", str(note_id)
        ).eq("user_id", str(user_id)).execute()
        
        if result.data:
            return Note(**result.data[0])
        return None
    
    async def delete_note(self, note_id: UUID, user_id: UUID) -> bool:
        """Delete a note."""
        result = self.client.table("notes").delete().eq(
            "id", str(note_id)
        ).eq("user_id", str(user_id)).execute()
        
        return len(result.data) > 0
    
    async def update_note_embedding(self, note_id: UUID, embedding: List[float]) -> bool:
        """Update note embedding for RAG."""
        result = self.client.table("notes").update({
            "embedding": embedding
        }).eq("id", str(note_id)).execute()
        
        return len(result.data) > 0
    
    async def get_stats(self, user_id: UUID) -> StatsResponse:
        """Get statistics for a user."""
        now = datetime.utcnow()
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)
        
        # Get all notes count
        all_notes = self.client.table("notes").select("id, source, created_at").eq(
            "user_id", str(user_id)
        ).execute()
        
        total = len(all_notes.data)
        voice = sum(1 for n in all_notes.data if n["source"] == "voice")
        text = total - voice
        
        this_week = sum(
            1 for n in all_notes.data 
            if datetime.fromisoformat(n["created_at"].replace("Z", "+00:00")).replace(tzinfo=None) > week_ago
        )
        this_month = sum(
            1 for n in all_notes.data 
            if datetime.fromisoformat(n["created_at"].replace("Z", "+00:00")).replace(tzinfo=None) > month_ago
        )
        
        return StatsResponse(
            total_notes=total,
            voice_notes=voice,
            text_notes=text,
            notes_this_week=this_week,
            notes_this_month=this_month
        )

    # Share operations
    async def generate_share_token(self, note_id: UUID, user_id: UUID, is_public: bool = False) -> Optional[dict]:
        """Generate or get share token for a note."""
        # First check if note belongs to user
        note = await self.get_note(note_id, user_id)
        if not note:
            return None
        
        # If already has token and same public status, return existing
        if note.share_token and note.is_public == is_public:
            return {"share_token": note.share_token, "is_public": note.is_public}
        
        # Generate new token using Python (more reliable than RPC)
        import secrets
        new_token = secrets.token_hex(16)
        
        # Update note
        update_result = self.client.table("notes").update({
            "share_token": new_token,
            "is_public": is_public
        }).eq("id", str(note_id)).eq("user_id", str(user_id)).execute()
        
        if update_result.data:
            return {"share_token": new_token, "is_public": is_public}
        return None

    async def get_note_by_share_token(self, share_token: str) -> Optional[dict]:
        """Get note by share token with ownership info."""
        result = self.client.table("notes").select("*, users!inner(telegram_id)").eq(
            "share_token", share_token
        ).execute()
        
        if result.data:
            note_data = result.data[0]
            owner_telegram_id = note_data.get("users", {}).get("telegram_id")
            # Remove users join from note data
            note_data.pop("users", None)
            return {
                "note": Note(**note_data),
                "owner_telegram_id": owner_telegram_id
            }
        return None

    async def revoke_share_token(self, note_id: UUID, user_id: UUID) -> bool:
        """Revoke share token for a note."""
        result = self.client.table("notes").update({
            "share_token": None,
            "is_public": False
        }).eq("id", str(note_id)).eq("user_id", str(user_id)).execute()
        
        return len(result.data) > 0

    # Full-text search
    async def search_notes_fts(self, user_id: UUID, query: str, limit: int = 20) -> List[FTSSearchResult]:
        """Full-text search notes."""
        result = self.client.rpc("search_notes_fts", {
            "search_query": query,
            "match_user_id": str(user_id),
            "match_limit": limit
        }).execute()
        
        return [FTSSearchResult(**r) for r in result.data]


