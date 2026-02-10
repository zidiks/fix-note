import logging
from typing import List, Optional
from uuid import UUID

import asyncio
import httpx
from qdrant_client import AsyncQdrantClient
from qdrant_client.http import models as qmodels

from ..config import settings
from ..db.models import SearchResult
from .notes_service import NotesService

logger = logging.getLogger(__name__)


class RAGService:
    """RAG service using TEI embeddings + Qdrant vector DB."""

    def __init__(self):
        self.notes_service = NotesService()
        self.embedding_model = settings.embeddings_model
        self.embedding_dimensions = settings.embeddings_dimensions
        self.collection = settings.vector_db_collection
        self._collection_ready = False

        self._embeddings_base_url = settings.embeddings_api_url.rstrip("/")
        self._embed_url = f"{self._embeddings_base_url}/embed"
        self._embed_fallback_url = f"{self._embeddings_base_url}/embeddings"
        self.http = httpx.AsyncClient(timeout=settings.embeddings_timeout_sec)

        self.qdrant = AsyncQdrantClient(
            url=settings.vector_db_url,
            api_key=settings.vector_db_api_key or None
        )

    async def _ensure_collection(self) -> None:
        if self._collection_ready:
            return
        try:
            info = await self.qdrant.get_collection(self.collection)
            vectors = getattr(info, "config", None)
            vector_params = getattr(vectors, "params", None)
            if vector_params and vector_params.size != self.embedding_dimensions:
                logger.warning(
                    "Qdrant collection %s dimension mismatch: expected %s, got %s",
                    self.collection,
                    self.embedding_dimensions,
                    vector_params.size,
                )
        except Exception:
            await self.qdrant.create_collection(
                collection_name=self.collection,
                vectors_config=qmodels.VectorParams(
                    size=self.embedding_dimensions,
                    distance=qmodels.Distance.COSINE,
                ),
            )

        try:
            await self.qdrant.create_payload_index(
                collection_name=self.collection,
                field_name="user_id",
                field_schema=qmodels.PayloadSchemaType.KEYWORD,
            )
        except Exception:
            # Index might already exist
            pass

        self._collection_ready = True

    def _parse_embeddings_response(self, data) -> List[List[float]]:
        embeddings: Optional[List] = None
        if isinstance(data, list):
            embeddings = data
        elif isinstance(data, dict):
            if "embeddings" in data:
                embeddings = data["embeddings"]
            elif "data" in data and isinstance(data["data"], list):
                embeddings = [row.get("embedding") for row in data["data"] if row.get("embedding") is not None]
            elif "embedding" in data:
                embeddings = [data["embedding"]]

        if embeddings is None:
            raise ValueError("Unexpected embeddings response format")

        # Handle single embedding as flat list
        if embeddings and isinstance(embeddings[0], (float, int)):
            embeddings = [embeddings]

        return embeddings  # type: ignore[return-value]

    async def _embed_texts(self, texts: List[str]) -> List[List[float]]:
        payload = {"inputs": texts if len(texts) > 1 else texts[0]}
        max_attempts = 6
        backoff_sec = 1.5
        response = None

        for attempt in range(1, max_attempts + 1):
            try:
                response = await self.http.post(self._embed_url, json=payload)
                if response.status_code == 404:
                    # OpenAI-compatible fallback
                    response = await self.http.post(
                        self._embed_fallback_url,
                        json={"input": texts, "model": self.embedding_model},
                    )
                response.raise_for_status()
                break
            except Exception as e:
                if attempt == max_attempts:
                    logger.error(f"Embedding request failed: {e}")
                    raise
                await asyncio.sleep(backoff_sec)

        if response is None:
            raise RuntimeError("Failed to fetch embeddings")

        data = response.json()
        embeddings = self._parse_embeddings_response(data)

        if embeddings and len(embeddings[0]) != self.embedding_dimensions:
            logger.warning(
                "Embedding dimension mismatch: expected %s, got %s",
                self.embedding_dimensions,
                len(embeddings[0]),
            )

        return embeddings

    async def get_embedding(self, text: str) -> List[float]:
        """
        Get embedding vector for text via TEI.
        """
        max_chars = 30000
        if len(text) > max_chars:
            text = text[:max_chars]
        embeddings = await self._embed_texts([text])
        return embeddings[0]

    async def index_note(self, note_id: str, user_id: str, text: str) -> bool:
        """
        Index a note with its embedding.
        """
        try:
            await self._ensure_collection()
            embedding = await self.get_embedding(text)
            await self.qdrant.upsert(
                collection_name=self.collection,
                points=[
                    qmodels.PointStruct(
                        id=str(note_id),
                        vector=embedding,
                        payload={
                            "user_id": str(user_id),
                        },
                    )
                ],
            )
            logger.info(f"Note {note_id} indexed successfully")
            return True
        except Exception as e:
            logger.error(f"Index error for note {note_id}: {e}")
            return False

    async def delete_note(self, note_id: str, user_id: Optional[str] = None) -> bool:
        """Delete a note vector from Qdrant."""
        try:
            await self._ensure_collection()
            await self.qdrant.delete(
                collection_name=self.collection,
                points_selector=qmodels.PointIdsList(points=[str(note_id)]),
            )
            return True
        except Exception as e:
            logger.warning(f"Failed to delete vector for note {note_id}: {e}")
            return False

    async def search(self, query: str, user_id: str, limit: int = 5) -> List[SearchResult]:
        """
        Semantic search over user's notes.
        """
        try:
            await self._ensure_collection()
            query_embedding = await self.get_embedding(query)
            results = await self.qdrant.search(
                collection_name=self.collection,
                query_vector=query_embedding,
                limit=limit,
                query_filter=qmodels.Filter(
                    must=[
                        qmodels.FieldCondition(
                            key="user_id",
                            match=qmodels.MatchValue(value=str(user_id)),
                        )
                    ]
                ),
                with_payload=False,
            )

            if not results:
                return []

            note_ids = [str(item.id) for item in results]
            notes_map = await self.notes_service.get_notes_map(UUID(user_id), note_ids)

            output: List[SearchResult] = []
            for item in results:
                note = notes_map.get(str(item.id))
                if not note:
                    continue
                output.append(SearchResult(
                    id=note.id,
                    content=note.content,
                    summary=note.summary,
                    similarity=float(item.score),
                    created_at=note.created_at,
                ))
            return output
        except Exception as e:
            logger.error(f"Search error: {e}")
            return []

    async def search_with_threshold(
        self,
        query: str,
        user_id: str,
        limit: int = 5,
        min_similarity: float = 0.3,
    ) -> List[SearchResult]:
        results = await self.search(query, user_id, limit)
        return [r for r in results if r.similarity >= min_similarity]

    async def health_details(self) -> tuple[bool, bool]:
        """Return (embeddings_ok, qdrant_ok)."""
        embeddings_ok = False
        qdrant_ok = False
        try:
            _ = await self.get_embedding("test")
            embeddings_ok = True
        except Exception:
            embeddings_ok = False
        try:
            await self.qdrant.get_collections()
            qdrant_ok = True
        except Exception:
            qdrant_ok = False
        return embeddings_ok, qdrant_ok

    async def health_check(self) -> bool:
        """Check if embeddings + vector DB are available."""
        embeddings_ok, qdrant_ok = await self.health_details()
        return embeddings_ok and qdrant_ok


