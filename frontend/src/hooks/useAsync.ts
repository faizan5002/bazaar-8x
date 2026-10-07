import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  reload: () => void;
}

interface Settled<T> {
  /** The `deps` these results belong to. */
  key: string;
  data: T | null;
  error: Error | null;
  loading: boolean;
}

/**
 * Runs `fn` on mount and whenever `deps` change; `reload()` re-runs it (used by "Try again" buttons).
 *
 * Results are tied to the deps that produced them: the moment `deps` change, `loading` is true and `data` is null
 * in that very render, so the UI never shows the previous query's results under the new query.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[] = []): AsyncState<T> {
  const key = JSON.stringify(deps);
  const [state, setState] = useState<Settled<T>>({ key, data: null, error: null, loading: true });
  const [attempt, setAttempt] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ key, data: s.key === key ? s.data : null, error: null, loading: true }));
    fnRef
      .current()
      .then((data) => !cancelled && setState({ key, data, error: null, loading: false }))
      .catch((err: unknown) => !cancelled && setState({ key, data: null, error: err instanceof Error ? err : new Error(String(err)), loading: false }));
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const current = state.key === key;
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: current ? state.loading : true,
    reload,
  };
}
