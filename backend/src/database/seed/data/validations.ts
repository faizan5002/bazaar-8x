import { photo } from './images';
import { SEED_EMAIL_DOMAIN } from './users';

/*
 * DEMO DATA. Everything here is synthetic: the sellers, the products, and above all the "shoppers" who responded.
 * The responses are generated deterministically (see seed.service.ts) from the counts and weights below by
 * synthetic voter accounts `voter-0001@seed.bazaar.test` … so the demo has real-looking analytics out of the box.
 * Nothing here is real customer behaviour.
 */

/** Synthetic shoppers who "responded". Voter N always has the same email, so re-seeding updates rather than duplicates. */
export const voterEmail = (n: number) => `voter-${String(n).padStart(4, '0')}@${SEED_EMAIL_DOMAIN}`;
export const VOTER_EMAIL_PATTERN = `voter-%@${SEED_EMAIL_DOMAIN}`;

export interface DemoSellerUser {
  email: string;
  name: string;
  store: { slug: string; name: string; description: string };
}

/** Log in with these (password: SEED_PASSWORD) to see the seller side. Each owns one store. */
export const DEMO_SELLER_USERS: DemoSellerUser[] = [
  {
    email: `seller@${SEED_EMAIL_DOMAIN}`,
    name: 'Demo Seller',
    store: { slug: 'trailmate-travel-gear', name: 'Trailmate Travel Gear', description: 'Small-batch travel and outdoor gear, designed by people who live out of a carry-on.' },
  },
  {
    email: `maker@${SEED_EMAIL_DOMAIN}`,
    name: 'Demo Maker',
    store: { slug: 'kindred-home-studio', name: 'Kindred Home Studio', description: 'Thoughtful everyday objects for the kitchen, desk and windowsill.' },
  },
];

export interface ValidationSeed {
  ownerEmail: string;
  title: string;
  tagline: string;
  description: string;
  categorySlug: string;
  images: string[];
  features: string[];
  priceMin: number;
  priceMax: number;
  expectedLaunch: string;
  status: 'open' | 'closed';
  responses: {
    interested: number;
    maybe: number;
    notInterested: number;
    /** Relative weights of the five price buckets among those who answer the price question. */
    priceWeights: [number, number, number, number, number];
    /** Relative weights of `features`, same order. */
    featureWeights: number[];
    /** Share (0–1) of interested/maybe voters who also answer each optional question. */
    answerPriceRate: number;
    answerFeatureRate: number;
  };
}

export const VALIDATION_SEEDS: ValidationSeed[] = [
  {
    // The flagship: 1,284 responses, 67% / 21% / 12% → "Strong demand signal", $86–92 sweet spot, USB-C on top.
    ownerEmail: `seller@${SEED_EMAIL_DOMAIN}`,
    title: 'Smart Travel Backpack',
    tagline: 'A smarter carry-on built for modern travelers',
    description:
      'A 35-litre carry-on backpack designed around the airport: a water-resistant shell, a built-in USB-C charging port wired to a pocket for your own power bank, a padded compartment that fits a 16-inch laptop, and a hidden anti-theft pocket against your back. It zips flat for under-seat storage and expands for a long weekend away. We are testing demand before committing to a first production run.',
    categorySlug: 'fashion',
    images: [photo('1622560480605-d83c853bc5c3'), photo('1581605405669-fcdf81165afa'), photo('1565026057447-bc90a3dceb87')],
    features: ['USB-C charging', 'Waterproof', 'Anti-theft design', 'Laptop protection', 'Expandable storage'],
    priceMin: 79,
    priceMax: 99,
    expectedLaunch: '2026-12',
    status: 'open',
    responses: { interested: 860, maybe: 270, notInterested: 154, priceWeights: [14, 21, 38, 22, 5], featureWeights: [36, 27, 18, 12, 7], answerPriceRate: 0.84, answerFeatureRate: 0.72 },
  },
  {
    ownerEmail: `seller@${SEED_EMAIL_DOMAIN}`,
    title: 'Pocket-Fold Travel Yoga Mat',
    tagline: 'A real yoga mat that folds down to the size of a paperback',
    description:
      'A 3 mm travel yoga mat made from a dense, grippy rubber that folds into a pouch the size of a paperback instead of rolling. Printed alignment guides help with your stance, and the surface is treated to resist odour. Meant for hotel rooms, parks and the bottom of a carry-on.',
    categorySlug: 'sports-fitness',
    images: [photo('1575052814086-f385e2e2ad1b'), photo('1601925260368-ae2f83cf8b7f')],
    features: ['Folds to pocket size', 'Non-slip alignment guides', 'Antimicrobial surface', 'Includes carry strap'],
    priceMin: 39,
    priceMax: 55,
    expectedLaunch: '2027-01',
    status: 'open',
    responses: { interested: 37, maybe: 33, notInterested: 26, priceWeights: [18, 30, 32, 16, 4], featureWeights: [38, 30, 20, 12], answerPriceRate: 0.8, answerFeatureRate: 0.7 },
  },
  {
    // Strong interest but real price pressure (31% expect to pay under the proposed minimum).
    ownerEmail: `maker@${SEED_EMAIL_DOMAIN}`,
    title: 'Self-Stirring Insulated Mug',
    tagline: 'Stir, sip and stay hot for 24 hours, no spoon needed',
    description:
      'A 12 oz double-wall insulated mug with a quiet magnetic stirrer in the base that mixes powders, creamers and protein shakes at the press of a button. The lid is spill-proof, the body keeps drinks hot for 24 hours, and it recharges over USB-C. We want to know what you would pay before we finalise the motor.',
    categorySlug: 'home-kitchen',
    images: [photo('1514228742587-6b1558fcca3d'), photo('1517256064527-09c73fc73e38')],
    features: ['Self-stirring motor', '24-hour insulation', 'Spill-proof lid', 'USB-C rechargeable', 'Dishwasher safe'],
    priceMin: 24,
    priceMax: 34,
    expectedLaunch: '2026-11',
    status: 'open',
    responses: { interested: 125, maybe: 52, notInterested: 35, priceWeights: [31, 29, 24, 12, 4], featureWeights: [34, 28, 20, 12, 6], answerPriceRate: 0.86, answerFeatureRate: 0.75 },
  },
  {
    // Only 18 responses: the signal is "Too early to tell".
    ownerEmail: `maker@${SEED_EMAIL_DOMAIN}`,
    title: 'Modular Desk Organizer System',
    tagline: 'Magnetic trays that rearrange as your desk does',
    description:
      'A set of magnetic desk trays, a cable channel and a monitor riser that snap together in any layout, with an optional Qi wireless charger built into one tray. Rearrange it in seconds when your work changes. Early days: we are still collecting opinions.',
    categorySlug: 'computers',
    images: [photo('1593642632559-0c6d3fc62b89'), photo('1618384887929-16ec33fab9ef')],
    features: ['Magnetic modular trays', 'Built-in wireless charger', 'Cable routing channel', 'Monitor riser'],
    priceMin: 35,
    priceMax: 49,
    expectedLaunch: '2027-02',
    status: 'open',
    responses: { interested: 9, maybe: 5, notInterested: 4, priceWeights: [10, 25, 35, 25, 5], featureWeights: [30, 35, 20, 15], answerPriceRate: 0.8, answerFeatureRate: 0.7 },
  },
  {
    // Closed, with a Weak signal: shows the seller dashboard's closed state and a negative result.
    ownerEmail: `maker@${SEED_EMAIL_DOMAIN}`,
    title: 'Smart Plant Pot',
    tagline: 'A planter that tells you when it is thirsty',
    description:
      'A self-watering planter with a soil-moisture sensor and a small reservoir that sends a reminder to your phone when it needs topping up. We tested the idea; the response was lukewarm, so this test is closed.',
    categorySlug: 'home-kitchen',
    images: [photo('1485955900006-10f4d324d411'), photo('1459411552884-841db9b3cc2a')],
    features: ['Soil moisture sensor', 'Self-watering reservoir', 'App reminders', 'Built-in grow light'],
    priceMin: 29,
    priceMax: 42,
    expectedLaunch: '2027-03',
    status: 'closed',
    responses: { interested: 13, maybe: 13, notInterested: 35, priceWeights: [22, 40, 26, 10, 2], featureWeights: [34, 30, 24, 12], answerPriceRate: 0.75, answerFeatureRate: 0.7 },
  },
];

/** How many synthetic voters are needed: the largest validation. */
export const VOTER_COUNT = Math.max(...VALIDATION_SEEDS.map((v) => v.responses.interested + v.responses.maybe + v.responses.notInterested));
