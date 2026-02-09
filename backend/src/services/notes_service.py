import logging
from collections import OrderedDict
from typing import Optional, List
from uuid import UUID, uuid4
from datetime import datetime, timedelta

from ..db.supabase import get_supabase_client
from .crypto import NotesCrypto, NotesCryptoError

logger = logging.getLogger(__name__)
from ..db.models import (
    User, UserCreate, Note, NoteCreate, NoteUpdate, StatsResponse, PublicNote, 
    FTSSearchResult, SubscriptionInfo, SubscriptionLimits, UsageStats
)


class NotesService:
    """Service for managing notes and users."""
    
    def __init__(self):
        self.client = get_supabase_client()
        self.crypto = NotesCrypto.from_settings()
        self._key_cache: OrderedDict[str, bytes] = OrderedDict()
        self._key_cache_max = 1024

    def _cache_user_key(self, user_id: str, data_key: bytes) -> None:
        if user_id in self._key_cache:
            self._key_cache.pop(user_id, None)
        self._key_cache[user_id] = data_key
        if len(self._key_cache) > self._key_cache_max:
            self._key_cache.popitem(last=False)

    async def _get_user_data_key(self, user_id: UUID) -> bytes:
        uid = str(user_id)
        cached = self._key_cache.get(uid)
        if cached:
            self._key_cache.move_to_end(uid)
            return cached

        result = self.client.table("users").select(
            "notes_key_enc, notes_key_version"
        ).eq("id", uid).execute()

        if not result.data:
            raise ValueError("User not found")

        row = result.data[0]
        wrapped = (row.get("notes_key_enc") or "").strip()
        if not wrapped:
            data_key = self.crypto.generate_data_key()
            wrapped = self.crypto.wrap_data_key(data_key, f"{uid}:notes_key")
            self.client.table("users").update({
                "notes_key_enc": wrapped,
                "notes_key_version": self.crypto.master_key_version,
            }).eq("id", uid).execute()
        else:
            data_key = self.crypto.unwrap_data_key(wrapped, f"{uid}:notes_key")

        self._cache_user_key(uid, data_key)
        return data_key

    def _normalize_search_lang(self, language_code: Optional[str]) -> str:
        if not language_code:
            return "russian"
        code = language_code.lower()
        if code.startswith("ru"):
            return "russian"
        if code.startswith("en"):
            return "english"
        return "simple"

    def _build_search_text(
        self,
        title: Optional[str],
        summary: Optional[str],
        content: Optional[str],
    ) -> str:
        parts = [title or "", summary or "", content or ""]
        return "\n".join(p for p in parts if p is not None)

    def _update_search_vector(self, note_id: str, search_text: str, search_lang: str) -> None:
        try:
            self.client.rpc("update_note_search_vector", {
                "p_note_id": note_id,
                "p_search_text": search_text,
                "p_lang": search_lang,
            }).execute()
        except Exception as e:
            logger.warning(f"Failed to update search vector for note {note_id}: {e}")

    async def _decrypt_note_row(
        self,
        row: dict,
        user_id: UUID,
        data_key: Optional[bytes] = None,
    ) -> Note:
        if data_key is None:
            data_key = await self._get_user_data_key(user_id)
        keys = self.crypto.derive_keys(data_key)

        content = row.get("content")
        summary = row.get("summary")
        title = row.get("title")

        try:
            if row.get("content_enc"):
                content = self.crypto.decrypt_text(
                    row["content_enc"],
                    keys.enc_key,
                    f"{user_id}:content",
                )
            if row.get("summary_enc"):
                summary = self.crypto.decrypt_text(
                    row["summary_enc"],
                    keys.enc_key,
                    f"{user_id}:summary",
                )
            if row.get("title_enc"):
                title = self.crypto.decrypt_text(
                    row["title_enc"],
                    keys.enc_key,
                    f"{user_id}:title",
                )
        except NotesCryptoError as e:
            logger.error(f"Failed to decrypt note {row.get('id')}: {e}")
            raise

        row_copy = dict(row)
        row_copy["content"] = content or ""
        row_copy["summary"] = summary
        row_copy["title"] = title
        return Note(**row_copy)

    async def get_notes_map(self, user_id: UUID, note_ids: List[str]) -> dict[str, Note]:
        if not note_ids:
            return {}
        result = self.client.table("notes").select("*").in_(
            "id", note_ids
        ).eq("user_id", str(user_id)).is_("deleted_at", "null").execute()

        notes: dict[str, Note] = {}
        data_key = await self._get_user_data_key(user_id)
        for row in result.data:
            note = await self._decrypt_note_row(row, user_id, data_key=data_key)
            notes[str(note.id)] = note
        return notes

    async def get_note_with_meta(self, note_id: UUID, user_id: UUID) -> Optional[dict]:
        result = self.client.table("notes").select("*").eq(
            "id", str(note_id)
        ).eq("user_id", str(user_id)).is_("deleted_at", "null").execute()

        if not result.data:
            return None

        row = result.data[0]
        data_key = await self._get_user_data_key(user_id)
        keys = self.crypto.derive_keys(data_key)
        note = await self._decrypt_note_row(row, user_id, data_key=data_key)

        combined = f"{note.content}|{note.summary or ''}"
        combined_hash = self.crypto.hash_text(combined, keys.hash_key)

        return {
            "note": note,
            "content_hash": row.get("content_hash"),
            "summary_hash": row.get("summary_hash"),
            "title_hash": row.get("title_hash"),
            "combined_hash": combined_hash,
        }

    async def compute_combined_hash(
        self, user_id: UUID, content: str, summary: Optional[str]
    ) -> str:
        data_key = await self._get_user_data_key(user_id)
        keys = self.crypto.derive_keys(data_key)
        combined = f"{content}|{summary or ''}"
        return self.crypto.hash_text(combined, keys.hash_key)
    
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

            # Ensure user has a notes encryption key
            if not (user_data.get("notes_key_enc") or "").strip():
                data_key = self.crypto.generate_data_key()
                wrapped = self.crypto.wrap_data_key(data_key, f"{user_data['id']}:notes_key")
                self.client.table("users").update({
                    "notes_key_enc": wrapped,
                    "notes_key_version": self.crypto.master_key_version,
                }).eq("id", user_data["id"]).execute()
                self._cache_user_key(str(user_data["id"]), data_key)
            
            return User(**user_data)
        
        # Create new user
        user_id = str(uuid4())
        data_key = self.crypto.generate_data_key()
        wrapped = self.crypto.wrap_data_key(data_key, f"{user_id}:notes_key")
        now = datetime.utcnow()
        trial_ends_at = now + timedelta(days=5)

        new_user = {
            "id": user_id,
            "telegram_id": telegram_id,
            "username": username,
            "first_name": first_name,
            "language_code": language_code,
            "subscription_plan": "trial",
            "subscription_started_at": now.isoformat(),
            "subscription_expires_at": trial_ends_at.isoformat(),
            "trial_started_at": now.isoformat(),
            "trial_ends_at": trial_ends_at.isoformat(),
            "notes_key_enc": wrapped,
            "notes_key_version": self.crypto.master_key_version,
        }
        result = self.client.table("users").insert(new_user).execute()
        self._cache_user_key(user_id, data_key)
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
    async def create_note(
        self,
        user_id: UUID,
        note_data: NoteCreate,
        user_language: Optional[str] = None,
    ) -> Note:
        """Create a new note."""
        data_key = await self._get_user_data_key(user_id)
        keys = self.crypto.derive_keys(data_key)

        content = note_data.content or ""
        summary = note_data.summary
        title = note_data.title

        content_enc = self.crypto.encrypt_text(content, keys.enc_key, f"{user_id}:content")
        summary_enc = (
            self.crypto.encrypt_text(summary, keys.enc_key, f"{user_id}:summary")
            if summary
            else None
        )
        title_enc = (
            self.crypto.encrypt_text(title, keys.enc_key, f"{user_id}:title")
            if title
            else None
        )

        data = {
            "user_id": str(user_id),
            "content_enc": content_enc,
            "summary_enc": summary_enc,
            "title_enc": title_enc,
            "enc_version": self.crypto.master_key_version,
            "content_hash": self.crypto.hash_text(content, keys.hash_key),
            "summary_hash": self.crypto.hash_text(summary, keys.hash_key) if summary else None,
            "title_hash": self.crypto.hash_text(title, keys.hash_key) if title else None,
            "search_lang": self._normalize_search_lang(user_language),
            "source": note_data.source,
            "duration_seconds": note_data.duration_seconds,
        }
        # Only include images if provided and not empty
        if note_data.images:
            data["images"] = note_data.images
        if note_data.voice_url:
            data["voice_url"] = note_data.voice_url

        result = self.client.table("notes").insert(data).execute()
        row = result.data[0]

        search_text = self._build_search_text(title, summary, content)
        self._update_search_vector(row["id"], search_text, data["search_lang"])

        return await self._decrypt_note_row(row, user_id, data_key=data_key)
    
    async def get_note(self, note_id: UUID, user_id: UUID) -> Optional[Note]:
        """Get a single note by ID."""
        result = self.client.table("notes").select("*").eq(
            "id", str(note_id)
        ).eq("user_id", str(user_id)).is_("deleted_at", "null").execute()
        
        if result.data:
            return await self._decrypt_note_row(result.data[0], user_id)
        return None
    
    async def get_notes(self, user_id: UUID, limit: int = 50, offset: int = 0) -> List[Note]:
        """Get all notes for a user."""
        result = self.client.table("notes").select("*").eq(
            "user_id", str(user_id)
        ).is_("deleted_at", "null").order("created_at", desc=True).range(offset, offset + limit - 1).execute()

        data_key = await self._get_user_data_key(user_id)
        notes: List[Note] = []
        for row in result.data:
            notes.append(await self._decrypt_note_row(row, user_id, data_key=data_key))
        return notes
    
    async def update_note(
        self,
        note_id: UUID,
        user_id: UUID,
        note_data: NoteUpdate,
        user_language: Optional[str] = None,
    ) -> Optional[Note]:
        """Update a note."""
        updates = note_data.model_dump(exclude_unset=True)
        if not updates:
            return await self.get_note(note_id, user_id)

        result = self.client.table("notes").select("*").eq(
            "id", str(note_id)
        ).eq("user_id", str(user_id)).is_("deleted_at", "null").execute()
        if not result.data:
            return None

        row = result.data[0]
        data_key = await self._get_user_data_key(user_id)
        current_note = await self._decrypt_note_row(row, user_id, data_key=data_key)

        content = note_data.content if note_data.content is not None else current_note.content
        summary = note_data.summary if note_data.summary is not None else current_note.summary
        title = note_data.title if note_data.title is not None else current_note.title

        keys = self.crypto.derive_keys(data_key)
        update_data = {
            "content_enc": self.crypto.encrypt_text(content, keys.enc_key, f"{user_id}:content"),
            "summary_enc": (
                self.crypto.encrypt_text(summary, keys.enc_key, f"{user_id}:summary")
                if summary
                else None
            ),
            "title_enc": (
                self.crypto.encrypt_text(title, keys.enc_key, f"{user_id}:title")
                if title
                else None
            ),
            "enc_version": self.crypto.master_key_version,
            "content_hash": self.crypto.hash_text(content, keys.hash_key),
            "summary_hash": self.crypto.hash_text(summary, keys.hash_key) if summary else None,
            "title_hash": self.crypto.hash_text(title, keys.hash_key) if title else None,
            "content": None,
            "summary": None,
            "title": None,
        }

        search_lang = (
            self._normalize_search_lang(user_language)
            if user_language
            else (row.get("search_lang") or "russian")
        )
        update_data["search_lang"] = search_lang

        update_result = self.client.table("notes").update(update_data).eq(
            "id", str(note_id)
        ).eq("user_id", str(user_id)).execute()

        if update_result.data:
            search_text = self._build_search_text(title, summary, content)
            self._update_search_vector(str(note_id), search_text, search_lang)
            return await self._decrypt_note_row(update_result.data[0], user_id, data_key=data_key)
        return None
    
    async def delete_note(self, note_id: UUID, user_id: UUID) -> bool:
        """Soft delete a note (set deleted_at timestamp)."""
        from datetime import datetime
        
        result = self.client.table("notes").update({
            "deleted_at": datetime.utcnow().isoformat()
        }).eq(
            "id", str(note_id)
        ).eq("user_id", str(user_id)).is_("deleted_at", "null").execute()
        
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
        
        # Get all notes count (exclude deleted)
        all_notes = self.client.table("notes").select("id, source, created_at").eq(
            "user_id", str(user_id)
        ).is_("deleted_at", "null").execute()
        
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
        ).is_("deleted_at", "null").execute()
        
        if result.data:
            note_data = result.data[0]
            owner_telegram_id = note_data.get("users", {}).get("telegram_id")
            # Remove users join from note data
            note_data.pop("users", None)
            note = await self._decrypt_note_row(note_data, UUID(str(note_data["user_id"])))
            return {
                "note": note,
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

        if not result.data:
            return []

        note_ids = [str(r["id"]) for r in result.data]
        notes_map = await self.get_notes_map(user_id, note_ids)

        results: List[FTSSearchResult] = []
        for row in result.data:
            note = notes_map.get(str(row["id"]))
            if not note:
                continue
            results.append(FTSSearchResult(
                id=note.id,
                content=note.content,
                title=note.title,
                summary=note.summary,
                source=note.source,
                duration_seconds=note.duration_seconds,
                images=getattr(note, "images", []) or [],
                voice_url=getattr(note, "voice_url", None),
                created_at=note.created_at,
                rank=row.get("rank", 0.0),
            ))

        return results

    # Subscription operations
    async def can_use_feature(self, user_id: UUID, feature: str) -> tuple[bool, str, str]:
        """
        Check if user can use a specific feature.
        Returns (can_use, plan, reason).
        Features: 'voice', 'summary', 'chat'
        """
        try:
            info = await self.get_subscription_info(user_id)
            plan = info.plan
            limits = info.limits
            usage = info.usage
            
            # Free plan - no AI features
            if plan == "free":
                return False, plan, "free_plan"
            
            # Check specific feature limits
            if feature == "voice":
                if limits.voice_minutes_per_month is None:
                    return True, plan, "ok"
                voice_minutes_used = usage.voice_seconds_used / 60
                if voice_minutes_used >= limits.voice_minutes_per_month:
                    return False, plan, "limit_reached"
                return True, plan, "ok"
                
            elif feature == "summary":
                if limits.summaries_per_month is None:
                    return True, plan, "ok"
                if usage.summaries_used >= limits.summaries_per_month:
                    return False, plan, "limit_reached"
                return True, plan, "ok"
                
            elif feature == "chat":
                if not limits.ai_chat_enabled:
                    return False, plan, "not_available"
                return True, plan, "ok"
            
            return True, plan, "ok"
            
        except Exception as e:
            # If we can't check, allow (fail open for better UX)
            logger.warning(f"Failed to check feature access: {e}")
            return True, "unknown", "error"

    async def get_subscription_info(self, user_id: UUID) -> SubscriptionInfo:
        """Get subscription info for a user."""
        # Get user data
        user_result = self.client.table("users").select("*").eq(
            "id", str(user_id)
        ).execute()
        
        if not user_result.data:
            raise ValueError("User not found")
        
        user_data = user_result.data[0]
        plan = user_data.get("subscription_plan", "trial")
        
        # Check if trial expired
        if plan == "trial":
            trial_ends = user_data.get("trial_ends_at")
            if trial_ends:
                trial_ends_dt = datetime.fromisoformat(trial_ends.replace("Z", "+00:00")).replace(tzinfo=None)
                if datetime.utcnow() > trial_ends_dt:
                    # Update to free plan
                    self.client.table("users").update({
                        "subscription_plan": "free"
                    }).eq("id", str(user_id)).execute()
                    plan = "free"
        
        # Check if paid subscription expired
        if plan in ("pro", "ultra"):
            expires_at = user_data.get("subscription_expires_at")
            if expires_at:
                expires_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00")).replace(tzinfo=None)
                if datetime.utcnow() > expires_dt:
                    # Downgrade to free
                    self.client.table("users").update({
                        "subscription_plan": "free"
                    }).eq("id", str(user_id)).execute()
                    plan = "free"
        
        # Get plan limits
        limits_result = self.client.table("subscription_limits").select("*").eq(
            "plan", plan
        ).execute()
        
        if limits_result.data:
            limits_data = limits_result.data[0]
            limits = SubscriptionLimits(
                summaries_per_month=limits_data.get("summaries_per_month"),
                voice_minutes_per_month=limits_data.get("voice_minutes_per_month"),
                ai_chat_enabled=limits_data.get("ai_chat_enabled", False),
                ai_chat_fast=limits_data.get("ai_chat_fast", False),
                sync_enabled=limits_data.get("sync_enabled", False),
                auto_sync=limits_data.get("auto_sync", False),
                price_monthly_stars=limits_data.get("price_monthly_stars", 0),
                price_yearly_stars=limits_data.get("price_yearly_stars", 0),
            )
        else:
            limits = SubscriptionLimits()
        
        # Get current month usage
        month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        usage_result = self.client.table("usage_stats").select("*").eq(
            "user_id", str(user_id)
        ).gte("month_start", month_start.isoformat()).execute()
        
        if usage_result.data:
            usage_data = usage_result.data[0]
            usage = UsageStats(
                summaries_used=usage_data.get("summaries_used", 0),
                voice_seconds_used=usage_data.get("voice_seconds_used", 0),
                chat_messages_used=usage_data.get("chat_messages_used", 0),
            )
        else:
            usage = UsageStats()
        
        billing_period = user_data.get("subscription_billing_period")
        is_recurring = bool(user_data.get("subscription_is_recurring", False))
        is_canceled = bool(user_data.get("subscription_is_canceled", False))
        canceled_at = user_data.get("subscription_canceled_at")

        # Backward compatibility: infer billing state from latest payment for older rows.
        if plan in ("pro", "ultra") and not billing_period:
            latest_payment = self.client.table("payments").select(
                "billing_period, is_recurring"
            ).eq("user_id", str(user_id)).eq("status", "completed").order(
                "created_at", desc=True
            ).limit(1).execute()
            if latest_payment.data:
                payment = latest_payment.data[0]
                billing_period = payment.get("billing_period")
                is_recurring = bool(payment.get("is_recurring", is_recurring))

        return SubscriptionInfo(
            plan=plan,
            billing_period=billing_period,
            is_recurring=is_recurring,
            is_canceled=is_canceled,
            canceled_at=canceled_at,
            subscription_started_at=user_data.get("subscription_started_at"),
            subscription_expires_at=user_data.get("subscription_expires_at"),
            trial_started_at=user_data.get("trial_started_at"),
            trial_ends_at=user_data.get("trial_ends_at"),
            limits=limits,
            usage=usage,
        )

    async def update_user_language(self, user_id: UUID, language: str) -> bool:
        """Update user's language preference."""
        result = self.client.table("users").update({
            "language_code": language
        }).eq("id", str(user_id)).execute()
        
        return len(result.data) > 0

    async def activate_subscription(
        self,
        user_id: str | UUID,
        plan: str,
        billing_period: str = "monthly",
        subscription_expires_at: Optional[datetime] = None,
        payment_data: Optional[dict] = None,
    ) -> bool:
        """Activate/update a subscription for user and persist payment metadata."""
        now = datetime.utcnow()

        # For recurring subscriptions Telegram provides the exact expiration timestamp.
        if subscription_expires_at is None:
            if billing_period == "monthly":
                expires_at = now + timedelta(days=30)
            else:
                expires_at = now + timedelta(days=365)
        else:
            expires_at = subscription_expires_at

        user_lookup = self.client.table("users").select(
            "id, subscription_started_at, subscription_telegram_payment_charge_id"
        ).eq("id", str(user_id)).execute()
        if not user_lookup.data:
            return False

        existing_user = user_lookup.data[0]
        is_first_recurring = bool((payment_data or {}).get("is_first_recurring"))
        existing_started_at = existing_user.get("subscription_started_at")
        started_at = now.isoformat()
        if existing_started_at and not is_first_recurring:
            started_at = existing_started_at
        charge_id = (payment_data or {}).get("telegram_payment_charge_id") or existing_user.get(
            "subscription_telegram_payment_charge_id"
        )
        is_recurring = bool((payment_data or {}).get("is_recurring", billing_period == "monthly"))

        result = self.client.table("users").update({
            "subscription_plan": plan,
            "subscription_billing_period": billing_period,
            "subscription_is_recurring": is_recurring,
            "subscription_is_canceled": False,
            "subscription_canceled_at": None,
            "subscription_telegram_payment_charge_id": charge_id,
            "subscription_started_at": started_at,
            "subscription_expires_at": expires_at.isoformat(),
        }).eq("id", str(user_id)).execute()

        if len(result.data) == 0:
            return False

        # Persist payment record (idempotent by Telegram charge id).
        if payment_data:
            telegram_charge_id = payment_data.get("telegram_payment_charge_id")
            if telegram_charge_id:
                existing_payment = self.client.table("payments").select("id").eq(
                    "telegram_payment_charge_id", telegram_charge_id
                ).execute()
                if existing_payment.data:
                    return True

            payment_record = {
                "user_id": str(user_id),
                "telegram_payment_charge_id": telegram_charge_id,
                "provider_payment_charge_id": payment_data.get("provider_payment_charge_id"),
                "amount": int(payment_data.get("amount", 0)),
                "currency": payment_data.get("currency", "XTR"),
                "plan": plan,
                "billing_period": billing_period,
                "status": "completed",
                "invoice_payload": payment_data.get("invoice_payload"),
                "subscription_period": payment_data.get("subscription_period"),
                "subscription_expiration_at": expires_at.isoformat(),
                "is_recurring": is_recurring,
                "is_first_recurring": bool(payment_data.get("is_first_recurring", False)),
            }
            try:
                self.client.table("payments").insert(payment_record).execute()
            except Exception as e:
                logger.warning(f"Failed to persist payment metadata: {e}")

        return True

    async def get_latest_monthly_subscription_charge_id(self, user_id: UUID | str) -> Optional[str]:
        """Get latest Telegram charge id for monthly recurring subscription."""
        user_result = self.client.table("users").select(
            "subscription_telegram_payment_charge_id"
        ).eq("id", str(user_id)).execute()
        if user_result.data:
            candidate = user_result.data[0].get("subscription_telegram_payment_charge_id")
            if candidate:
                return candidate

        payment_result = self.client.table("payments").select(
            "telegram_payment_charge_id"
        ).eq("user_id", str(user_id)).eq("billing_period", "monthly").eq(
            "status", "completed"
        ).order("created_at", desc=True).limit(1).execute()

        if payment_result.data:
            return payment_result.data[0].get("telegram_payment_charge_id")
        return None

    async def mark_subscription_canceled(self, user_id: UUID | str) -> bool:
        """Mark current recurring subscription as canceled in user profile."""
        now = datetime.utcnow().isoformat()
        result = self.client.table("users").update({
            "subscription_is_canceled": True,
            "subscription_canceled_at": now,
            "subscription_is_recurring": False,
        }).eq("id", str(user_id)).execute()
        return len(result.data) > 0

    async def increment_usage(self, user_id: UUID, usage_type: str, amount: int = 1) -> bool:
        """Increment usage counter for a user."""
        month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0).date()
        
        # Try to upsert usage record
        try:
            # First try to get existing record
            existing = self.client.table("usage_stats").select("*").eq(
                "user_id", str(user_id)
            ).eq("month_start", month_start.isoformat()).execute()
            
            if existing.data:
                # Update existing
                current = existing.data[0]
                field = f"{usage_type}_used" if not usage_type.endswith("_used") else usage_type
                new_value = current.get(field, 0) + amount
                
                result = self.client.table("usage_stats").update({
                    field: new_value
                }).eq("id", current["id"]).execute()
            else:
                # Create new
                field = f"{usage_type}_used" if not usage_type.endswith("_used") else usage_type
                result = self.client.table("usage_stats").insert({
                    "user_id": str(user_id),
                    "month_start": month_start.isoformat(),
                    field: amount,
                }).execute()
            
            return True
        except Exception:
            return False
