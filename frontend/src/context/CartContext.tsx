import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, api } from '../lib/api';
import type { CartView } from '../types';
import { useAuth } from './AuthContext';

interface AddInput {
  productId: number;
  quantity: number;
  selectedVariants?: Record<string, string>;
}

interface CartState {
  /** The signed-in user's cart exactly as the server last returned it; null when signed out or not loaded yet. */
  cart: CartView | null;
  /** Units in the cart: what the header badge shows. 0 when signed out. */
  count: number;
  /** The first load for a signed-in user is in flight. */
  loading: boolean;
  /** The first load failed. */
  error: Error | null;
  reload: () => void;
  add: (input: AddInput) => Promise<CartView>;
  setQuantity: (itemId: number, quantity: number) => Promise<CartView>;
  remove: (itemId: number) => Promise<CartView>;
}

const CartContext = createContext<CartState | null>(null);

/**
 * Holds a copy of the SERVER cart (there is no client-only cart): it loads once per sign-in and every mutation
 * replaces it with the cart the API returns. Mutations are queued one at a time so a fast double-click can't make
 * responses land out of order. The header badge, product page and cart page all read from here, so the app makes
 * no extra requests just to keep the count fresh.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [cart, setCart] = useState<CartView | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const userId = user?.id;
  useEffect(() => {
    if (userId === undefined) {
      setCart(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);
    api.cart
      .get()
      .then((c) => !cancelled && setCart(c))
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) logout(); // token expired: treat as signed out
        else setError(err instanceof Error ? err : new Error(String(err)));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, attempt, logout]);

  /** Runs a mutation after any earlier one has finished; on success the returned cart becomes the state. */
  const mutate = useCallback((request: () => Promise<CartView>) => {
    const run = queue.current.then(request).then((next) => {
      setCart(next);
      return next;
    });
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const value = useMemo<CartState>(
    () => ({
      cart,
      count: cart?.itemCount ?? 0,
      // Only the first load counts as "loading": a background refresh keeps showing the cart we already have.
      loading: userId !== undefined && cart === null && error === null,
      error,
      reload: () => setAttempt((n) => n + 1),
      add: (input) => mutate(() => api.cart.add(input)),
      setQuantity: (itemId, quantity) => mutate(() => api.cart.update(itemId, quantity)),
      remove: (itemId) => mutate(() => api.cart.remove(itemId)),
    }),
    [cart, error, userId, mutate],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
