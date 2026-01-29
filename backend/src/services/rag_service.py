import logging
from typing import List, Optional
from uuid import UUID
from openai import AsyncOpenAI

from ..config import settings
from ..db.supabase import get_supabase_client
from ..db.models import SearchResult

logger = logging.getLogger(__name__)


class RAGService:
    """RAG service using OpenAI embeddings + Supabase pgvector."""
    
    def __init__(self):
        self.openai = AsyncOpenAI(api_key=settings.openai_api_key)
        self.supabase = get_supabase_client()
        self.embedding_model = "text-embedding-3-small"
        self.embedding_dimensions = 1536
    
    async def get_embedding(self, text: str) -> List[float]:
        """
        Get embedding vector for text via OpenAI API.
        
        Args:
            text: Text to embed
            
        Returns:
            Embedding vector (1536 dimensions)
        """
        # Truncate text if too long (max ~8000 tokens)
        max_chars = 30000
        if len(text) > max_chars:
            text = text[:max_chars]
        
        try:
            response = await self.openai.embeddings.create(
                model=self.embedding_model,
                input=text
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Embedding error: {e}")
            raise
    
    async def index_note(self, note_id: str, text: str) -> bool:
        """
        Index a note with its embedding.
        
        Args:
            note_id: UUID of the note
            text: Text content to embed
            
        Returns:
            True if successful
        """
        try:
            embedding = await self.get_embedding(text)
            
            result = self.supabase.table("notes").update({
                "embedding": embedding
            }).eq("id", note_id).execute()
            
            logger.info(f"Note {note_id} indexed successfully")
            return len(result.data) > 0
            
        except Exception as e:
            logger.error(f"Index error for note {note_id}: {e}")
            return False
    
    async def search(self, query: str, user_id: str, limit: int = 5) -> List[SearchResult]:
        """
        Semantic search over user's notes.
        
        Args:
            query: Search query
            user_id: UUID of the user
            limit: Maximum number of results
            
        Returns:
            List of search results with similarity scores
        """
        try:
            # Get query embedding
            query_embedding = await self.get_embedding(query)
            
            # Call Supabase RPC function for similarity search
            result = self.supabase.rpc("search_notes", {
                "query_embedding": query_embedding,
                "match_count": limit,
                "match_user_id": user_id
            }).execute()
            
            if not result.data:
                return []
            
            return [SearchResult(**item) for item in result.data]
            
        except Exception as e:
            logger.error(f"Search error: {e}")
            return []
    
    async def search_with_threshold(self, query: str, user_id: str, 
                                     limit: int = 5, 
                                     min_similarity: float = 0.3) -> List[SearchResult]:
        """
        Semantic search with minimum similarity threshold.
        
        Args:
            query: Search query
            user_id: UUID of the user
            limit: Maximum number of results
            min_similarity: Minimum similarity score (0-1)
            
        Returns:
            Filtered list of search results
        """
        results = await self.search(query, user_id, limit)
        return [r for r in results if r.similarity >= min_similarity]
    
    async def health_check(self) -> bool:
        """Check if OpenAI API is available."""
        try:
            response = await self.openai.embeddings.create(
                model=self.embedding_model,
                input="test"
            )
            return len(response.data) > 0
        except Exception:
            return False


