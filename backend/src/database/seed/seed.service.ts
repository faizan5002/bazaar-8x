import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { DataSource, DeepPartial, EntityManager, EntityTarget, FindOptionsWhere, ObjectLiteral } from 'typeorm';
import { Category } from '../../categories/category.entity';
import { Product } from '../../products/product.entity';
import { Review } from '../../reviews/review.entity';
import { Seller } from '../../sellers/seller.entity';
import { User } from '../../users/user.entity';
import { Interest, ValidationResponse } from '../../validations/validation-response.entity';
import { Validation, ValidationStatus } from '../../validations/validation.entity';
import {
  CATEGORIES,
  DEMO_SELLER_USERS,
  DEMO_SHOPPER,
  E2E_EMAIL_DOMAIN,
  PRODUCTS,
  REVIEWERS,
  SEED_EMAIL_DOMAIN,
  SEED_PASSWORD,
  SELLERS,
  VALIDATION_SEEDS,
  VOTER_COUNT,
  VOTER_EMAIL_PATTERN,
  voterEmail,
} from './data';
import type { ValidationSeed } from './data/validations';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Small deterministic PRNG (mulberry32) so synthetic data is identical on every run. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hashString = (text: string) => [...text].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);

/** Picks an index with probability proportional to its weight; `roll` is a uniform number in [0, 1). */
function weightedIndex(weights: number[], roll: number) {
  const target = roll * weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (target < acc) return i;
  }
  return weights.length - 1;
}

/**
 * Idempotent development seed. Every record is matched by a natural key (slug / email), so running it
 * repeatedly updates the catalog in place instead of duplicating it. Everything runs in one transaction.
 *
 * Seed reviews are identified by their author's `@seed.bazaar.test` email: they are deleted and re-created on
 * every run, while reviews written by real accounts are never touched.
 */
@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly dataSource: DataSource) {}

  async run() {
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

    await this.dataSource.transaction(async (em) => {
      await this.removeE2eData(em);
      const sellers = await this.seedSellers(em);
      const categories = await this.seedCategories(em);
      const users = await this.seedUsers(em, passwordHash);
      const products = await this.seedProducts(em, sellers, categories);
      await this.seedReviews(em, products, users);
      const demoSellers = await this.seedDemoSellers(em, users);
      const voters = await this.seedVoters(em, passwordHash);
      await this.seedValidations(em, demoSellers, categories, voters);
    });

    const [sellers, categories, products, reviews, users, validations, validationResponses] = await Promise.all([
      this.dataSource.getRepository(Seller).count(),
      this.dataSource.getRepository(Category).count(),
      this.dataSource.getRepository(Product).count(),
      this.dataSource.getRepository(Review).count(),
      this.dataSource.getRepository(User).count(),
      this.dataSource.getRepository(Validation).count(),
      this.dataSource.getRepository(ValidationResponse).count(),
    ]);
    this.logger.log(`Done. Database now has ${categories} categories, ${sellers} sellers, ${products} products, ${reviews} reviews, ${users} users, ${validations} demand validations with ${validationResponses} responses.`);
    this.logger.log(`Dev login (shopper): ${DEMO_SHOPPER.email} / ${SEED_PASSWORD}`);
    this.logger.log(`Dev logins (sellers): ${DEMO_SELLER_USERS.map((u) => u.email).join(', ')} / ${SEED_PASSWORD}`);
  }

  /** Find by natural key, then insert or update. */
  private async upsert<T extends ObjectLiteral>(
    em: EntityManager,
    target: EntityTarget<T>,
    where: FindOptionsWhere<T>,
    values: DeepPartial<T>,
  ): Promise<T> {
    const repo = em.getRepository(target);
    const existing = await repo.findOne({ where });
    return repo.save(repo.merge(existing ?? repo.create(), values));
  }

  /** Test shoppers (and their carts / orders) left behind by the Playwright suite. Order lines and cart lines cascade. */
  private async removeE2eData(em: EntityManager) {
    const testUsers = `SELECT id FROM users WHERE email LIKE '%@${E2E_EMAIL_DOMAIN}'`;
    await em.query(`DELETE FROM orders WHERE "userId" IN (${testUsers})`);
    await em.query(`DELETE FROM carts WHERE "userId" IN (${testUsers})`);
    await em.query(`DELETE FROM reviews WHERE "userId" IN (${testUsers})`);
    await em.query(`DELETE FROM sellers WHERE "ownerId" IN (${testUsers})`); // their validations and responses cascade
    // For DELETE … RETURNING the Postgres driver answers [rows, affectedCount].
    const [, removed] = (await em.query(`DELETE FROM users WHERE email LIKE '%@${E2E_EMAIL_DOMAIN}' RETURNING id`)) as [unknown[], number];
    if (removed) this.logger.log(`Removed ${removed} leftover test accounts (@${E2E_EMAIL_DOMAIN}) with their carts and orders.`);
  }

  private async seedSellers(em: EntityManager) {
    const bySlug = new Map<string, Seller>();
    for (const s of SELLERS) {
      bySlug.set(s.slug, await this.upsert(em, Seller, { slug: s.slug }, s));
    }
    return bySlug;
  }

  private async seedCategories(em: EntityManager) {
    const bySlug = new Map<string, Category>();
    for (const c of CATEGORIES) {
      bySlug.set(c.slug, await this.upsert(em, Category, { slug: c.slug }, c));
    }
    return bySlug;
  }

  private async seedUsers(em: EntityManager, passwordHash: string) {
    const byEmail = new Map<string, User>();
    for (const u of [...REVIEWERS, DEMO_SHOPPER, ...DEMO_SELLER_USERS]) {
      byEmail.set(u.email, await this.upsert(em, User, { email: u.email }, { email: u.email, name: u.name, passwordHash }));
    }
    return byEmail;
  }

  private async seedProducts(em: EntityManager, sellers: Map<string, Seller>, categories: Map<string, Category>) {
    const bySlug = new Map<string, Product>();
    for (const p of PRODUCTS) {
      const seller = sellers.get(p.seller);
      const category = categories.get(p.category);
      if (!seller || !category) throw new Error(`Product "${p.slug}" references unknown seller "${p.seller}" or category "${p.category}"`);

      bySlug.set(
        p.slug,
        await this.upsert(em, Product, { slug: p.slug }, {
          slug: p.slug,
          title: p.title,
          brand: p.brand,
          description: p.description,
          images: p.images,
          features: p.features,
          specifications: p.specifications,
          variants: p.variants ?? [],
          price: p.price,
          originalPrice: p.originalPrice ?? null,
          stock: p.stock,
          ratingAverage: p.rating,
          reviewCount: p.reviewCount,
          deliveryDays: p.deliveryDays,
          freeShipping: p.freeShipping,
          isDeal: p.isDeal ?? false,
          isFeatured: p.isFeatured ?? false,
          soldCount: p.soldCount,
          category,
          seller,
        }),
      );
    }
    return bySlug;
  }

  // ---- demand validation demo data (ALL synthetic: see data/validations.ts) -----------------------------------------

  /** One store per demo seller account. Existing catalog sellers are untouched. */
  private async seedDemoSellers(em: EntityManager, users: Map<string, User>) {
    const byOwner = new Map<string, Seller>();
    for (const demo of DEMO_SELLER_USERS) {
      const owner = users.get(demo.email);
      if (!owner) throw new Error(`Demo seller account ${demo.email} was not created`);
      byOwner.set(demo.email, await this.upsert(em, Seller, { slug: demo.store.slug }, { ...demo.store, rating: 0, owner }));
    }
    return byOwner;
  }

  /**
   * Synthetic shoppers voter-0001 … voter-NNNN, created once and reused. Inserted in bulk and `ON CONFLICT DO NOTHING`,
   * so re-running creates only the missing ones. Returns voter number → user id.
   */
  private async seedVoters(em: EntityManager, passwordHash: string) {
    const existing = await em.query(`SELECT email FROM users WHERE email LIKE '${VOTER_EMAIL_PATTERN}'`);
    const have = new Set<string>(existing.map((r: { email: string }) => r.email));
    const missing = Array.from({ length: VOTER_COUNT }, (_, i) => i + 1).filter((n) => !have.has(voterEmail(n)));
    for (let i = 0; i < missing.length; i += 500) {
      const rows = missing.slice(i, i + 500).map((n) => ({ email: voterEmail(n), name: `Seed Voter ${String(n).padStart(4, '0')}`, passwordHash }));
      await em.createQueryBuilder().insert().into(User).values(rows).orIgnore().execute();
    }
    const ids = await em.query(`SELECT id, email FROM users WHERE email LIKE '${VOTER_EMAIL_PATTERN}'`);
    const byNumber = new Map<number, number>();
    for (const row of ids as { id: number; email: string }[]) byNumber.set(Number(row.email.match(/^voter-(\d+)@/)![1]), row.id);
    return byNumber;
  }

  private async seedValidations(em: EntityManager, sellers: Map<string, Seller>, categories: Map<string, Category>, voters: Map<number, number>) {
    for (const seed of VALIDATION_SEEDS) {
      const seller = sellers.get(seed.ownerEmail);
      const category = categories.get(seed.categorySlug);
      if (!seller || !category) throw new Error(`Validation "${seed.title}" references an unknown seller or category`);
      // Natural key: (seller, title).
      const validation = await this.upsert(
        em,
        Validation,
        { seller: { id: seller.id }, title: seed.title },
        {
          seller,
          category,
          title: seed.title,
          tagline: seed.tagline,
          description: seed.description,
          images: seed.images,
          features: seed.features,
          priceMin: seed.priceMin,
          priceMax: seed.priceMax,
          expectedLaunch: seed.expectedLaunch,
          status: seed.status === 'open' ? ValidationStatus.Open : ValidationStatus.Closed,
        },
      );
      await this.seedResponses(em, validation, seed, voters);
    }
  }

  /**
   * Generates `seed.responses` deterministically (a PRNG seeded by the title) for voters 1..N and upserts them on
   * UNIQUE(validation, user): the same run twice yields the same rows, never extras. Interest counts are exact; the
   * optional price/feature answers follow the weights. Rows from synthetic voters beyond N are removed if the counts
   * ever shrink. Responses from real accounts are never touched.
   */
  private async seedResponses(em: EntityManager, validation: Validation, seed: ValidationSeed, voters: Map<number, number>) {
    const r = seed.responses;
    const total = r.interested + r.maybe + r.notInterested;
    const rng = mulberry32(hashString(seed.title));

    const interests: Interest[] = [
      ...Array<Interest>(r.interested).fill(Interest.Interested),
      ...Array<Interest>(r.maybe).fill(Interest.Maybe),
      ...Array<Interest>(r.notInterested).fill(Interest.NotInterested),
    ];
    for (let i = interests.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [interests[i], interests[j]] = [interests[j], interests[i]];
    }

    const now = Date.now();
    const rows = interests.map((interest, i) => {
      const userId = voters.get(i + 1);
      if (userId === undefined) throw new Error(`Synthetic voter ${i + 1} is missing`);
      const open = interest !== Interest.NotInterested;
      const priceBucket = open && rng() < r.answerPriceRate ? weightedIndex(r.priceWeights, rng()) : null;
      const topFeature = open && rng() < r.answerFeatureRate ? seed.features[weightedIndex(r.featureWeights, rng())] : null;
      const at = new Date(now - Math.floor(rng() * 30 * DAY_MS)); // spread over the last 30 days
      return { validation: { id: validation.id } as Validation, user: { id: userId } as User, interest, priceBucket, topFeature, createdAt: at, updatedAt: at };
    });

    for (let i = 0; i < rows.length; i += 500) {
      await em
        .createQueryBuilder()
        .insert()
        .into(ValidationResponse)
        .values(rows.slice(i, i + 500))
        // createdAt/updatedAt are deliberately not overwritten: an existing row keeps its original date.
        .orUpdate(['interest', 'priceBucket', 'topFeature'], ['validationId', 'userId'])
        .execute();
    }

    await em.query(
      `DELETE FROM validation_responses vr USING users u
        WHERE vr."userId" = u.id AND vr."validationId" = $1 AND u.email LIKE '${VOTER_EMAIL_PATTERN}'
          AND CAST(substring(u.email from 'voter-([0-9]+)@') AS int) > $2`,
      [validation.id, total],
    );
  }

  private async seedReviews(em: EntityManager, products: Map<string, Product>, users: Map<string, User>) {
    const seedUserIds = [...users.values()].map((u) => u.id);
    await em.createQueryBuilder().delete().from(Review).where('"userId" IN (:...ids)', { ids: seedUserIds }).execute();

    const now = Date.now();
    const reviews: DeepPartial<Review>[] = PRODUCTS.flatMap((p) =>
      p.reviews.map((r) => {
        const product = products.get(p.slug);
        const reviewer = REVIEWERS[r.reviewer];
        const user = reviewer && users.get(reviewer.email);
        if (!product || !user) throw new Error(`Review on "${p.slug}" references an unknown product or reviewer index ${r.reviewer}`);
        return {
          product,
          user,
          authorName: user.name,
          rating: r.rating,
          title: r.title,
          body: r.body,
          verifiedPurchase: r.verified,
          createdAt: new Date(now - r.daysAgo * DAY_MS),
        };
      }),
    );
    await em.getRepository(Review).save(reviews);
    this.logger.log(`Seeded ${reviews.length} reviews from ${REVIEWERS.length} seed accounts (@${SEED_EMAIL_DOMAIN}).`);
  }
}
