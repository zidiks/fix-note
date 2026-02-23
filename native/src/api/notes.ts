import { apiClient } from './client';
import {
  Note,
  NoteCreate,
  NoteUpdate,
  NotesListResponse,
  SearchResponse,
  FTSSearchResponse,
  ShareResponse,
  SharedNoteResponse,
  Stats,
} from './types';

export const notesApi = {
  async getNotes(limit = 50, offset = 0): Promise<NotesListResponse> {
    const { data } = await apiClient.get<NotesListResponse>(`/notes?limit=${limit}&offset=${offset}`);
    return data;
  },

  async getNote(id: string): Promise<Note> {
    const { data } = await apiClient.get<Note>(`/notes/${id}`);
    return data;
  },

  async createNote(payload: NoteCreate): Promise<Note> {
    const { data } = await apiClient.post<Note>('/notes', payload);
    return data;
  },

  async updateNote(id: string, payload: NoteUpdate): Promise<Note> {
    const { data } = await apiClient.put<Note>(`/notes/${id}`, payload);
    return data;
  },

  async deleteNote(id: string): Promise<{ success: boolean }> {
    const { data } = await apiClient.delete<{ success: boolean }>(`/notes/${id}`);
    return data;
  },

  async searchNotes(query: string, limit = 10): Promise<SearchResponse> {
    const { data } = await apiClient.post<SearchResponse>('/notes/search', { query, limit });
    return data;
  },

  async searchNotesFTS(query: string, limit = 20): Promise<FTSSearchResponse> {
    const { data } = await apiClient.post<FTSSearchResponse>('/notes/search/fts', { query, limit });
    return data;
  },

  async createShareLink(noteId: string, isPublic = false): Promise<ShareResponse> {
    const { data } = await apiClient.post<ShareResponse>(`/notes/${noteId}/share?is_public=${isPublic}`);
    return data;
  },

  async revokeShareLink(noteId: string): Promise<{ success: boolean }> {
    const { data } = await apiClient.delete<{ success: boolean }>(`/notes/${noteId}/share`);
    return data;
  },

  async getSharedNote(shareToken: string): Promise<SharedNoteResponse> {
    const { data } = await apiClient.get<SharedNoteResponse>(`/shared/${shareToken}`);
    return data;
  },

  async getStats(): Promise<Stats> {
    const { data } = await apiClient.get<Stats>('/stats');
    return data;
  },

  async uploadVoiceNote(
    audioUri: string,
    fileName: string,
    language: string = 'ru'
  ): Promise<Note> {
    const formData = new FormData();
    formData.append('audio_file', {
      uri: audioUri,
      type: 'audio/m4a',
      name: fileName,
    } as unknown as Blob);
    formData.append('language', language);

    const { data } = await apiClient.post<Note>('/notes/voice', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000, // Voice transcription can take time
    });
    return data;
  },

  async updateLanguage(language: string): Promise<{ success: boolean }> {
    const { data } = await apiClient.put<{ success: boolean }>('/user/language', { language });
    return data;
  },
};
