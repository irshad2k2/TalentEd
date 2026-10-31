/**
 * Axios instance for every API call.
 *
 * - The access token lives in a module variable (memory), NOT localStorage: an XSS bug can read
 *   localStorage, and a page reload simply gets a fresh token from the refresh cookie.
 * - On a 401, refresh ONCE and replay the original request. If several requests fail at the same
 *   time, they all wait on the same single refresh call (no refresh storm).
 */
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { ApiError } from '@talented/shared';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // send the HttpOnly refresh cookie
  timeout: 30_000,
});

let accessToken: string | null = null;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

/** Called when refresh fails: the auth provider listens and signs the user out. */
let onSessionExpired: () => void = () => {};
export const setSessionExpiredHandler = (fn: () => void) => {
  onSessionExpired = fn;
};

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
  // Single flight: concurrent callers share one in-progress refresh
  refreshing ??= axios
    .post<{ accessToken: string }>(`${API_URL}/api/auth/refresh`, null, { withCredentials: true, timeout: 10_000 })
    .then((res) => {
      setAccessToken(res.data.accessToken);
      return res.data.accessToken;
    })
    .catch(() => {
      setAccessToken(null);
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const isAuthCall = original?.url?.includes('/api/auth/');
    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true; // retry ONCE, never loop
      const token = await refreshAccessToken();
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
      onSessionExpired();
    }
    return Promise.reject(error);
  },
);

/** Turns any API error into a human sentence for the UI. */
export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiError | undefined;
    if (body?.error?.message) return body.error.message;
    if (err.code === 'ECONNABORTED') return 'The request timed out. Please try again.';
    if (!err.response) return 'Cannot reach the server. Check your connection.';
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}

/** Field-level errors from the shared Zod schema (400 responses). */
export function fieldErrors(err: unknown): Record<string, string[]> {
  if (axios.isAxiosError(err)) {
    const details = (err.response?.data as ApiError | undefined)?.error?.details;
    if (details && typeof details === 'object') return details as Record<string, string[]>;
  }
  return {};
}
