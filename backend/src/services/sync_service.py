"""
Sync service for managing integrations with Notion, Obsidian, and Anytype.
Handles OAuth, sync operations, and conflict resolution.
"""

import logging
import hashlib
import httpx
from typing import Optional, List, Literal
from uuid import UUID
from datetime import datetime, timedelta

from ..db.supabase import get_supabase_client
from ..config import settings

logger = logging.getLogger(__name__)

# Types
IntegrationProvider = Literal["notion", "obsidian", "anytype"]
SyncMode = Literal["two_way", "app_to_external", "external_to_app"]
SyncDirection = Literal["to_external", "from_external"]


class NotionClient:
    """Client for Notion API operations."""
    
    BASE_URL = "https://api.notion.com/v1"
    NOTION_VERSION = "2022-06-28"
    
    def __init__(self, access_token: str):
        self.access_token = access_token
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Notion-Version": self.NOTION_VERSION,
            "Content-Type": "application/json",
        }
    
    async def get_user(self) -> dict:
        """Get current Notion user info."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/users/me",
                headers=self.headers,
            )
            response.raise_for_status()
            return response.json()
    
    async def search_databases(self) -> List[dict]:
        """Search for databases the integration has access to."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.BASE_URL}/search",
                headers=self.headers,
                json={
                    "filter": {"property": "object", "value": "database"},
                    "page_size": 100,
                },
            )
            response.raise_for_status()
            return response.json().get("results", [])
    
    async def create_database(self, parent_page_id: str, title: str = "FixNote") -> dict:
        """Create a new database for syncing notes."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.BASE_URL}/databases",
                headers=self.headers,
                json={
                    "parent": {"type": "page_id", "page_id": parent_page_id},
                    "title": [{"type": "text", "text": {"content": title}}],
                    "properties": {
                        "Name": {"title": {}},
                        "Content": {"rich_text": {}},
                        "Summary": {"rich_text": {}},
                        "Source": {
                            "select": {
                                "options": [
                                    {"name": "voice", "color": "purple"},
                                    {"name": "text", "color": "blue"},
                                ]
                            }
                        },
                        "FixNote ID": {"rich_text": {}},
                        "Created": {"date": {}},
                        "Last Synced": {"date": {}},
                    },
                    "is_inline": False,
                },
            )
            response.raise_for_status()
            return response.json()
    
    async def get_database(self, database_id: str) -> dict:
        """Get database info."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/databases/{database_id}",
                headers=self.headers,
            )
            response.raise_for_status()
            return response.json()
    
    async def query_database(self, database_id: str, start_cursor: Optional[str] = None) -> dict:
        """Query all pages in a database."""
        payload = {"page_size": 100}
        if start_cursor:
            payload["start_cursor"] = start_cursor
            
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.BASE_URL}/databases/{database_id}/query",
                headers=self.headers,
                json=payload,
            )
            response.raise_for_status()
            return response.json()
    
    async def create_page(self, database_id: str, note_data: dict) -> dict:
        """Create a new page in the database."""
        # Truncate content for title (Notion limit is 2000 chars for rich_text)
        title = note_data.get("content", "")[:100]
        if len(note_data.get("content", "")) > 100:
            title += "..."
        
        content = note_data.get("content", "")
        summary = note_data.get("summary", "") or ""
        
        # Split content into chunks of 2000 chars (Notion limit)
        content_chunks = [content[i:i+2000] for i in range(0, len(content), 2000)]
        
        properties = {
            "Name": {"title": [{"text": {"content": title}}]},
            "Content": {"rich_text": [{"text": {"content": chunk}} for chunk in content_chunks[:100]]},  # Max 100 items
            "Summary": {"rich_text": [{"text": {"content": summary[:2000]}}] if summary else []},
            "Source": {"select": {"name": note_data.get("source", "text")}},
            "FixNote ID": {"rich_text": [{"text": {"content": str(note_data.get("id", ""))}}]},
            "Created": {"date": {"start": note_data.get("created_at", datetime.utcnow().isoformat())}},
            "Last Synced": {"date": {"start": datetime.utcnow().isoformat()}},
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.BASE_URL}/pages",
                headers=self.headers,
                json={
                    "parent": {"database_id": database_id},
                    "properties": properties,
                },
            )
            response.raise_for_status()
            return response.json()
    
    async def update_page(self, page_id: str, note_data: dict) -> dict:
        """Update an existing page."""
        title = note_data.get("content", "")[:100]
        if len(note_data.get("content", "")) > 100:
            title += "..."
        
        content = note_data.get("content", "")
        summary = note_data.get("summary", "") or ""
        content_chunks = [content[i:i+2000] for i in range(0, len(content), 2000)]
        
        properties = {
            "Name": {"title": [{"text": {"content": title}}]},
            "Content": {"rich_text": [{"text": {"content": chunk}} for chunk in content_chunks[:100]]},
            "Summary": {"rich_text": [{"text": {"content": summary[:2000]}}] if summary else []},
            "Last Synced": {"date": {"start": datetime.utcnow().isoformat()}},
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.patch(
                f"{self.BASE_URL}/pages/{page_id}",
                headers=self.headers,
                json={"properties": properties},
            )
            response.raise_for_status()
            return response.json()
    
    async def get_page(self, page_id: str) -> dict:
        """Get page details."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/pages/{page_id}",
                headers=self.headers,
            )
            response.raise_for_status()
            return response.json()
    
    async def archive_page(self, page_id: str) -> dict:
        """Archive (soft delete) a page."""
        async with httpx.AsyncClient() as client:
            response = await client.patch(
                f"{self.BASE_URL}/pages/{page_id}",
                headers=self.headers,
                json={"archived": True},
            )
            response.raise_for_status()
            return response.json()


class SyncService:
    """Service for managing sync operations."""
    
    def __init__(self):
        self.client = get_supabase_client()
    
    # ==================== Integration Connection Management ====================
    
    async def get_user_integrations(self, user_id: UUID) -> List[dict]:
        """Get all integration connections for a user."""
        result = self.client.table("integration_connections").select("*").eq(
            "user_id", str(user_id)
        ).execute()
        return result.data
    
    async def get_integration(self, user_id: UUID, provider: IntegrationProvider) -> Optional[dict]:
        """Get a specific integration connection."""
        result = self.client.table("integration_connections").select("*").eq(
            "user_id", str(user_id)
        ).eq("provider", provider).execute()
        
        if result.data:
            return result.data[0]
        return None
    
    async def get_integration_by_id(self, integration_id: UUID) -> Optional[dict]:
        """Get integration by ID."""
        result = self.client.table("integration_connections").select("*").eq(
            "id", str(integration_id)
        ).execute()
        
        if result.data:
            return result.data[0]
        return None
    
    async def create_integration(
        self,
        user_id: UUID,
        provider: IntegrationProvider,
        access_token: str,
        refresh_token: Optional[str] = None,
        token_expires_at: Optional[datetime] = None,
        workspace_id: Optional[str] = None,
        workspace_name: Optional[str] = None,
        database_id: Optional[str] = None,
        database_name: Optional[str] = None,
    ) -> dict:
        """Create or update an integration connection."""
        data = {
            "user_id": str(user_id),
            "provider": provider,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_expires_at": token_expires_at.isoformat() if token_expires_at else None,
            "workspace_id": workspace_id,
            "workspace_name": workspace_name,
            "database_id": database_id,
            "database_name": database_name,
            "is_active": True,
        }
        
        # Upsert (update if exists)
        result = self.client.table("integration_connections").upsert(
            data,
            on_conflict="user_id,provider"
        ).execute()
        
        return result.data[0]
    
    async def update_integration(self, integration_id: UUID, updates: dict) -> Optional[dict]:
        """Update an integration connection."""
        result = self.client.table("integration_connections").update(
            updates
        ).eq("id", str(integration_id)).execute()
        
        if result.data:
            return result.data[0]
        return None
    
    async def update_integration_settings(
        self,
        user_id: UUID,
        provider: IntegrationProvider,
        sync_mode: Optional[SyncMode] = None,
        auto_sync_enabled: Optional[bool] = None,
    ) -> Optional[dict]:
        """Update sync settings for an integration."""
        updates = {}
        if sync_mode is not None:
            updates["sync_mode"] = sync_mode
        if auto_sync_enabled is not None:
            updates["auto_sync_enabled"] = auto_sync_enabled
        
        if not updates:
            return await self.get_integration(user_id, provider)
        
        result = self.client.table("integration_connections").update(
            updates
        ).eq("user_id", str(user_id)).eq("provider", provider).execute()
        
        if result.data:
            return result.data[0]
        return None
    
    async def disconnect_integration(self, user_id: UUID, provider: IntegrationProvider) -> bool:
        """Disconnect (soft delete) an integration."""
        result = self.client.table("integration_connections").update({
            "is_active": False,
            "access_token": None,
            "refresh_token": None,
        }).eq("user_id", str(user_id)).eq("provider", provider).execute()
        
        return len(result.data) > 0
    
    async def delete_integration(self, user_id: UUID, provider: IntegrationProvider) -> bool:
        """Hard delete an integration and all related sync data."""
        # First get the integration
        integration = await self.get_integration(user_id, provider)
        if not integration:
            return False
        
        # Delete sync status records
        self.client.table("note_sync_status").delete().eq(
            "integration_id", integration["id"]
        ).execute()
        
        # Delete the integration
        result = self.client.table("integration_connections").delete().eq(
            "user_id", str(user_id)
        ).eq("provider", provider).execute()
        
        return len(result.data) > 0
    
    # ==================== Notion OAuth ====================
    
    def get_notion_oauth_url(self, user_id: UUID, redirect_uri: str) -> str:
        """Generate Notion OAuth authorization URL."""
        state = f"{user_id}"  # In production, use encrypted state with CSRF token
        
        return (
            f"https://api.notion.com/v1/oauth/authorize"
            f"?client_id={settings.notion_client_id}"
            f"&response_type=code"
            f"&owner=user"
            f"&redirect_uri={redirect_uri}"
            f"&state={state}"
        )
    
    async def exchange_notion_code(self, code: str, redirect_uri: str) -> dict:
        """Exchange OAuth code for access token."""
        import base64
        
        # Basic auth header
        credentials = f"{settings.notion_client_id}:{settings.notion_client_secret}"
        encoded = base64.b64encode(credentials.encode()).decode()
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.notion.com/v1/oauth/token",
                headers={
                    "Authorization": f"Basic {encoded}",
                    "Content-Type": "application/json",
                },
                json={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect_uri,
                },
            )
            response.raise_for_status()
            return response.json()
    
    async def complete_notion_oauth(
        self, 
        user_id: UUID, 
        code: str, 
        redirect_uri: str
    ) -> dict:
        """Complete Notion OAuth flow and create integration."""
        # Exchange code for token
        token_data = await self.exchange_notion_code(code, redirect_uri)
        
        access_token = token_data.get("access_token")
        workspace_id = token_data.get("workspace_id")
        workspace_name = token_data.get("workspace_name")
        
        # Get workspace info
        notion_client = NotionClient(access_token)
        
        # Search for existing FixNote database or create one
        databases = await notion_client.search_databases()
        fixnote_db = None
        
        for db in databases:
            title = db.get("title", [])
            if title and title[0].get("plain_text", "").lower() == "fixnote":
                fixnote_db = db
                break
        
        # Create integration record
        integration = await self.create_integration(
            user_id=user_id,
            provider="notion",
            access_token=access_token,
            workspace_id=workspace_id,
            workspace_name=workspace_name,
            database_id=fixnote_db["id"] if fixnote_db else None,
            database_name="FixNote" if fixnote_db else None,
        )
        
        return {
            "integration": integration,
            "has_database": fixnote_db is not None,
            "databases": databases,
        }
    
    async def set_notion_database(
        self, 
        user_id: UUID, 
        database_id: str
    ) -> dict:
        """Set the Notion database to sync with."""
        integration = await self.get_integration(user_id, "notion")
        if not integration:
            raise ValueError("Notion integration not found")
        
        # Verify database exists and get its name
        notion_client = NotionClient(integration["access_token"])
        db_info = await notion_client.get_database(database_id)
        
        db_name = "Unknown"
        title = db_info.get("title", [])
        if title:
            db_name = title[0].get("plain_text", "Unknown")
        
        # Update integration
        updated = await self.update_integration(
            UUID(integration["id"]),
            {"database_id": database_id, "database_name": db_name}
        )
        
        return updated
    
    # ==================== Sync Operations ====================
    
    def _compute_content_hash(self, content: str, summary: Optional[str] = None) -> str:
        """Compute hash of note content for change detection."""
        data = f"{content}|{summary or ''}"
        return hashlib.sha256(data.encode()).hexdigest()[:16]
    
    async def get_note_sync_status(self, note_id: UUID, integration_id: UUID) -> Optional[dict]:
        """Get sync status for a specific note and integration."""
        result = self.client.table("note_sync_status").select("*").eq(
            "note_id", str(note_id)
        ).eq("integration_id", str(integration_id)).execute()
        
        if result.data:
            return result.data[0]
        return None
    
    async def update_note_sync_status(
        self,
        note_id: UUID,
        integration_id: UUID,
        external_id: Optional[str] = None,
        external_url: Optional[str] = None,
        sync_status: str = "synced",
        local_content_hash: Optional[str] = None,
        external_content_hash: Optional[str] = None,
        error: Optional[str] = None,
    ) -> dict:
        """Update or create sync status for a note."""
        now = datetime.utcnow().isoformat()
        
        data = {
            "note_id": str(note_id),
            "integration_id": str(integration_id),
            "sync_status": sync_status,
            "last_synced_at": now if sync_status == "synced" else None,
            "last_error": error,
        }
        
        if external_id:
            data["external_id"] = external_id
        if external_url:
            data["external_url"] = external_url
        if local_content_hash:
            data["local_content_hash"] = local_content_hash
        if external_content_hash:
            data["external_content_hash"] = external_content_hash
        
        result = self.client.table("note_sync_status").upsert(
            data,
            on_conflict="note_id,integration_id"
        ).execute()
        
        return result.data[0]
    
    async def sync_note_to_notion(
        self, 
        user_id: UUID, 
        note_id: UUID, 
        force: bool = False
    ) -> dict:
        """Sync a single note to Notion."""
        # Get integration
        integration = await self.get_integration(user_id, "notion")
        if not integration or not integration.get("is_active"):
            raise ValueError("Notion integration not active")
        
        if not integration.get("database_id"):
            raise ValueError("Notion database not configured")
        
        # Check sync mode
        sync_mode = integration.get("sync_mode", "two_way")
        if sync_mode == "external_to_app":
            raise ValueError("Sync mode is set to Notion → App only")
        
        # Get note
        note_result = self.client.table("notes").select("*").eq(
            "id", str(note_id)
        ).eq("user_id", str(user_id)).execute()
        
        if not note_result.data:
            raise ValueError("Note not found")
        
        note = note_result.data[0]
        
        # Check if already synced
        sync_status = await self.get_note_sync_status(note_id, UUID(integration["id"]))
        
        # Compute content hash
        local_hash = self._compute_content_hash(note["content"], note.get("summary"))
        
        # Skip if not changed and not forced
        if not force and sync_status and sync_status.get("local_content_hash") == local_hash:
            return {"status": "skipped", "reason": "no_changes"}
        
        notion_client = NotionClient(integration["access_token"])
        
        try:
            note_data = {
                "id": note["id"],
                "content": note["content"],
                "summary": note.get("summary"),
                "source": note.get("source", "text"),
                "created_at": note["created_at"],
            }
            
            if sync_status and sync_status.get("external_id"):
                # Update existing page
                page = await notion_client.update_page(
                    sync_status["external_id"],
                    note_data
                )
                operation = "update"
            else:
                # Create new page
                page = await notion_client.create_page(
                    integration["database_id"],
                    note_data
                )
                operation = "create"
            
            # Update sync status
            await self.update_note_sync_status(
                note_id=note_id,
                integration_id=UUID(integration["id"]),
                external_id=page["id"],
                external_url=page.get("url"),
                sync_status="synced",
                local_content_hash=local_hash,
            )
            
            # Mark note as synced
            self.client.table("notes").update({
                "is_synced": True,
                "needs_sync": False,
            }).eq("id", str(note_id)).execute()
            
            # Record sync history
            await self._record_sync_history(
                user_id=user_id,
                integration_id=UUID(integration["id"]),
                note_id=note_id,
                operation=operation,
                direction="to_external",
                status="success",
            )
            
            return {
                "status": "success",
                "operation": operation,
                "external_id": page["id"],
                "external_url": page.get("url"),
            }
            
        except Exception as e:
            logger.error(f"Failed to sync note {note_id} to Notion: {e}")
            
            # Update sync status with error
            await self.update_note_sync_status(
                note_id=note_id,
                integration_id=UUID(integration["id"]),
                sync_status="error",
                error=str(e),
            )
            
            # Record failed sync
            await self._record_sync_history(
                user_id=user_id,
                integration_id=UUID(integration["id"]),
                note_id=note_id,
                operation="push",
                direction="to_external",
                status="failed",
                error_message=str(e),
            )
            
            raise
    
    async def sync_note_from_notion(
        self,
        user_id: UUID,
        note_id: UUID,
    ) -> dict:
        """Pull changes from Notion for a specific note."""
        integration = await self.get_integration(user_id, "notion")
        if not integration or not integration.get("is_active"):
            raise ValueError("Notion integration not active")
        
        # Check sync mode
        sync_mode = integration.get("sync_mode", "two_way")
        if sync_mode == "app_to_external":
            raise ValueError("Sync mode is set to App → Notion only")
        
        # Get sync status
        sync_status = await self.get_note_sync_status(note_id, UUID(integration["id"]))
        if not sync_status or not sync_status.get("external_id"):
            return {"status": "skipped", "reason": "not_synced_yet"}
        
        notion_client = NotionClient(integration["access_token"])
        
        try:
            # Get page from Notion
            page = await notion_client.get_page(sync_status["external_id"])
            
            # Check if archived (deleted in Notion)
            if page.get("archived"):
                # Soft delete locally
                self.client.table("notes").update({
                    "deleted_at": datetime.utcnow().isoformat()
                }).eq("id", str(note_id)).execute()
                
                await self._record_sync_history(
                    user_id=user_id,
                    integration_id=UUID(integration["id"]),
                    note_id=note_id,
                    operation="delete",
                    direction="from_external",
                    status="success",
                )
                
                return {"status": "deleted"}
            
            # Extract content from Notion page properties
            props = page.get("properties", {})
            
            content_parts = []
            content_prop = props.get("Content", {}).get("rich_text", [])
            for part in content_prop:
                content_parts.append(part.get("plain_text", ""))
            content = "".join(content_parts)
            
            summary_parts = []
            summary_prop = props.get("Summary", {}).get("rich_text", [])
            for part in summary_prop:
                summary_parts.append(part.get("plain_text", ""))
            summary = "".join(summary_parts) or None
            
            # Compute external hash
            external_hash = self._compute_content_hash(content, summary)
            
            # Check for conflict (both changed)
            local_hash = sync_status.get("local_content_hash")
            stored_external_hash = sync_status.get("external_content_hash")
            
            # Get current note
            note_result = self.client.table("notes").select("*").eq(
                "id", str(note_id)
            ).execute()
            
            if note_result.data:
                current_note = note_result.data[0]
                current_local_hash = self._compute_content_hash(
                    current_note["content"], 
                    current_note.get("summary")
                )
                
                # Conflict: local changed and external changed
                if (current_local_hash != local_hash and 
                    external_hash != stored_external_hash):
                    
                    await self.update_note_sync_status(
                        note_id=note_id,
                        integration_id=UUID(integration["id"]),
                        sync_status="conflict",
                    )
                    
                    return {
                        "status": "conflict",
                        "local_content": current_note["content"],
                        "external_content": content,
                    }
            
            # Update local note with Notion content
            self.client.table("notes").update({
                "content": content,
                "summary": summary,
                "needs_sync": False,
            }).eq("id", str(note_id)).execute()
            
            # Update sync status
            await self.update_note_sync_status(
                note_id=note_id,
                integration_id=UUID(integration["id"]),
                sync_status="synced",
                local_content_hash=external_hash,
                external_content_hash=external_hash,
            )
            
            await self._record_sync_history(
                user_id=user_id,
                integration_id=UUID(integration["id"]),
                note_id=note_id,
                operation="update",
                direction="from_external",
                status="success",
            )
            
            return {
                "status": "success",
                "operation": "update",
            }
            
        except Exception as e:
            logger.error(f"Failed to sync note {note_id} from Notion: {e}")
            
            await self._record_sync_history(
                user_id=user_id,
                integration_id=UUID(integration["id"]),
                note_id=note_id,
                operation="pull",
                direction="from_external",
                status="failed",
                error_message=str(e),
            )
            
            raise
    
    async def sync_all_notes(self, user_id: UUID, provider: IntegrationProvider = "notion") -> dict:
        """Sync all notes for a user (for Ultra plan auto-sync)."""
        integration = await self.get_integration(user_id, provider)
        if not integration or not integration.get("is_active"):
            raise ValueError(f"{provider.title()} integration not active")
        
        if provider != "notion":
            raise ValueError(f"{provider.title()} sync not yet supported")
        
        # Get all notes that need sync
        notes_result = self.client.rpc("get_notes_pending_sync", {
            "p_user_id": str(user_id),
            "p_integration_id": integration["id"],
        }).execute()
        
        results = {
            "synced": 0,
            "failed": 0,
            "skipped": 0,
            "errors": [],
        }
        
        for note in notes_result.data:
            try:
                result = await self.sync_note_to_notion(
                    user_id, 
                    UUID(note["note_id"]),
                    force=False
                )
                if result["status"] == "success":
                    results["synced"] += 1
                else:
                    results["skipped"] += 1
            except Exception as e:
                results["failed"] += 1
                results["errors"].append({
                    "note_id": note["note_id"],
                    "error": str(e),
                })
        
        # Update last sync time
        await self.update_integration(
            UUID(integration["id"]),
            {"last_sync_at": datetime.utcnow().isoformat()}
        )
        
        return results
    
    async def delete_note_from_notion(self, user_id: UUID, note_id: UUID) -> dict:
        """Archive note in Notion when deleted locally."""
        integration = await self.get_integration(user_id, "notion")
        if not integration or not integration.get("is_active"):
            return {"status": "skipped", "reason": "no_integration"}
        
        sync_status = await self.get_note_sync_status(note_id, UUID(integration["id"]))
        if not sync_status or not sync_status.get("external_id"):
            return {"status": "skipped", "reason": "not_synced"}
        
        try:
            notion_client = NotionClient(integration["access_token"])
            await notion_client.archive_page(sync_status["external_id"])
            
            # Clean up sync status
            self.client.table("note_sync_status").delete().eq(
                "note_id", str(note_id)
            ).eq("integration_id", integration["id"]).execute()
            
            await self._record_sync_history(
                user_id=user_id,
                integration_id=UUID(integration["id"]),
                note_id=note_id,
                operation="delete",
                direction="to_external",
                status="success",
            )
            
            return {"status": "success"}
            
        except Exception as e:
            logger.error(f"Failed to delete note {note_id} from Notion: {e}")
            return {"status": "failed", "error": str(e)}
    
    # ==================== Sync History ====================
    
    async def _record_sync_history(
        self,
        user_id: UUID,
        integration_id: UUID,
        note_id: Optional[UUID],
        operation: str,
        direction: SyncDirection,
        status: str,
        details: Optional[dict] = None,
        error_message: Optional[str] = None,
    ):
        """Record a sync operation in history."""
        self.client.table("sync_history").insert({
            "user_id": str(user_id),
            "integration_id": str(integration_id),
            "note_id": str(note_id) if note_id else None,
            "operation": operation,
            "direction": direction,
            "status": status,
            "details": details,
            "error_message": error_message,
        }).execute()
    
    async def get_sync_history(
        self, 
        user_id: UUID, 
        limit: int = 50
    ) -> List[dict]:
        """Get sync history for a user."""
        result = self.client.table("sync_history").select("*").eq(
            "user_id", str(user_id)
        ).order("created_at", desc=True).limit(limit).execute()
        
        return result.data
    
    # ==================== Resolve Conflicts ====================
    
    async def resolve_conflict(
        self,
        user_id: UUID,
        note_id: UUID,
        resolution: Literal["keep_local", "keep_external", "keep_both"],
    ) -> dict:
        """Resolve a sync conflict."""
        integration = await self.get_integration(user_id, "notion")
        if not integration:
            raise ValueError("No integration found")
        
        sync_status = await self.get_note_sync_status(note_id, UUID(integration["id"]))
        if not sync_status or sync_status.get("sync_status") != "conflict":
            raise ValueError("No conflict to resolve")
        
        if resolution == "keep_local":
            # Push local version to Notion
            return await self.sync_note_to_notion(user_id, note_id, force=True)
        
        elif resolution == "keep_external":
            # Pull from Notion
            return await self.sync_note_from_notion(user_id, note_id)
        
        elif resolution == "keep_both":
            # Create a copy of the note with Notion content
            # Get Notion content
            notion_client = NotionClient(integration["access_token"])
            page = await notion_client.get_page(sync_status["external_id"])
            
            props = page.get("properties", {})
            content_parts = []
            for part in props.get("Content", {}).get("rich_text", []):
                content_parts.append(part.get("plain_text", ""))
            external_content = "".join(content_parts)
            
            summary_parts = []
            for part in props.get("Summary", {}).get("rich_text", []):
                summary_parts.append(part.get("plain_text", ""))
            external_summary = "".join(summary_parts) or None
            
            # Create new note with external content
            new_note = self.client.table("notes").insert({
                "user_id": str(user_id),
                "content": f"[From Notion] {external_content}",
                "summary": external_summary,
                "source": "text",
            }).execute()
            
            # Sync original (local version) to Notion
            await self.sync_note_to_notion(user_id, note_id, force=True)
            
            return {
                "status": "resolved",
                "resolution": "keep_both",
                "new_note_id": new_note.data[0]["id"],
            }
        
        raise ValueError(f"Invalid resolution: {resolution}")

