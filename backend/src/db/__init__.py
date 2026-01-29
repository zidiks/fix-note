# Database module
from .supabase import get_supabase_client
from .models import User, Note, NoteCreate, NoteUpdate, SearchQuery, SearchResult

__all__ = [
    "get_supabase_client",
    "User",
    "Note", 
    "NoteCreate",
    "NoteUpdate",
    "SearchQuery",
    "SearchResult"
]


