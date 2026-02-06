"""
One-time migration script to encrypt existing plaintext notes.

Usage:
  python -m src.migrate_notes_encryption
"""

import base64
import logging
import os
from typing import Dict

from dotenv import load_dotenv
from supabase import create_client

from .services.crypto import NotesCrypto


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


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


def _get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def migrate_notes(batch_size: int = 200) -> None:
    load_dotenv()
    repo_env = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
    if os.path.exists(repo_env):
        load_dotenv(repo_env, override=False)

    supabase_url = _get_required_env("SUPABASE_URL")
    supabase_service_key = _get_required_env("SUPABASE_SERVICE_KEY")
    notes_master_key_b64 = _get_required_env("NOTES_MASTER_KEY")
    notes_master_key_version = int(os.getenv("NOTES_MASTER_KEY_VERSION", "1"))

    master_key = base64.b64decode(notes_master_key_b64)
    crypto = NotesCrypto(master_key, notes_master_key_version)
    client = create_client(supabase_url, supabase_service_key)
    key_cache: Dict[str, bytes] = {}

    offset = 0
    total = 0

    while True:
        notes_result = client.table("notes").select(
            "id, user_id, content, summary, title, content_enc, summary_enc, title_enc, content_hash"
        ).range(offset, offset + batch_size - 1).execute()

        if not notes_result.data:
            break

        for note in notes_result.data:
            if note.get("content_enc"):
                continue

            content = note.get("content") or ""
            if not content:
                continue

            user_id = str(note["user_id"])
            data_key = _get_user_data_key(client, crypto, key_cache, user_id)
            keys = crypto.derive_keys(data_key)

            summary = note.get("summary")
            title = note.get("title")

            update_data = {
                "content_enc": crypto.encrypt_text(content, keys.enc_key, f"{user_id}:content"),
                "summary_enc": (
                    crypto.encrypt_text(summary, keys.enc_key, f"{user_id}:summary")
                    if summary
                    else None
                ),
                "title_enc": (
                    crypto.encrypt_text(title, keys.enc_key, f"{user_id}:title")
                    if title
                    else None
                ),
                "enc_version": crypto.master_key_version,
                "content_hash": crypto.hash_text(content, keys.hash_key),
                "summary_hash": crypto.hash_text(summary, keys.hash_key) if summary else None,
                "title_hash": crypto.hash_text(title, keys.hash_key) if title else None,
                "content": None,
                "summary": None,
                "title": None,
            }

            client.table("notes").update(update_data).eq(
                "id", note["id"]
            ).execute()

            search_text = "\n".join(filter(None, [title, summary, content]))
            client.rpc("update_note_search_vector", {
                "p_note_id": note["id"],
                "p_search_text": search_text,
                "p_lang": "russian",
            }).execute()

            total += 1
            if total % 50 == 0:
                logger.info("Encrypted %s notes...", total)

        offset += batch_size

    logger.info("Migration complete. Encrypted %s notes.", total)


if __name__ == "__main__":
    migrate_notes()
