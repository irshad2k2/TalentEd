/**
 * Auth state for the whole app.
 *
 * On page load we don't know if the user is signed in (the token was in memory and is gone).
 * We ask /refresh: the HttpOnly cookie tells the server who we are. While that runs, `loading`
 * is true. The `finally` guarantees loading ends even if the request fails or times out,
 * so the app can never hang on a spinner.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { LoginInput, Role, SignupInput } from '@talented/shared';
import { api, refreshAccessToken, setAccessToken, setSessionExpiredHandler } from './api';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<User>;
  signup: (input: SignupInput) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const clear = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    queryClient.clear(); // drop cached data that belonged to the previous user
  }, [queryClient]);

  useEffect(() => {
    setSessionExpiredHandler(clear);
    let cancelled = false;
    (async () => {
      try {
        const token = await refreshAccessToken();
        if (token && !cancelled) {
          const me = await api.get<{ user: User }>('/api/auth/me');
          setUser(me.data.user);
        }
      } catch {
        // not signed in - that's fine
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clear]);

  const startSession = useCallback(
    (data: { accessToken: string; user: User }) => {
      queryClient.clear();
      setAccessToken(data.accessToken);
      setUser(data.user);
      return data.user;
    },
    [queryClient],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (input) => startSession((await api.post('/api/auth/login', input)).data),
      signup: async (input) => startSession((await api.post('/api/auth/signup', input)).data),
      logout: async () => {
        try {
          await api.post('/api/auth/logout');
        } finally {
          clear();
        }
      },
    }),
    [user, loading, startSession, clear],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
