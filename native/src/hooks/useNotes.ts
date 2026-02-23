import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notesApi } from '../api/notes';
import { NoteCreate, NoteUpdate } from '../api/types';

export function useNotes(limit = 100) {
  return useQuery({
    queryKey: ['notes'],
    queryFn: () => notesApi.getNotes(limit, 0),
    staleTime: 5 * 60 * 1000,
  });
}

export function useNote(id: string) {
  return useQuery({
    queryKey: ['notes', id],
    queryFn: () => notesApi.getNote(id),
    enabled: !!id,
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: NoteCreate) => notesApi.createNote(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
}

export function useUpdateNote(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: NoteUpdate) => notesApi.updateNote(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes'] });
      qc.invalidateQueries({ queryKey: ['notes', id] });
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notesApi.deleteNote(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
}

export function useSearchNotesFTS(query: string) {
  return useQuery({
    queryKey: ['notes', 'search', 'fts', query],
    queryFn: () => notesApi.searchNotesFTS(query),
    enabled: query.trim().length > 0,
    staleTime: 30 * 1000,
  });
}

export function useSharedNote(shareToken: string) {
  return useQuery({
    queryKey: ['shared', shareToken],
    queryFn: () => notesApi.getSharedNote(shareToken),
    enabled: !!shareToken,
  });
}

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => notesApi.getStats(),
    staleTime: 10 * 60 * 1000,
  });
}
