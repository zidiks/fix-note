"""
Background reindex script for embeddings -> Qdrant.

Usage:
  python -m src.reindex_embeddings --batch-size 200 --offset 0
  python -m src.reindex_embeddings --since 2026-01-01T00:00:00
"""

import argparse
import base64
import logging
import os
import time
from typing import Dict, List, Optional

import httpx
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels
from supabase import create_client

from .services.crypto import NotesCrypto


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def _get_user_data_key(
    client,
    crypto: NotesCrypto,
    cache: Dict[str, bytes],
    user_id: str,
) -> bytes:
    if user_id in cache:
        return cache[user_id]

    result = client.table("users").select(
        "notes_key_enc, notes_key_version"
    ).eq("id", user_id).execute()

    if not result.data:
        raise ValueError(f"User not found: {user_id}")

    wrapped = (result.data[0].get("notes_key_enc") or "").strip()
    if not wrapped:
        data_key = crypto.generate_data_key()
        wrapped = crypto.wrap_data_key(data_key, f"{user_id}:notes_key")
        client.table("users").update({
            "notes_key_enc": wrapped,
            "notes_key_version": crypto.master_key_version,
        }).eq("id", user_id).execute()
    else:
        data_key = crypto.unwrap_data_key(wrapped, f"{user_id}:notes_key")

    cache[user_id] = data_key
    return data_key


def _parse_embeddings_response(data) -> List[List[float]]:
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

    if embeddings and isinstance(embeddings[0], (float, int)):
        embeddings = [embeddings]

    return embeddings  # type: ignore[return-value]


def _embed_texts(client: httpx.Client, base_url: str, model: str, texts: List[str]) -> List[List[float]]:
    url = base_url.rstrip("/")
    payload = {"inputs": texts if len(texts) > 1 else texts[0]}
    max_attempts = 20
    backoff_sec = 3

    for attempt in range(1, max_attempts + 1):
        try:
            response = client.post(f"{url}/embed", json=payload)
            if response.status_code == 404:
                response = client.post(
                    f"{url}/embeddings",
                    json={"input": texts, "model": model},
                )
            response.raise_for_status()
            return _parse_embeddings_response(response.json())
        except Exception:
            if attempt == max_attempts:
                raise
            logger.info(
                "Embeddings service not ready yet (attempt %s/%s), retrying in %ss...",
                attempt,
                max_attempts,
                backoff_sec,
            )
            time.sleep(backoff_sec)

    raise RuntimeError("Failed to get embeddings after retries")


def _ensure_collection(client: QdrantClient, collection: str, dim: int) -> None:
    try:
        info = client.get_collection(collection)
        params = getattr(getattr(info, "config", None), "params", None)
        if params and params.size != dim:
            logger.warning("Collection dimension mismatch: expected %s, got %s", dim, params.size)
    except Exception:
        client.create_collection(
            collection_name=collection,
            vectors_config=qmodels.VectorParams(size=dim, distance=qmodels.Distance.COSINE),
        )

    try:
        client.create_payload_index(
            collection_name=collection,
            field_name="user_id",
            field_schema=qmodels.PayloadSchemaType.KEYWORD,
        )
    except Exception:
        pass


def reindex_notes(
    batch_size: int,
    embed_batch_size: int,
    offset: int,
    since: Optional[str],
) -> None:
    load_dotenv()
    repo_env = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
    if os.path.exists(repo_env):
        load_dotenv(repo_env, override=False)

    supabase_url = _get_required_env("SUPABASE_URL")
    supabase_service_key = _get_required_env("SUPABASE_SERVICE_KEY")
    notes_master_key_b64 = _get_required_env("NOTES_MASTER_KEY")
    notes_master_key_version = int(os.getenv("NOTES_MASTER_KEY_VERSION", "1"))

    embeddings_api_url = os.getenv("EMBEDDINGS_API_URL", "http://embeddings:80").strip()
    embeddings_model = os.getenv("EMBEDDINGS_MODEL", "intfloat/multilingual-e5-base").strip()
    embeddings_dimensions = int(os.getenv("EMBEDDINGS_DIMENSIONS", "768"))
    embeddings_timeout_sec = int(os.getenv("EMBEDDINGS_TIMEOUT_SEC", "30"))

    vector_db_url = os.getenv("VECTOR_DB_URL", "http://qdrant:6333").strip()
    vector_db_api_key = os.getenv("VECTOR_DB_API_KEY", "").strip() or None
    vector_db_collection = os.getenv("VECTOR_DB_COLLECTION", "notes_embeddings").strip()

    master_key = base64.b64decode(notes_master_key_b64)
    crypto = NotesCrypto(master_key, notes_master_key_version)

    supabase = create_client(supabase_url, supabase_service_key)
    qdrant = QdrantClient(url=vector_db_url, api_key=vector_db_api_key)

    _ensure_collection(qdrant, vector_db_collection, embeddings_dimensions)

    http = httpx.Client(timeout=embeddings_timeout_sec)
    key_cache: Dict[str, bytes] = {}

    total_indexed = 0
    page = offset

    while True:
        query = supabase.table("notes").select(
            "id, user_id, content, content_enc, summary, summary_enc, title, title_enc, updated_at, deleted_at, content_hash"
        ).is_("deleted_at", "null")

        if since:
            query = query.gte("updated_at", since)

        result = query.range(page, page + batch_size - 1).execute()
        rows = result.data or []
        if not rows:
            break

        batch_items = []
        for row in rows:
            note_id = str(row.get("id"))
            user_id = str(row.get("user_id"))
            if not note_id or not user_id:
                continue

            try:
                data_key = _get_user_data_key(supabase, crypto, key_cache, user_id)
                keys = crypto.derive_keys(data_key)
                if row.get("content_enc"):
                    content = crypto.decrypt_text(row["content_enc"], keys.enc_key, f"{user_id}:content")
                else:
                    content = row.get("content") or ""
            except Exception as exc:
                logger.warning("Failed to decrypt note %s: %s", note_id, exc)
                continue

            if not content:
                continue

            if len(content) > 30000:
                content = content[:30000]

            batch_items.append({
                "id": note_id,
                "user_id": user_id,
                "text": content,
                "updated_at": row.get("updated_at"),
                "content_hash": row.get("content_hash"),
            })

        for i in range(0, len(batch_items), embed_batch_size):
            chunk = batch_items[i:i + embed_batch_size]
            texts = [item["text"] for item in chunk]
            embeddings = _embed_texts(http, embeddings_api_url, embeddings_model, texts)

            points = []
            for item, vector in zip(chunk, embeddings):
                payload = {"user_id": item["user_id"]}
                if item.get("updated_at"):
                    payload["updated_at"] = item["updated_at"]
                if item.get("content_hash"):
                    payload["content_hash"] = item["content_hash"]

                points.append(qmodels.PointStruct(
                    id=item["id"],
                    vector=vector,
                    payload=payload,
                ))

            if points:
                qdrant.upsert(collection_name=vector_db_collection, points=points)
                total_indexed += len(points)

        page += batch_size
        if total_indexed and total_indexed % 50 == 0:
            logger.info("Indexed %s notes...", total_indexed)

    logger.info("Reindex complete. Indexed %s notes.", total_indexed)


def main() -> None:
    parser = argparse.ArgumentParser(description="Reindex note embeddings into Qdrant")
    parser.add_argument("--batch-size", type=int, default=200, help="Supabase batch size")
    parser.add_argument("--embed-batch-size", type=int, default=32, help="Embedding batch size")
    parser.add_argument("--offset", type=int, default=0, help="Start offset for notes")
    parser.add_argument("--since", type=str, default=None, help="ISO timestamp to reindex from (updated_at)")

    args = parser.parse_args()
    reindex_notes(
        batch_size=args.batch_size,
        embed_batch_size=args.embed_batch_size,
        offset=args.offset,
        since=args.since,
    )


if __name__ == "__main__":
    main()
