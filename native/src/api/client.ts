import axios, { AxiosError } from 'axios';

// Replace with your actual API URL - use environment variable or config
const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://fixnote.space/api';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// Callback to clear auth and redirect to Welcome when 401 is received
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

// JWT getter - will be set by auth store
let getJwt: (() => string | null) | null = null;
export function setJwtGetter(getter: () => string | null) {
  getJwt = getter;
}

export const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach Bearer JWT
apiClient.interceptors.request.use((config) => {
  const jwt = getJwt?.();
  if (jwt) {
    config.headers.Authorization = `Bearer ${jwt}`;
  }
  return config;
});

// Response interceptor: handle 401
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      onUnauthorized?.();
    }
    const message =
      (error.response?.data as { detail?: string })?.detail ||
      error.message ||
      'Request failed';
    return Promise.reject(new ApiError(error.response?.status ?? 0, message));
  }
);
