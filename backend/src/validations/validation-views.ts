import { PriceBucket, priceBuckets } from '../common/price-buckets';
import { SellerSummary } from '../sellers/sellers.service';
import { ValidationStatus, Validation } from './validation.entity';

/** Card-sized view: what the marketplace lists. */
export interface ValidationCard {
  id: number;
  title: string;
  tagline: string;
  /** First image, or null. */
  image: string | null;
  priceMin: number;
  priceMax: number;
  expectedLaunch: string;
  status: ValidationStatus;
  responseCount: number;
  seller: SellerSummary;
  category: { id: number; name: string; slug: string };
  createdAt: Date;
}

export interface ValidationDetail extends ValidationCard {
  description: string;
  images: string[];
  features: string[];
  /** The five preferred-price options, from common/price-buckets.ts. */
  priceBuckets: PriceBucket[];
  updatedAt: Date;
}

/** `validation` must be loaded with its seller and category. Never includes the seller's owner or any voter. */
export function toCard(v: Validation, responseCount: number): ValidationCard {
  return {
    id: v.id,
    title: v.title,
    tagline: v.tagline,
    image: v.images[0] ?? null,
    priceMin: v.priceMin,
    priceMax: v.priceMax,
    expectedLaunch: v.expectedLaunch,
    status: v.status,
    responseCount,
    seller: { id: v.seller.id, name: v.seller.name, slug: v.seller.slug },
    category: { id: v.category.id, name: v.category.name, slug: v.category.slug },
    createdAt: v.createdAt,
  };
}

export function toDetail(v: Validation, responseCount: number): ValidationDetail {
  return {
    ...toCard(v, responseCount),
    description: v.description,
    images: v.images,
    features: v.features,
    priceBuckets: priceBuckets(v.priceMin, v.priceMax),
    updatedAt: v.updatedAt,
  };
}
