"""
Background scheduler for automatic synchronization.
Handles periodic sync for Ultra users with auto_sync_enabled.
"""

import logging
import asyncio
from datetime import datetime
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from .db.supabase import get_supabase_client
from .services.sync_service import SyncService

logger = logging.getLogger(__name__)

# Global scheduler instance
scheduler: Optional[AsyncIOScheduler] = None


async def sync_user_notes(user_id: str, user_email: str = ""):
    """Sync all notes for a single user."""
    sync_service = SyncService()
    
    try:
        logger.info(f"Auto-sync started for user {user_id}")
        result = await sync_service.sync_all_notes(user_id, "notion")
        
        logger.info(
            f"Auto-sync completed for user {user_id}: "
            f"synced={result.get('synced', 0)}, "
            f"failed={result.get('failed', 0)}, "
            f"skipped={result.get('skipped', 0)}"
        )
        
        return result
    except Exception as e:
        logger.error(f"Auto-sync failed for user {user_id}: {e}")
        return {"synced": 0, "failed": 1, "error": str(e)}


async def run_auto_sync_job():
    """
    Main auto-sync job that runs periodically.
    Finds all users with auto_sync_enabled and syncs their notes.
    """
    logger.info("Starting auto-sync job...")
    
    try:
        client = get_supabase_client()
        
        # Find all active integrations with auto_sync_enabled
        result = client.table("integration_connections").select(
            "user_id, provider, workspace_name"
        ).eq(
            "is_active", True
        ).eq(
            "auto_sync_enabled", True
        ).not_.is_("database_id", "null").execute()
        
        if not result.data:
            logger.info("No users with auto-sync enabled")
            return
        
        logger.info(f"Found {len(result.data)} users with auto-sync enabled")
        
        # Process each user
        total_synced = 0
        total_failed = 0
        
        for integration in result.data:
            user_id = integration["user_id"]
            
            # Run sync for this user
            sync_result = await sync_user_notes(
                user_id, 
                integration.get("workspace_name", "")
            )
            
            total_synced += sync_result.get("synced", 0)
            total_failed += sync_result.get("failed", 0)
            
            # Small delay between users to avoid rate limiting
            await asyncio.sleep(1)
        
        logger.info(
            f"Auto-sync job completed: "
            f"users={len(result.data)}, "
            f"total_synced={total_synced}, "
            f"total_failed={total_failed}"
        )
        
    except Exception as e:
        logger.error(f"Auto-sync job failed: {e}")


def start_scheduler():
    """Initialize and start the background scheduler."""
    global scheduler
    
    if scheduler is not None:
        logger.warning("Scheduler already running")
        return scheduler
    
    scheduler = AsyncIOScheduler()
    
    # Add the auto-sync job - runs every 5 minutes
    scheduler.add_job(
        run_auto_sync_job,
        trigger=IntervalTrigger(minutes=5),
        id="auto_sync_job",
        name="Auto-sync notes for Ultra users",
        replace_existing=True,
        max_instances=1,  # Prevent overlapping runs
    )
    
    # Start the scheduler
    scheduler.start()
    logger.info("Background scheduler started (auto-sync every 5 minutes)")
    
    return scheduler


def stop_scheduler():
    """Stop the background scheduler."""
    global scheduler
    
    if scheduler is not None:
        scheduler.shutdown(wait=False)
        scheduler = None
        logger.info("Background scheduler stopped")


def get_scheduler() -> Optional[AsyncIOScheduler]:
    """Get the current scheduler instance."""
    return scheduler


async def trigger_user_sync(user_id: str):
    """
    Manually trigger sync for a specific user.
    Can be called when a note is created/updated for immediate sync.
    """
    # Check if user has auto-sync enabled
    client = get_supabase_client()
    
    result = client.table("integration_connections").select(
        "id, auto_sync_enabled, database_id"
    ).eq(
        "user_id", user_id
    ).eq(
        "is_active", True
    ).eq(
        "provider", "notion"
    ).execute()
    
    if not result.data:
        return None
    
    integration = result.data[0]
    
    if not integration.get("auto_sync_enabled") or not integration.get("database_id"):
        return None
    
    # Run sync
    return await sync_user_notes(user_id)


