import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api, Note } from '../api/client.ts'
import {
  isToday,
  isYesterday,
  isThisWeek,
  startOfMonth,
  format
} from 'date-fns'
import { ru, enUS } from 'date-fns/locale'
import { useI18n, Language } from '../i18n'

interface GroupedNotes {
  label: string
  notes: Note[]
}

// Date label keys for translation
type DateLabelKey = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth'

const groupNotesByDate = (notes: Note[], language: Language): GroupedNotes[] => {
  const groups: Map<string, Note[]> = new Map()
  const locale = language === 'ru' ? ru : enUS

  const labels: Record<DateLabelKey, string> = {
    today: language === 'ru' ? 'Сегодня' : 'Today',
    yesterday: language === 'ru' ? 'Вчера' : 'Yesterday',
    thisWeek: language === 'ru' ? 'На этой неделе' : 'This Week',
    thisMonth: language === 'ru' ? 'В этом месяце' : 'This Month',
  }

  const getGroupKey = (date: Date): string => {
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    
    if (isToday(date)) return labels.today
    if (isYesterday(date)) return labels.yesterday
    if (diffDays <= 7 && isThisWeek(date, { weekStartsOn: 1 })) return labels.thisWeek
    if (diffDays <= 30) return labels.thisMonth

    // Group by month for older notes
    return format(startOfMonth(date), 'LLLL yyyy', { locale })
  }

  notes.forEach(note => {
    const date = new Date(note.created_at)
    const key = getGroupKey(date)

    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(note)
  })

  // Convert to array with correct order - Apple Notes style
  const orderedKeys = [labels.today, labels.yesterday, labels.thisWeek, labels.thisMonth]
  const result: GroupedNotes[] = []

  // Add standard groups first
  orderedKeys.forEach(key => {
    const notesForKey = groups.get(key)
    if (notesForKey && notesForKey.length > 0) {
      result.push({ label: key, notes: notesForKey })
      groups.delete(key)
    }
  })

  // Add remaining month groups (sorted by date descending)
  const remainingKeys = Array.from(groups.keys()).sort((a, b) => {
    // Parse month names and sort descending
    return b.localeCompare(a, language)
  })

  remainingKeys.forEach(key => {
    const notesForKey = groups.get(key)
    if (notesForKey && notesForKey.length > 0) {
      result.push({ label: key, notes: notesForKey })
    }
  })

  return result
}

export const useNotes = () => {
  const queryClient = useQueryClient()
  const { language } = useI18n()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notes'],
    queryFn: () => api.getNotes(),
  })

  const groupedNotes = useMemo(() => {
    if (!data?.notes) return []
    return groupNotesByDate(data.notes, language)
  }, [data, language])

  const deleteNoteMutation = useMutation({
    mutationFn: api.deleteNote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })

  return {
    notes: data?.notes || [],
    groupedNotes,
    total: data?.total || 0,
    isLoading,
    error,
    refetch,
    deleteNote: deleteNoteMutation.mutate,
    isDeleting: deleteNoteMutation.isPending,
  }
}

export const useSearchNotes = (query: string) => {
  // Use FTS for fast local search
  const { data, isLoading, error } = useQuery({
    queryKey: ['notes', 'search', 'fts', query],
    queryFn: () => api.searchNotesFTS(query),
    enabled: query.length >= 2,
  })

  return {
    results: data?.results || [],
    isLoading,
    error,
  }
}

// Semantic search (slower, AI-powered)
export const useSemanticSearch = (query: string) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['notes', 'search', 'semantic', query],
    queryFn: () => api.searchNotes(query),
    enabled: query.length >= 3,
  })

  return {
    results: data?.results || [],
    isLoading,
    error,
  }
}

export const useStats = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.getStats(),
  })

  return {
    stats: data,
    isLoading,
  }
}
