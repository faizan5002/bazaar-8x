import { useMemo } from 'react';
import type { ProductList } from '../components/home/ProductSection';
import { api } from '../lib/api';
import type { Product, ProductQuery } from '../types';
import { useAsync, type AsyncState } from './useAsync';

const fetchItems = (query: ProductQuery) => api.products(query).then((page) => page.items);

/**
 * Hides products already shown higher on the page, so the homepage does not repeat itself.
 * A section waits for the sections above it (their requests run in parallel) so it never reshuffles after paint.
 */
function withoutShownAbove(list: AsyncState<Product[]>, above: ProductList[], take: number): ProductList {
  const loading = list.loading || above.some((a) => a.loading);
  const shown = new Set(above.flatMap((a) => a.data ?? []).map((p) => p.id));
  return {
    loading,
    error: list.error,
    reload: list.reload,
    data: list.data ? list.data.filter((p) => !shown.has(p.id)).slice(0, take) : null,
  };
}

/**
 * Data for the homepage sections. All selections are deterministic queries against the existing
 * GET /api/products filters; there is no recommendation engine.
 */
export function useHomeProducts() {
  const dealsRaw = useAsync(() => fetchItems({ deals: true, inStock: true, sort: 'popular', limit: 10 }), []);
  // Strong ratings first, then best-selling.
  const popularRaw = useAsync(() => fetchItems({ minRating: 4.5, inStock: true, sort: 'popular', limit: 30 }), []);
  // "Recommended for you" (MVP): featured products first, topped up with the best-rated rest, so the
  // section still fills a full grid after products shown above it are removed.
  const recommendedRaw = useAsync(async () => {
    const [featured, topRated] = await Promise.all([
      fetchItems({ featured: true, inStock: true, sort: 'rating', limit: 30 }),
      fetchItems({ inStock: true, sort: 'rating', limit: 40 }),
    ]);
    const seen = new Set<number>();
    return [...featured, ...topRated].filter((p) => !seen.has(p.id) && seen.add(p.id));
  }, []);

  return useMemo(() => {
    const deals: ProductList = { data: dealsRaw.data, loading: dealsRaw.loading, error: dealsRaw.error, reload: dealsRaw.reload };
    const popular = withoutShownAbove(popularRaw, [deals], 8);
    const recommended = withoutShownAbove(recommendedRaw, [deals, popular], 8);
    return { deals, popular, recommended };
  }, [dealsRaw, popularRaw, recommendedRaw]);
}
