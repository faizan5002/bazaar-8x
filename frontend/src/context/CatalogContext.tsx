import { createContext, useContext, type ReactNode } from 'react';
import { useAsync, type AsyncState } from '../hooks/useAsync';
import { api } from '../lib/api';
import type { Category } from '../types';

const CatalogContext = createContext<AsyncState<Category[]> | null>(null);

/** Loads GET /api/categories once; the header, category nav and homepage all read from it. */
export function CatalogProvider({ children }: { children: ReactNode }) {
  const categories = useAsync(() => api.categories(), []);
  return <CatalogContext.Provider value={categories}>{children}</CatalogContext.Provider>;
}

export function useCategories() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCategories must be used inside <CatalogProvider>');
  return ctx;
}
