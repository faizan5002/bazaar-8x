/** All seed accounts use this domain, which is how the seeder recognises (and safely re-creates) their reviews. */
export const SEED_EMAIL_DOMAIN = 'seed.bazaar.test';

/** Dev-only password shared by every seed account. */
export const SEED_PASSWORD = 'DemoPass123!';

export interface SeedUser {
  name: string;
  email: string;
}

/** Index in this array is what `ReviewSeed.reviewer` refers to. */
export const REVIEWERS: SeedUser[] = [
  'Maya Patel',
  'Daniel Brooks',
  'Priya Raman',
  'Lucas Meyer',
  'Hannah Kim',
  'Omar Haddad',
  'Sofia Alvarez',
  'Ethan Clarke',
  'Aisha Rahman',
  'Tom Whitaker',
].map((name) => ({ name, email: `${name.toLowerCase().replace(' ', '.')}@${SEED_EMAIL_DOMAIN}` }));

/** A ready-made shopper for trying cart and checkout: demo@seed.bazaar.test / SEED_PASSWORD. */
export const DEMO_SHOPPER: SeedUser = { name: 'Demo Shopper', email: `demo@${SEED_EMAIL_DOMAIN}` };

/** Accounts created by the Playwright suite. `npm run seed` deletes them (and their carts and orders). */
export const E2E_EMAIL_DOMAIN = 'e2e.bazaar.test';
