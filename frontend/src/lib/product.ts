import type { Product } from '../types';

/** At or below this many units we say "Only N left". */
export const LOW_STOCK_AT = 10;
/** Most units one order line may hold (the quantity picker also never exceeds stock). */
export const MAX_QUANTITY = 10;

export type StockLevel = 'out' | 'low' | 'in';

export function stockStatus(stock: number): { level: StockLevel; label: string } {
  if (stock <= 0) return { level: 'out', label: 'Currently unavailable' };
  if (stock <= LOW_STOCK_AT) return { level: 'low', label: `Only ${stock} left in stock` };
  return { level: 'in', label: 'In stock' };
}

/** Book covers are portrait artwork that must not be cropped; everything else is a photo that fills its frame. */
export const isBookCover = (product: Pick<Product, 'category'>) => product.category.slug === 'books';
