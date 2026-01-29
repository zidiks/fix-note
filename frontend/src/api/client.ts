// Get Telegram init data for authentication
const getInitData = (): string => {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
    return window.Telegram.WebApp.initData
  }
  return ''
}

// API base configuration
const API_BASE = '/api'

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
  
  // Search
  async searchNotes(query: string, limit = 10): Promise<SearchResponse> {
    return fetchWithAuth('/notes/search', {
      method: 'POST',
      body: JSON.stringify({ query, limit }),
    })
  },
  
  // Stats
  async getStats(): Promise<Stats> {
    return fetchWithAuth('/stats')
  },
}


