// Shared TypeScript types for FixNote native app
// Ported from frontend/src/api/client.ts

export interface Note {
  id: string;
  user_id: string;
  content: string;
  title: string | null;
  summary: string | null;
  source: 'voice' | 'text' | 'photo';
  duration_seconds: number | null;
  images: string[] | null;
  voice_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteCreate {
  content: string;
  title?: string;
  summary?: string;
  source?: 'voice' | 'text';
  duration_seconds?: number;
}

export interface NoteUpdate {
  content?: string;
  title?: string;
  summary?: string;
}

export interface SearchResult {
  id: string;
  content: string;
  summary: string | null;
  similarity: number;
  created_at: string;
}

export interface FTSSearchResult {
  id: string;
  content: string;
  title: string | null;
  summary: string | null;
  source: 'voice' | 'text' | 'photo';
  duration_seconds: number | null;
  images: string[] | null;
  voice_url: string | null;
  created_at: string;
  rank: number;
}

export interface ShareResponse {
  share_url: string;
  share_token: string;
  is_public: boolean;
}

export interface SharedNoteResponse {
  note: {
    id: string;
    content: string;
    title: string | null;
    summary: string | null;
    source: 'voice' | 'text' | 'photo';
    duration_seconds: number | null;
    images: string[] | null;
    voice_url: string | null;
    created_at: string;
  };
  is_owner: boolean;
  can_edit: boolean;
}

export interface FTSSearchResponse {
  results: FTSSearchResult[];
  query: string;
}

export interface NotesListResponse {
  notes: Note[];
  total: number;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
}

export interface Stats {
  total_notes: number;
  voice_notes: number;
  text_notes: number;
  notes_this_week: number;
  notes_this_month: number;
}

export type SubscriptionPlan = 'free' | 'trial' | 'pro' | 'ultra';
export type BillingPeriod = 'monthly' | 'yearly';

export interface SubscriptionLimits {
  summaries_per_month: number | null;
  voice_minutes_per_month: number | null;
  ai_chat_enabled: boolean;
  ai_chat_fast: boolean;
  sync_enabled: boolean;
  auto_sync: boolean;
  price_monthly_stars: number;
  price_yearly_stars: number;
}

export interface UsageStats {
  summaries_used: number;
  voice_seconds_used: number;
  chat_messages_used: number;
}

export interface SubscriptionInfo {
  plan: SubscriptionPlan;
  billing_period: BillingPeriod | null;
  is_recurring: boolean;
  is_canceled: boolean;
  canceled_at: string | null;
  subscription_started_at: string | null;
  subscription_expires_at: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  limits: SubscriptionLimits;
  usage: UsageStats;
}

export interface IAPVerifyResponse {
  success: boolean;
  plan: SubscriptionPlan;
  billing_period: BillingPeriod;
  subscription_expires_at: string | null;
}

export type IntegrationProvider = 'notion' | 'obsidian' | 'anytype';
export type SyncMode = 'two_way' | 'app_to_external' | 'external_to_app';
export type SyncStatusType = 'pending' | 'syncing' | 'synced' | 'error' | 'conflict';

export interface IntegrationConnection {
  id: string;
  provider: IntegrationProvider;
  is_active: boolean;
  workspace_name: string | null;
  database_id: string | null;
  database_name: string | null;
  sync_mode: SyncMode;
  auto_sync_enabled: boolean;
  last_sync_at: string | null;
  last_error: string | null;
}

export interface AvailableProvider {
  provider: IntegrationProvider;
  name: string;
  available: boolean;
  icon: string;
  coming_soon?: boolean;
  databases?: NotionDatabase[];
  needs_database_selection?: boolean;
}

export interface IntegrationsListResponse {
  integrations: IntegrationConnection[];
  available_providers: AvailableProvider[];
}

export interface NotionOAuthStartResponse {
  authorization_url: string;
}

export interface NotionDatabase {
  id: string;
  name: string;
  url?: string;
}

export interface NotionOAuthCallbackResponse {
  success: boolean;
  integration: IntegrationConnection | null;
  has_database: boolean;
  available_databases: NotionDatabase[] | null;
}

export interface SyncNoteResponse {
  status: string;
  operation?: string;
  external_id?: string;
  external_url?: string;
  reason?: string;
  error?: string;
}

export interface SyncAllResponse {
  synced: number;
  failed: number;
  skipped: number;
  errors: Array<{ note_id: string; error: string }>;
}

export interface NoteSyncStatusResponse {
  synced: boolean;
  has_integration: boolean;
  sync_status: SyncStatusType | null;
  external_url: string | null;
  last_synced_at: string | null;
  has_conflict: boolean;
}

export interface SyncHistoryEntry {
  id: string;
  user_id: string;
  integration_id: string | null;
  note_id: string | null;
  operation: string;
  direction: string;
  status: string;
  details: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
}

export interface SyncHistoryResponse {
  history: SyncHistoryEntry[];
  total: number;
}

// Auth types (new for native)
export interface AuthUser {
  id: string;
  telegram_id: number | null;
  username: string | null;
  first_name: string | null;
  display_name: string | null;
  photo_url: string | null;
  language_code: string | null;
  auth_provider: 'telegram' | 'apple' | 'google';
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}
