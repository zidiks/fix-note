import { apiClient } from './client';
import { AuthResponse } from './types';

export const authApi = {
  async loginWithTelegram(telegramData: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    auth_date: number;
    hash: string;
  }): Promise<AuthResponse> {
    const { data } = await apiClient.post<AuthResponse>('/auth/telegram-native', telegramData);
    return data;
  },

  async loginWithApple(payload: {
    identity_token: string;
    user_data?: { email?: string | null; fullName?: { givenName?: string | null; familyName?: string | null } | null };
  }): Promise<AuthResponse> {
    const { data } = await apiClient.post<AuthResponse>('/auth/apple', payload);
    return data;
  },

  async loginWithGoogle(payload: { id_token: string }): Promise<AuthResponse> {
    const { data } = await apiClient.post<AuthResponse>('/auth/google', payload);
    return data;
  },
};
