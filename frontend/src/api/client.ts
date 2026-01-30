// Get Telegram init data for authentication
const getInitData = (): string => {
  // Check real Telegram WebApp first
  if (typeof window !== 'undefined' && window.Telegram?.WebApp?.initData) {
    return window.Telegram.WebApp.initData
  }
  
  // Dev mode: use VITE_DEV_INIT_DATA from env
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_INIT_DATA) {
    return import.meta.env.VITE_DEV_INIT_DATA
  }
  
  return ''
}

// API base configuration
// In dev mode, can use VITE_API_URL to point to remote server
// Example: VITE_API_URL=https://fixnote.space/api
const API_BASE = import.meta.env.VITE_API_URL || '/api'

// Types
export interface Note {
  id: string
  user_id: string
  content: string
  summary: string | null
  source: 'voice' | 'text'
  duration_seconds: number | null
  created_at: string
  updated_at: string
}

export interface NoteCreate {
  content: string
  summary?: string
  source?: 'voice' | 'text'
  duration_seconds?: number
}

export interface NoteUpdate {
  content?: string
  summary?: string
}

export interface SearchResult {
  id: string
  content: string
  summary: string | null
  similarity: number
  created_at: string
}

export interface FTSSearchResult {
  id: string
  content: string
  summary: string | null
  source: 'voice' | 'text'
  duration_seconds: number | null
  created_at: string
  rank: number
}

export interface ShareResponse {
  share_url: string
  share_token: string
  is_public: boolean
}

export interface SharedNoteResponse {
  note: {
    id: string
    content: string
    summary: string | null
    source: 'voice' | 'text'
    duration_seconds: number | null
    created_at: string
  }
  is_owner: boolean
  can_edit: boolean
}

export interface FTSSearchResponse {
  results: FTSSearchResult[]
  query: string
}

export interface NotesListResponse {
  notes: Note[]
  total: number
}

export interface SearchResponse {
  results: SearchResult[]
  query: string
}

export interface Stats {
  total_notes: number
  voice_notes: number
  text_notes: number
  notes_this_week: number
  notes_this_month: number
}

// Subscription types
export type SubscriptionPlan = 'free' | 'trial' | 'pro' | 'ultra'
export type BillingPeriod = 'monthly' | 'yearly'

export interface SubscriptionLimits {
  summaries_per_month: number | null
  voice_minutes_per_month: number | null
  ai_chat_enabled: boolean
  ai_chat_fast: boolean
  sync_enabled: boolean
  auto_sync: boolean
  price_monthly_stars: number
  price_yearly_stars: number
}

export interface UsageStats {
  summaries_used: number
  voice_seconds_used: number
  chat_messages_used: number
}

export interface SubscriptionInfo {
  plan: SubscriptionPlan
  subscription_started_at: string | null
  subscription_expires_at: string | null
  trial_started_at: string | null
  trial_ends_at: string | null
  limits: SubscriptionLimits
  usage: UsageStats
}

export interface InvoiceResponse {
  invoice_link: string
  plan: SubscriptionPlan
  billing_period: BillingPeriod
  amount: number
}

// API Error class
class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

// Fetch wrapper with auth
async function fetchWithAuth<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const initData = getInitData()
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  }
  
  if (initData) {
    (headers as Record<string, string>)['X-Telegram-Init-Data'] = initData
  }
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  })
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }))
    throw new ApiError(response.status, errorData.detail || 'Request failed')
  }
  
  return response.json()
}

// API methods
export const api = {
  // Notes
  async getNotes(limit = 50, offset = 0): Promise<NotesListResponse> {
    return fetchWithAuth(`/notes?limit=${limit}&offset=${offset}`)
  },
  
  async getNote(id: string): Promise<Note> {
    return fetchWithAuth(`/notes/${id}`)
  },
  
  async createNote(data: NoteCreate): Promise<Note> {
    return fetchWithAuth('/notes', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
  
  async updateNote(id: string, data: NoteUpdate): Promise<Note> {
    return fetchWithAuth(`/notes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },
  
  async deleteNote(id: string): Promise<{ success: boolean }> {
    return fetchWithAuth(`/notes/${id}`, {
      method: 'DELETE',
    })
  },
  
  // Search (semantic - AI)
  async searchNotes(query: string, limit = 10): Promise<SearchResponse> {
    return fetchWithAuth('/notes/search', {
      method: 'POST',
      body: JSON.stringify({ query, limit }),
    })
  },
  
  // Search (full-text - fast)
  async searchNotesFTS(query: string, limit = 20): Promise<FTSSearchResponse> {
    return fetchWithAuth('/notes/search/fts', {
      method: 'POST',
      body: JSON.stringify({ query, limit }),
    })
  },
  
  // Share
  async createShareLink(noteId: string, isPublic = false): Promise<ShareResponse> {
    return fetchWithAuth(`/notes/${noteId}/share?is_public=${isPublic}`, {
      method: 'POST',
    })
  },
  
  async revokeShareLink(noteId: string): Promise<{ success: boolean }> {
    return fetchWithAuth(`/notes/${noteId}/share`, {
      method: 'DELETE',
    })
  },
  
  async getSharedNote(shareToken: string): Promise<SharedNoteResponse> {
    return fetchWithAuth(`/shared/${shareToken}`)
  },
  
  // Stats
  async getStats(): Promise<Stats> {
    return fetchWithAuth('/stats')
  },
  
  // Prompt to add note (triggers bot message)
  async promptAddNote(): Promise<{ success: boolean }> {
    return fetchWithAuth('/prompt-add-note', {
      method: 'POST',
    })
  },
  
  // Subscription
  async getSubscription(): Promise<SubscriptionInfo> {
    return fetchWithAuth('/subscription')
  },
  
  async createInvoice(plan: 'pro' | 'ultra', billingPeriod: BillingPeriod): Promise<InvoiceResponse> {
    return fetchWithAuth('/subscription/invoice', {
      method: 'POST',
      body: JSON.stringify({ plan, billing_period: billingPeriod }),
    })
  },
  
  async updateLanguage(language: string): Promise<{ success: boolean }> {
    return fetchWithAuth('/user/language', {
      method: 'PUT',
      body: JSON.stringify({ language }),
    })
  },
}


