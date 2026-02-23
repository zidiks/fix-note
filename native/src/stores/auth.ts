import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { AuthUser } from '../api/types';
import { setJwtGetter } from '../api/client';

const JWT_KEY = 'fixnote_jwt';

interface AuthState {
  jwt: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  loadFromStorage: () => Promise<void>;
  saveAuth: (jwt: string, user: AuthUser) => Promise<void>;
  clearAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  jwt: null,
  user: null,
  isLoading: true,
  isAuthenticated: false,

  loadFromStorage: async () => {
    try {
      const jwt = await SecureStore.getItemAsync(JWT_KEY);
      if (jwt) {
        // Decode JWT payload to check expiry and get user info
        const [, payloadB64] = jwt.split('.');
        const payload = JSON.parse(atob(payloadB64));
        const isExpired = payload.exp && Date.now() / 1000 > payload.exp;
        if (!isExpired) {
          set({ jwt, isAuthenticated: true });
          // User info will be fetched from profile or stored separately
          // For now mark as authenticated; profile is loaded lazily
        } else {
          await SecureStore.deleteItemAsync(JWT_KEY);
        }
      }
    } catch {
      // Ignore storage errors
    } finally {
      set({ isLoading: false });
    }
  },

  saveAuth: async (jwt: string, user: AuthUser) => {
    await SecureStore.setItemAsync(JWT_KEY, jwt);
    set({ jwt, user, isAuthenticated: true });
  },

  clearAuth: async () => {
    await SecureStore.deleteItemAsync(JWT_KEY);
    set({ jwt: null, user: null, isAuthenticated: false });
  },
}));

// Wire JWT getter to axios client
setJwtGetter(() => useAuthStore.getState().jwt);
