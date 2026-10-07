import type { Product } from '../../types';
import { ProductCard, ProductCardSkeleton } from '../product/ProductCard';
import { ProductRail } from '../product/ProductRail';
import { Panel } from '../ui/Panel';
import { EmptyState, ErrorState } from '../ui/StateMessage';

export interface ProductList {
  data: Product[] | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

interface ProductSectionProps {
  id: string;
  title: string;
  action?: { to: string; label: string };
  list: ProductList;
  layout: 'rail' | 'grid';
  emptyMessage: string;
  skeletons?: number;
}

const GRID = 'grid grid-cols-2 gap-1 md:grid-cols-4';

/** A homepage product section that owns all three async states (loading, error, empty) plus the success layout. */
export function ProductSection({ id, title, action, list, layout, emptyMessage, skeletons = 8 }: ProductSectionProps) {
  let body;
  if (list.loading) {
    const placeholders = Array.from({ length: skeletons }, (_, i) => <ProductCardSkeleton key={i} />);
    body = layout === 'rail' ? <ProductRail label={`${title} (loading)`}>{placeholders}</ProductRail> : <div className={GRID}>{placeholders}</div>;
  } else if (list.error) {
    body = <ErrorState message={list.error.message} onRetry={list.reload} />;
  } else if (!list.data?.length) {
    body = <EmptyState>{emptyMessage}</EmptyState>;
  } else {
    const cards = list.data.map((p) => <ProductCard key={p.id} product={p} />);
    body = layout === 'rail' ? <ProductRail label={title}>{cards}</ProductRail> : <div className={GRID}>{cards}</div>;
  }

  return (
    <Panel id={id} title={title} action={list.error || !list.data?.length ? undefined : action}>
      {body}
    </Panel>
  );
}
