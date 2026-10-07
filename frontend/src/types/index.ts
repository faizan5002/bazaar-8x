// API response shapes. Mirrors the backend entities; keep in sync when entities change.

export interface Category {
  id: number;
  name: string;
  slug: string;
  imageUrl: string | null;
  sortOrder: number;
}

export interface Seller {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  rating: number;
  createdAt: string;
}

export interface ProductVariantGroup {
  name: string;
  options: string[];
}

export interface Product {
  id: number;
  title: string;
  slug: string;
  brand: string;
  description: string;
  images: string[];
  features: string[];
  specifications: Record<string, string>;
  variants: ProductVariantGroup[];
  price: number;
  originalPrice: number | null;
  stock: number;
  ratingAverage: number;
  reviewCount: number;
  deliveryDays: number;
  freeShipping: boolean;
  isDeal: boolean;
  isFeatured: boolean;
  soldCount: number;
  createdAt: string;
  // Always included by list, detail and related endpoints.
  category: Category;
  seller: Seller;
}

/** A written customer review (GET /api/products/:id/reviews). Never includes the author's account. */
export interface Review {
  id: number;
  authorName: string;
  rating: number;
  title: string;
  body: string;
  verifiedPurchase: boolean;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Sort orders supported by GET /api/products. */
export type ProductSort = 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'newest' | 'popular';

export interface ProductQuery {
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock?: boolean;
  deals?: boolean;
  featured?: boolean;
  sort?: ProductSort;
  page?: number;
  limit?: number;
}

// ---- cart & orders (mirror GET /api/cart and the /api/orders responses) -------------------------------------------

export interface CartLine {
  id: number;
  productId: number;
  title: string;
  image: string | null;
  sellerName: string;
  unitPrice: number;
  originalPrice: number | null;
  quantity: number;
  lineTotal: number;
  selectedVariants: Record<string, string>;
  stock: number;
  /** Most the shopper may hold of this product right now. */
  maxQuantity: number;
  freeShipping: boolean;
  /** Set when stock changed after the item was added and the line can't be ordered as it stands. */
  issue: { code: 'unavailable' | 'insufficient'; message: string } | null;
}

export type DeliveryOptionId = 'standard' | 'express';

export interface DeliveryQuote {
  id: DeliveryOptionId;
  label: string;
  description: string;
  cost: number;
  days: number;
  /** ISO date, YYYY-MM-DD. */
  estimatedDelivery: string;
  /** Grand total if this option is chosen. */
  total: number;
}

export interface CartView {
  items: CartLine[];
  itemCount: number;
  subtotal: number;
  /** Estimates (standard delivery, flat mock tax). Every figure is computed by the server. */
  shipping: number;
  tax: number;
  total: number;
  deliveryOptions: DeliveryQuote[];
  canCheckout: boolean;
}

export interface ShippingAddress {
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
}

export type PaymentMethodId = 'card' | 'cod';

export interface CreateOrderInput {
  shippingAddress: ShippingAddress;
  deliveryOption: DeliveryOptionId;
  paymentMethod: PaymentMethodId;
}

export interface OrderView {
  orderNumber: string;
  status: string;
  createdAt: string;
  items: {
    id: number;
    productId: number | null;
    title: string;
    imageUrl: string | null;
    sellerName: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    selectedVariants: Record<string, string>;
  }[];
  itemCount: number;
  shippingAddress: ShippingAddress;
  deliveryOption: DeliveryOptionId;
  deliveryOptionLabel: string;
  paymentMethod: string;
  subtotal: number;
  shippingCost: number;
  tax: number;
  total: number;
  /** ISO date, YYYY-MM-DD. */
  estimatedDelivery: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
  /** Set when this account runs a seller store; null for ordinary shoppers. Comes from the API, never guessed. */
  seller: SellerSummary | null;
}

// ---- demand validation ("Coming soon") -------------------------------------------------------------------------

export interface SellerSummary {
  id: number;
  name: string;
  slug: string;
}

export interface ValidationCard {
  id: number;
  title: string;
  tagline: string;
  image: string | null;
  priceMin: number;
  priceMax: number;
  /** "YYYY-MM". */
  expectedLaunch: string;
  status: 'open' | 'closed';
  responseCount: number;
  seller: SellerSummary;
  category: { id: number; name: string; slug: string };
  createdAt: string;
}

export interface PriceBucket {
  /** 0–4, the value sent back as `priceBucket`. */
  index: number;
  label: string;
  min: number | null;
  max: number | null;
}

export interface ValidationDetail extends ValidationCard {
  description: string;
  images: string[];
  features: string[];
  priceBuckets: PriceBucket[];
  updatedAt: string;
}

export type Interest = 'interested' | 'maybe' | 'not_interested';

/** The signed-in shopper's own answer (never anyone else's). */
export interface MyResponse {
  interest: Interest;
  priceBucket: number | null;
  topFeature: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RespondInput {
  interest: Interest;
  priceBucket?: number;
  topFeature?: string;
}

export interface RespondResult {
  response: MyResponse;
  responseCount: number;
  created: boolean;
}

export interface ValidationQuery {
  category?: string;
  sort?: 'newest' | 'popular';
  page?: number;
  limit?: number;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

// ---- seller hub -------------------------------------------------------------------------------------------------

export interface CreateSellerInput {
  name: string;
  description?: string;
}

export type SignalLevel = 'strong' | 'moderate' | 'weak' | 'early';

/** The demand signal exactly as the API computes it. The frontend only displays these numbers. */
export interface DemandSignal {
  total: number;
  interestedPercent: number;
  maybePercent: number;
  notInterestedPercent: number;
  /** Interested + Maybe, from the exact counts. */
  openPercent: number;
  /** 0–100: Interested counts fully, Maybe counts half. */
  score: number;
  level: SignalLevel;
  label: string;
  /** False until `minResponses` answers are in. */
  reliable: boolean;
  minResponses: number;
}

/** One row of GET /seller/validations. */
export interface SellerValidationItem {
  id: number;
  title: string;
  image: string | null;
  status: 'open' | 'closed';
  responseCount: number;
  interestedPercent: number;
  maybePercent: number;
  notInterestedPercent: number;
  signal: Pick<DemandSignal, 'score' | 'level' | 'label' | 'reliable'>;
  createdAt: string;
}

export interface CreateValidationInput {
  title: string;
  tagline: string;
  description: string;
  categoryId: number;
  images: string[];
  features: string[];
  priceMin: number;
  priceMax: number;
  /** "YYYY-MM". */
  expectedLaunch: string;
}

export interface CountShare {
  count: number;
  percent: number;
}

export interface PriceBucketResult extends PriceBucket {
  count: number;
  /** Share of the shoppers who answered the price question. */
  percent: number;
  percentOfResponses: number;
}

export interface FeatureResult {
  name: string;
  count: number;
  /** Share of the shoppers who answered the feature question. */
  percent: number;
  percentOfResponses: number;
}

export interface PriceSignal {
  bucket: PriceBucket;
  count: number;
  percent: number;
  /** The API's own call on whether this is worth flagging (a minimum share AND a minimum number of answers). */
  flagged: boolean;
}

/** GET /seller/validations/:id/results */
export interface ValidationResults {
  validation: {
    id: number;
    title: string;
    tagline: string;
    status: 'open' | 'closed';
    priceMin: number;
    priceMax: number;
    expectedLaunch: string;
    createdAt: string;
    image: string | null;
    category: { id: number; name: string; slug: string };
  };
  totalResponses: number;
  interest: { interested: CountShare; maybe: CountShare; notInterested: CountShare };
  signal: DemandSignal;
  priceBuckets: PriceBucketResult[];
  priceAnswered: number;
  features: FeatureResult[];
  featureAnswered: number;
  insights: {
    preferredPrice: (PriceBucketResult & { share: number }) | null;
    pricePressure: PriceSignal;
    priceHeadroom: PriceSignal;
    topFeature: FeatureResult | null;
  };
}
