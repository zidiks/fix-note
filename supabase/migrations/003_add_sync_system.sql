-- Sync system migration
-- Adds tables and fields for Notion/Obsidian/Anytype integrations

-- Integration provider enum type
DO $$ BEGIN
    CREATE TYPE integration_provider AS ENUM ('notion', 'obsidian', 'anytype');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Sync mode enum type
DO $$ BEGIN
    CREATE TYPE sync_mode AS ENUM ('two_way', 'app_to_external', 'external_to_app');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Sync status enum type
DO $$ BEGIN
    CREATE TYPE sync_status AS ENUM ('pending', 'syncing', 'synced', 'error', 'conflict');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Integration connections table
-- Stores OAuth tokens and connection settings for each provider
CREATE TABLE IF NOT EXISTS integration_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Provider info
    provider integration_provider NOT NULL,
    is_active BOOLEAN DEFAULT true,
    
    -- OAuth tokens (encrypted in production)
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    
    -- Provider-specific data
    -- For Notion: workspace_id, workspace_name, database_id
    workspace_id VARCHAR(255),
    workspace_name VARCHAR(255),
    database_id VARCHAR(255),
    database_name VARCHAR(255),
    
    -- Sync settings
    sync_mode sync_mode DEFAULT 'two_way',
    auto_sync_enabled BOOLEAN DEFAULT false, -- Only for Ultra plan
    
    -- Metadata
    last_sync_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- One connection per provider per user
    UNIQUE(user_id, provider)
);

-- Note sync status table
-- Tracks sync state for each note per integration
CREATE TABLE IF NOT EXISTS note_sync_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
    integration_id UUID REFERENCES integration_connections(id) ON DELETE CASCADE,
    
    -- External identifiers
    -- For Notion: page_id
    external_id VARCHAR(255),
    external_url TEXT,
    
    -- Sync tracking
    sync_status sync_status DEFAULT 'pending',
    local_version INTEGER DEFAULT 1,
    external_version INTEGER DEFAULT 0,
    
    -- Content hashes for conflict detection
    local_content_hash VARCHAR(64),
    external_content_hash VARCHAR(64),
    
    -- Timestamps
    last_synced_at TIMESTAMPTZ,
    last_local_update TIMESTAMPTZ,
    last_external_update TIMESTAMPTZ,
    last_error TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- One sync status per note per integration
    UNIQUE(note_id, integration_id)
);

-- Sync history/log table
-- Tracks all sync operations for debugging and audit
CREATE TABLE IF NOT EXISTS sync_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    integration_id UUID REFERENCES integration_connections(id) ON DELETE SET NULL,
    note_id UUID REFERENCES notes(id) ON DELETE SET NULL,
    
    -- Operation details
    operation VARCHAR(50) NOT NULL, -- 'push', 'pull', 'create', 'update', 'delete', 'conflict'
    direction VARCHAR(20) NOT NULL, -- 'to_external', 'from_external'
    status VARCHAR(20) NOT NULL, -- 'success', 'failed', 'skipped'
    
    -- Details
    details JSONB,
    error_message TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add sync-related columns to notes table
ALTER TABLE notes
ADD COLUMN IF NOT EXISTS is_synced BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS needs_sync BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS content_version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ; -- Soft delete for sync

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_integration_connections_user ON integration_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_integration_connections_provider ON integration_connections(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_note_sync_status_note ON note_sync_status(note_id);
CREATE INDEX IF NOT EXISTS idx_note_sync_status_integration ON note_sync_status(integration_id);
CREATE INDEX IF NOT EXISTS idx_note_sync_status_pending ON note_sync_status(sync_status) WHERE sync_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_sync_history_user ON sync_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_needs_sync ON notes(user_id, needs_sync) WHERE needs_sync = true;
CREATE INDEX IF NOT EXISTS idx_notes_deleted ON notes(deleted_at) WHERE deleted_at IS NOT NULL;

-- RLS Policies
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_sync_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_history ENABLE ROW LEVEL SECURITY;

-- Policies for integration_connections
DROP POLICY IF EXISTS "Users can view own connections" ON integration_connections;
CREATE POLICY "Users can view own connections" ON integration_connections FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own connections" ON integration_connections;
CREATE POLICY "Users can insert own connections" ON integration_connections FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own connections" ON integration_connections;
CREATE POLICY "Users can update own connections" ON integration_connections FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Users can delete own connections" ON integration_connections;
CREATE POLICY "Users can delete own connections" ON integration_connections FOR DELETE USING (true);

-- Policies for note_sync_status
DROP POLICY IF EXISTS "Users can view own sync status" ON note_sync_status;
CREATE POLICY "Users can view own sync status" ON note_sync_status FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert sync status" ON note_sync_status;
CREATE POLICY "Users can insert sync status" ON note_sync_status FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update sync status" ON note_sync_status;
CREATE POLICY "Users can update sync status" ON note_sync_status FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Users can delete sync status" ON note_sync_status;
CREATE POLICY "Users can delete sync status" ON note_sync_status FOR DELETE USING (true);

-- Policies for sync_history
DROP POLICY IF EXISTS "Users can view own sync history" ON sync_history;
CREATE POLICY "Users can view own sync history" ON sync_history FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert sync history" ON sync_history;
CREATE POLICY "Users can insert sync history" ON sync_history FOR INSERT WITH CHECK (true);

-- Function to mark note as needing sync when content changes
CREATE OR REPLACE FUNCTION mark_note_needs_sync()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.content IS DISTINCT FROM NEW.content OR OLD.summary IS DISTINCT FROM NEW.summary THEN
        NEW.needs_sync := true;
        NEW.content_version := COALESCE(OLD.content_version, 0) + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_mark_note_needs_sync ON notes;
CREATE TRIGGER trigger_mark_note_needs_sync
    BEFORE UPDATE ON notes
    FOR EACH ROW
    EXECUTE FUNCTION mark_note_needs_sync();

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_integration_connections_updated_at ON integration_connections;
CREATE TRIGGER update_integration_connections_updated_at
    BEFORE UPDATE ON integration_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_note_sync_status_updated_at ON note_sync_status;
CREATE TRIGGER update_note_sync_status_updated_at
    BEFORE UPDATE ON note_sync_status
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to get notes pending sync for a user
CREATE OR REPLACE FUNCTION get_notes_pending_sync(p_user_id UUID, p_integration_id UUID)
RETURNS TABLE (
    note_id UUID,
    content TEXT,
    summary TEXT,
    source VARCHAR(20),
    local_version INTEGER,
    sync_status sync_status,
    external_id VARCHAR(255),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        n.id as note_id,
        n.content,
        n.summary,
        n.source,
        n.content_version as local_version,
        COALESCE(nss.sync_status, 'pending'::sync_status) as sync_status,
        nss.external_id,
        n.created_at,
        n.updated_at
    FROM notes n
    LEFT JOIN note_sync_status nss ON n.id = nss.note_id AND nss.integration_id = p_integration_id
    WHERE n.user_id = p_user_id
      AND n.deleted_at IS NULL
      AND (n.needs_sync = true OR nss.id IS NULL OR nss.sync_status IN ('pending', 'error'))
    ORDER BY n.updated_at DESC;
END;
$$;

-- Function to record sync operation
CREATE OR REPLACE FUNCTION record_sync_operation(
    p_user_id UUID,
    p_integration_id UUID,
    p_note_id UUID,
    p_operation VARCHAR(50),
    p_direction VARCHAR(20),
    p_status VARCHAR(20),
    p_details JSONB DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_history_id UUID;
BEGIN
    INSERT INTO sync_history (user_id, integration_id, note_id, operation, direction, status, details, error_message)
    VALUES (p_user_id, p_integration_id, p_note_id, p_operation, p_direction, p_status, p_details, p_error_message)
    RETURNING id INTO v_history_id;
    
    RETURN v_history_id;
END;
$$;

