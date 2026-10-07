import type { ProductSeed } from './types';
import { BEAUTY } from './products/beauty';
import { BOOKS } from './products/books';
import { COMPUTERS } from './products/computers';
import { ELECTRONICS } from './products/electronics';
import { FASHION } from './products/fashion';
import { GROCERY } from './products/grocery';
import { HOME_KITCHEN } from './products/home-kitchen';
import { SPORTS } from './products/sports';

export { CATEGORIES, SELLERS } from './catalog';
export { DEMO_SHOPPER, E2E_EMAIL_DOMAIN, REVIEWERS, SEED_EMAIL_DOMAIN, SEED_PASSWORD } from './users';
export { DEMO_SELLER_USERS, VALIDATION_SEEDS, VOTER_COUNT, VOTER_EMAIL_PATTERN, voterEmail } from './validations';
export type { ProductSeed } from './types';

export const PRODUCTS: ProductSeed[] = [
  ...ELECTRONICS,
  ...COMPUTERS,
  ...HOME_KITCHEN,
  ...BEAUTY,
  ...SPORTS,
  ...FASHION,
  ...BOOKS,
  ...GROCERY,
];
