import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, tokenStore } from '../lib/api';
import { clearDraft } from '../lib/checkout';
import type { AuthResponse, SellerSummary, User } from '../types';

interface AuthState {
  user: User | null;
  /** True until the stored token (if any) has been checked against the API. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Record that this account now runs a store (after POST /sellers), so the header and seller pages update at once. */
  setSeller: (seller: SellerSummary) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => tokenStore.get() !== null);

  useEffect(() => {
    if (!tokenStore.get()) return;
    api.auth
      .me()
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const accept = useCallback((res: AuthResponse) => {
    tokenStore.set(res.accessToken);
    setUser(res.user);
  }, []);

  // Stable identity: other contexts (the cart) list it as an effect dependency and must not refetch when it changes.
  const logout = useCallback(() => {
    tokenStore.clear();
    clearDraft(); // the next person on this browser must not see this shopper's saved address
    setUser(null);
  }, []);

  const setSeller = useCallback((seller: SellerSummary) => setUser((u) => (u ? { ...u, seller } : u)), []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login: async (email, password) => accept(await api.auth.login({ email, password })),
      register: async (name, email, password) => accept(await api.auth.register({ name, email, password })),
      logout,
      setSeller,
    }),
    [user, loading, accept, logout, setSeller],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
