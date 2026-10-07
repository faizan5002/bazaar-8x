import { useAsync } from '../../hooks/useAsync';
import { api } from '../../lib/api';
import { ProductCard, ProductCardSkeleton } from '../product/ProductCard';
import { ProductRail } from '../product/ProductRail';
import { Panel } from '../ui/Panel';

/**
 * "Related products" rail. Purely additive: if the request fails or there is nothing to show, the section
 * simply isn't rendered, so it can never break or clutter the product page.
 */
export function RelatedProducts({ productId }: { productId: number }) {
  const related = useAsync(() => api.relatedProducts(productId), [productId]);
  const items = related.data?.filter((p) => p.id !== productId) ?? [];

  if (related.error || (!related.loading && items.length === 0)) return null;

  return (
    <Panel id="related" title="Related products">
      <ProductRail label="Related products">
        {related.loading ? Array.from({ length: 5 }, (_, i) => <ProductCardSkeleton key={i} />) : items.map((p) => <ProductCard key={p.id} product={p} />)}
      </ProductRail>
    </Panel>
  );
}
