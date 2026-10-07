import type { ProductVariantGroup } from '../../../products/product.entity';

export interface SellerSeed {
  slug: string;
  name: string;
  description: string;
  rating: number;
}

export interface CategorySeed {
  slug: string;
  name: string;
  imageUrl: string;
  sortOrder: number;
}

/** Index into REVIEWERS (see users.ts). */
export type ReviewerIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface ReviewSeed {
  reviewer: ReviewerIndex;
  rating: 1 | 2 | 3 | 4 | 5;
  title: string;
  body: string;
  verified: boolean;
  daysAgo: number;
}

export interface ProductSeed {
  slug: string;
  title: string;
  brand: string;
  category: CategorySeed['slug'];
  seller: SellerSeed['slug'];
  description: string;
  images: string[];
  features: string[];
  specifications: Record<string, string>;
  variants?: ProductVariantGroup[];
  price: number;
  originalPrice?: number;
  stock: number;
  /** Marketplace-wide aggregate shown on cards; the sample reviews below are a subset. */
  rating: number;
  reviewCount: number;
  deliveryDays: number;
  freeShipping: boolean;
  isDeal?: boolean;
  isFeatured?: boolean;
  soldCount: number;
  reviews: ReviewSeed[];
}
