import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api, Note } from '../api/client.ts'
import {
  isToday,
  isYesterday,
  isThisWeek,
  isThisMonth,
  startOfMonth,
  format
} from 'date-fns'
import { ru } from 'date-fns/locale'

interface GroupedNotes {
  label: string
  notes: Note[]
}

const groupNotesByDate = (notes: Note[]): GroupedNotes[] => {
  const groups: Map<string, Note[]> = new Map()

  const getGroupKey = (date: Date): string => {
    if (isToday(date)) return 'Сегодня'
    if (isYesterday(date)) return 'Вчера'
    if (isThisWeek(date, { weekStartsOn: 1 })) return 'На этой неделе'
    if (isThisMonth(date)) return 'В этом месяце'

    // Group by month
    return format(startOfMonth(date), 'LLLL yyyy', { locale: ru })
  }

  notes.forEach(note => {
    const date = new Date(note.created_at)
    const key = getGroupKey(date)

    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(note)
  })

  // Convert to array with correct order
  const orderedKeys = ['Сегодня', 'Вчера', 'На этой неделе', 'В этом месяце']
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
    return b.localeCompare(a, 'ru')
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

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notes'],
    queryFn: () => api.getNotes(),
  })

  const groupedNotes = useMemo(() => {
    if (!data?.notes) return []
    return groupNotesByDate(data.notes)
  }, [data])

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
  const { data, isLoading, error } = useQuery({
    queryKey: ['notes', 'search', query],
    queryFn: () => api.searchNotes(query),
    enabled: query.length >= 2,
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
