import { apiClient } from './client';
import {
  IntegrationsListResponse,
  NotionOAuthStartResponse,
  NotionOAuthCallbackResponse,
  SyncNoteResponse,
  SyncAllResponse,
  NoteSyncStatusResponse,
  SyncHistoryResponse,
  IntegrationProvider,
  SyncMode,
} from './types';

export const syncApi = {
  async getIntegrations(): Promise<IntegrationsListResponse> {
    const { data } = await apiClient.get<IntegrationsListResponse>('/sync/integrations');
    return data;
  },

  async startNotionOAuth(): Promise<NotionOAuthStartResponse> {
    const { data } = await apiClient.get<NotionOAuthStartResponse>('/sync/notion/auth');
    return data;
  },

  async checkPendingNotionOAuth(): Promise<{ pending: boolean; code?: string; expired?: boolean }> {
    const { data } = await apiClient.get('/sync/notion/pending');
    return data;
  },

  async clearPendingNotionOAuth(): Promise<{ success: boolean }> {
    const { data } = await apiClient.delete<{ success: boolean }>('/sync/notion/pending');
    return data;
  },

  async completeNotionOAuth(code: string, state: string): Promise<NotionOAuthCallbackResponse> {
    const { data } = await apiClient.post<NotionOAuthCallbackResponse>('/sync/notion/callback', { code, state });
    return data;
  },

  async setNotionDatabase(databaseId: string): Promise<{ success: boolean }> {
    const { data } = await apiClient.post<{ success: boolean }>('/sync/notion/database', { database_id: databaseId });
    return data;
  },

  async updateSyncSettings(
    provider: IntegrationProvider,
    settings: { sync_mode?: SyncMode; auto_sync_enabled?: boolean }
  ): Promise<{ success: boolean }> {
    const { data } = await apiClient.put<{ success: boolean }>(`/sync/${provider}/settings`, settings);
    return data;
  },

  async disconnectIntegration(provider: IntegrationProvider): Promise<{ success: boolean }> {
    const { data } = await apiClient.delete<{ success: boolean }>(`/sync/${provider}`);
    return data;
  },

  async syncNote(noteId: string, force = false): Promise<SyncNoteResponse> {
    const { data } = await apiClient.post<SyncNoteResponse>(`/sync/notes/${noteId}`, { force });
    return data;
  },

  async pullNoteFromExternal(noteId: string): Promise<SyncNoteResponse> {
    const { data } = await apiClient.post<SyncNoteResponse>(`/sync/notes/${noteId}/pull`);
    return data;
  },

  async syncAllNotes(): Promise<SyncAllResponse> {
    const { data } = await apiClient.post<SyncAllResponse>('/sync/all');
    return data;
  },

  async resolveConflict(
    noteId: string,
    resolution: 'keep_local' | 'keep_external' | 'keep_both'
  ): Promise<{ status: string }> {
    const { data } = await apiClient.post<{ status: string }>(`/sync/notes/${noteId}/resolve`, { resolution });
    return data;
  },

  async getNoteSyncStatus(noteId: string): Promise<NoteSyncStatusResponse> {
    const { data } = await apiClient.get<NoteSyncStatusResponse>(`/sync/notes/${noteId}/status`);
    return data;
  },

  async getSyncHistory(limit = 50): Promise<SyncHistoryResponse> {
    const { data } = await apiClient.get<SyncHistoryResponse>(`/sync/history?limit=${limit}`);
    return data;
  },
};
