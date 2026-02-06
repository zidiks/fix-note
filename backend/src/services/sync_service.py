"""
Sync service for managing integrations with Notion, Obsidian, and Anytype.
Handles OAuth, sync operations, and conflict resolution.
"""

import logging
import httpx
from typing import Optional, List, Literal
from uuid import UUID
from datetime import datetime, timedelta

from ..db.supabase import get_supabase_client
from ..config import settings
from ..db.models import NoteCreate, NoteUpdate
from .notes_service import NotesService

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
        # First, get database schema to find the title property name
        db_info = await self.get_database(database_id)
        title_property_name = "Name"  # Default
        
        # Find the title property (every database has exactly one)
        for prop_name, prop_info in db_info.get("properties", {}).items():
            if prop_info.get("type") == "title":
                title_property_name = prop_name
                break
        
        # Use AI-generated title or first 100 chars of content
        content = note_data.get("content", "")
        title = (note_data.get("title") or "").strip() or content[:100]
        if not note_data.get("title") and len(content) > 100:
            title += "..."
        
        summary = note_data.get("summary", "") or ""
        
        # Only use the title property (which every database has)
        properties = {
            title_property_name: {"title": [{"text": {"content": title}}]},
        }
        
        # Build page body with content blocks
        children = []
        
        # Add summary as callout if exists
        if summary:
            children.append({
                "object": "block",
                "type": "callout",
                "callout": {
                    "rich_text": [{"type": "text", "text": {"content": summary[:2000]}}],
                    "icon": {"emoji": "📝"},
                    "color": "blue_background"
                }
            })
        
        # Add content as paragraphs (split by newlines and Notion's 2000 char limit)
        paragraphs = content.split('\n')
        for para in paragraphs:
            if para.strip():
                # Split long paragraphs into chunks
                chunks = [para[i:i+2000] for i in range(0, len(para), 2000)]
                for chunk in chunks:
                    children.append({
                        "object": "block",
                        "type": "paragraph",
                        "paragraph": {
                            "rich_text": [{"type": "text", "text": {"content": chunk}}]
                        }
                    })
        
        # Add metadata as divider + small text
        children.append({"object": "block", "type": "divider", "divider": {}})
        meta_text = f"📱 FixNote | Source: {note_data.get('source', 'text')} | ID: {note_data.get('id', '')}"
        children.append({
            "object": "block",
            "type": "paragraph",
            "paragraph": {
                "rich_text": [{"type": "text", "text": {"content": meta_text}, "annotations": {"color": "gray"}}]
            }
        })
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.BASE_URL}/pages",
                headers=self.headers,
                json={
                    "parent": {"database_id": database_id},
                    "properties": properties,
                    "children": children[:100],  # Notion limit: 100 blocks per request
                },
            )
            response.raise_for_status()
            return response.json()
    
    async def update_page(self, page_id: str, note_data: dict) -> dict:
        """Update an existing page."""
        # Get page to find title property name
        page_info = await self.get_page(page_id)
        title_property_name = "Name"  # Default
        
        # Find the title property
        for prop_name, prop_info in page_info.get("properties", {}).items():
            if prop_info.get("type") == "title":
                title_property_name = prop_name
                break
        
        content = note_data.get("content", "")
        title = (note_data.get("title") or "").strip() or content[:100]
        if not note_data.get("title") and len(content) > 100:
            title += "..."

        # Update only the title property
        properties = {
            title_property_name: {"title": [{"text": {"content": title}}]},
        }
        
        async with httpx.AsyncClient() as client:
            # Update properties
            response = await client.patch(
                f"{self.BASE_URL}/pages/{page_id}",
                headers=self.headers,
                json={"properties": properties},
            )
            response.raise_for_status()
            
            # Delete old blocks and add new ones
            # First get all children
            children_response = await client.get(
                f"{self.BASE_URL}/blocks/{page_id}/children",
                headers=self.headers,
            )
            children_response.raise_for_status()
            old_children = children_response.json().get("results", [])
            
            # Delete old blocks
            for block in old_children:
                await client.delete(
                    f"{self.BASE_URL}/blocks/{block['id']}",
                    headers=self.headers,
                )
            
            # Add new content blocks
            summary = note_data.get("summary", "") or ""
            new_children = []
            
            if summary:
                new_children.append({
                    "object": "block",
                    "type": "callout",
                    "callout": {
                        "rich_text": [{"type": "text", "text": {"content": summary[:2000]}}],
                        "icon": {"emoji": "📝"},
                        "color": "blue_background"
                    }
                })
            
            paragraphs = content.split('\n')
            for para in paragraphs:
                if para.strip():
                    chunks = [para[i:i+2000] for i in range(0, len(para), 2000)]
                    for chunk in chunks:
                        new_children.append({
                            "object": "block",
                            "type": "paragraph",
                            "paragraph": {
                                "rich_text": [{"type": "text", "text": {"content": chunk}}]
                            }
                        })
            
            new_children.append({"object": "block", "type": "divider", "divider": {}})
            meta_text = f"📱 FixNote | Source: {note_data.get('source', 'text')} | ID: {note_data.get('id', '')} | Updated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"
            new_children.append({
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{"type": "text", "text": {"content": meta_text}, "annotations": {"color": "gray"}}]
                }
            })
            
            # Append new children
            if new_children:
                await client.patch(
                    f"{self.BASE_URL}/blocks/{page_id}/children",
                    headers=self.headers,
                    json={"children": new_children[:100]},
                )
            
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
        self.notes_service = NotesService()
    
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
    
    async def _compute_content_hash(
        self,
        user_id: UUID,
        content: str,
        summary: Optional[str] = None,
    ) -> str:
        """Compute hash of note content for change detection."""
        return await self.notes_service.compute_combined_hash(user_id, content, summary)
    
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
        """Sync a single note to Notion with two-way sync support."""
        # Get integration
        integration = await self.get_integration(user_id, "notion")
        if not integration or not integration.get("is_active"):
            raise ValueError("Notion integration not active")
        
        if not integration.get("database_id"):
            raise ValueError("Notion database not configured")
        
        # Check sync mode
        sync_mode = integration.get("sync_mode", "two_way")
        
        # Get note (exclude deleted)
        note_meta = await self.notes_service.get_note_with_meta(note_id, user_id)
        if not note_meta:
            raise ValueError("Note not found or deleted")
        note = note_meta["note"]
        
        # Check if already synced
        sync_status = await self.get_note_sync_status(note_id, UUID(integration["id"]))
        
        notion_client = NotionClient(integration["access_token"])
        
        # If already synced, check for two-way sync
        if sync_status and sync_status.get("external_id"):
            try:
                # Get Notion page to check last edited time
                notion_page = await notion_client.get_page(sync_status["external_id"])
                notion_last_edited = notion_page.get("last_edited_time", "")
                local_updated_at = (note.updated_at or note.created_at).isoformat()
                
                # Parse dates for comparison
                from dateutil import parser as date_parser
                notion_time = date_parser.isoparse(notion_last_edited) if notion_last_edited else None
                local_time = date_parser.isoparse(local_updated_at) if local_updated_at else None
                
                # Two-way sync: determine which is newer
                if sync_mode == "two_way" and notion_time and local_time:
                    # Add small buffer (5 seconds) to avoid sync loops
                    from datetime import timedelta
                    if notion_time > local_time + timedelta(seconds=5):
                        # Notion is newer - pull changes
                        return await self._pull_from_notion(
                            user_id, note_id, integration, sync_status, notion_client
                        )
                
                # Check if mode allows pushing to Notion
                if sync_mode == "external_to_app":
                    # Only pull from Notion, don't push
                    return await self._pull_from_notion(
                        user_id, note_id, integration, sync_status, notion_client
                    )
                    
            except Exception as e:
                logger.warning(f"Could not check Notion page status: {e}")
                # Continue with push if we can't check
        
        # Check if mode allows pushing
        if sync_mode == "external_to_app":
            raise ValueError("Sync mode is set to Notion → App only")
        
        # Compute content hash
        local_hash = note_meta["combined_hash"]
        
        # Skip if not changed and not forced
        if not force and sync_status and sync_status.get("local_content_hash") == local_hash:
            return {"status": "skipped", "reason": "no_changes"}
        
        try:
            note_data = {
                "id": note.id,
                "content": note.content,
                "title": note.title,
                "summary": note.summary,
                "source": note.source,
                "created_at": note.created_at,
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
    
    async def _pull_from_notion(
        self,
        user_id: UUID,
        note_id: UUID,
        integration: dict,
        sync_status: dict,
        notion_client: NotionClient
    ) -> dict:
        """Pull changes from Notion page to local note."""
        try:
            page_id = sync_status["external_id"]
            
            # Get page content (blocks)
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{notion_client.BASE_URL}/blocks/{page_id}/children",
                    headers=notion_client.headers,
                )
                response.raise_for_status()
                blocks = response.json().get("results", [])
            
            # Extract text content from blocks
            content_parts = []
            summary = None
            
            for block in blocks:
                block_type = block.get("type")
                
                if block_type == "callout":
                    # Callout is our summary
                    callout = block.get("callout", {})
                    rich_text = callout.get("rich_text", [])
                    summary = "".join([t.get("plain_text", "") for t in rich_text])
                    
                elif block_type == "paragraph":
                    paragraph = block.get("paragraph", {})
                    rich_text = paragraph.get("rich_text", [])
                    text = "".join([t.get("plain_text", "") for t in rich_text])
                    # Skip metadata line
                    if text and not text.startswith("📱 FixNote"):
                        content_parts.append(text)
                        
                elif block_type == "heading_1":
                    h1 = block.get("heading_1", {})
                    rich_text = h1.get("rich_text", [])
                    text = "".join([t.get("plain_text", "") for t in rich_text])
                    if text:
                        content_parts.append(f"# {text}")
                        
                elif block_type == "heading_2":
                    h2 = block.get("heading_2", {})
                    rich_text = h2.get("rich_text", [])
                    text = "".join([t.get("plain_text", "") for t in rich_text])
                    if text:
                        content_parts.append(f"## {text}")
                        
                elif block_type == "heading_3":
                    h3 = block.get("heading_3", {})
                    rich_text = h3.get("rich_text", [])
                    text = "".join([t.get("plain_text", "") for t in rich_text])
                    if text:
                        content_parts.append(f"### {text}")
                        
                elif block_type == "bulleted_list_item":
                    item = block.get("bulleted_list_item", {})
                    rich_text = item.get("rich_text", [])
                    text = "".join([t.get("plain_text", "") for t in rich_text])
                    if text:
                        content_parts.append(f"• {text}")
                        
                elif block_type == "numbered_list_item":
                    item = block.get("numbered_list_item", {})
                    rich_text = item.get("rich_text", [])
                    text = "".join([t.get("plain_text", "") for t in rich_text])
                    if text:
                        content_parts.append(f"- {text}")
            
            content = "\n".join(content_parts)
            
            if not content.strip():
                return {"status": "skipped", "reason": "no_content_in_notion"}
            
            # Update local note (encrypted)
            await self.notes_service.update_note(
                note_id=note_id,
                user_id=user_id,
                note_data=NoteUpdate(content=content, summary=summary),
            )
            # Mark as synced to avoid re-push
            self.client.table("notes").update({
                "needs_sync": False,
            }).eq("id", str(note_id)).execute()
            
            # Update sync status
            local_hash = await self._compute_content_hash(user_id, content, summary)
            await self.update_note_sync_status(
                note_id=note_id,
                integration_id=UUID(integration["id"]),
                sync_status="synced",
                local_content_hash=local_hash,
            )
            
            # Record sync history
            await self._record_sync_history(
                user_id=user_id,
                integration_id=UUID(integration["id"]),
                note_id=note_id,
                operation="pull",
                direction="from_external",
                status="success",
            )
            
            return {
                "status": "success",
                "operation": "pull",
                "direction": "from_notion",
            }
            
        except Exception as e:
            logger.error(f"Failed to pull note {note_id} from Notion: {e}")
            raise
            
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
            external_hash = await self._compute_content_hash(user_id, content, summary)
            
            # Check for conflict (both changed)
            local_hash = sync_status.get("local_content_hash")
            stored_external_hash = sync_status.get("external_content_hash")
            
            # Get current note (exclude deleted)
            note_meta = await self.notes_service.get_note_with_meta(note_id, user_id)
            if note_meta:
                current_note = note_meta["note"]
                current_local_hash = note_meta["combined_hash"]
                
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
                        "local_content": current_note.content,
                        "external_content": content,
                    }
            
            # Update local note with Notion content
            await self.notes_service.update_note(
                note_id=note_id,
                user_id=user_id,
                note_data=NoteUpdate(content=content, summary=summary),
            )
            self.client.table("notes").update({
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
            new_note = await self.notes_service.create_note(
                user_id=user_id,
                note_data=NoteCreate(
                    content=f"[From Notion] {external_content}",
                    summary=external_summary,
                    source="text",
                ),
            )
            
            # Sync original (local version) to Notion
            await self.sync_note_to_notion(user_id, note_id, force=True)
            
            return {
                "status": "resolved",
                "resolution": "keep_both",
                "new_note_id": str(new_note.id),
            }
        
        raise ValueError(f"Invalid resolution: {resolution}")
