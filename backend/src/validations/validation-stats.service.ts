import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PriceBucket, priceBuckets } from '../common/price-buckets';
import { DemandSignal, InterestCounts, demandSignal, percent } from '../common/demand-signal';
import { ValidationResponse } from './validation-response.entity';
import { Validation, ValidationStatus } from './validation.entity';

/** A price option counts as "pressure" (lowest bucket) or "headroom" (highest) when at least this share of the answers pick it. */
export const PRICE_SIGNAL_PERCENT = 25;
/** …but only once this many people have answered the price question, so a handful of answers can't raise a flag. */
export const MIN_PRICE_ANSWERS = 10;

export interface CountShare {
  count: number;
  /** Share of ALL responses, to one decimal. */
  percent: number;
}

export interface PriceBucketResult extends PriceBucket {
  count: number;
  /** Share of the people who answered the price question (sums to ~100). */
  percent: number;
  /** Share of all responses, for "X% of everyone who responded". */
  percentOfResponses: number;
}

export interface FeatureResult {
  name: string;
  count: number;
  /** Share of the people who answered the feature question. */
  percent: number;
  percentOfResponses: number;
}

export interface PriceSignal {
  bucket: PriceBucket;
  count: number;
  percent: number;
  /** True when the share is at least PRICE_SIGNAL_PERCENT with at least MIN_PRICE_ANSWERS answers. */
  flagged: boolean;
}

export interface ValidationResults {
  validation: {
    id: number;
    title: string;
    tagline: string;
    status: ValidationStatus;
    priceMin: number;
    priceMax: number;
    expectedLaunch: string;
    createdAt: Date;
    image: string | null;
    category: { id: number; name: string; slug: string };
  };
  totalResponses: number;
  interest: { interested: CountShare; maybe: CountShare; notInterested: CountShare };
  signal: DemandSignal;
  /** All five buckets, zero-filled, in price order. */
  priceBuckets: PriceBucketResult[];
  /** How many responses chose a price bucket. */
  priceAnswered: number;
  /** Every feature the seller listed, zero-filled, most-chosen first. */
  features: FeatureResult[];
  featureAnswered: number;
  /** Ready-made facts for the three insight sentences on the results page. */
  insights: {
    /** The most chosen price bucket (the "sweet spot"), or null if nobody answered. */
    preferredPrice: (PriceBucketResult & { share: number }) | null;
    /** Shoppers who expect to pay less than the proposed minimum. */
    pricePressure: PriceSignal;
    /** Shoppers who would pay more than the proposed maximum. */
    priceHeadroom: PriceSignal;
    topFeature: FeatureResult | null;
  };
}

interface Raw {
  key: string | number | null;
  count: string;
}

/** Plain aggregate queries over validation_responses. No analytics framework. */
@Injectable()
export class ValidationStatsService {
  constructor(@InjectRepository(ValidationResponse) private readonly responses: Repository<ValidationResponse>) {}

  private grouped(validationId: number, column: 'interest' | 'priceBucket' | 'topFeature'): Promise<Raw[]> {
    return this.responses
      .createQueryBuilder('r')
      .select(`r."${column}"`, 'key')
      .addSelect('COUNT(*)', 'count')
      .where('r."validationId" = :validationId', { validationId })
      .andWhere(`r."${column}" IS NOT NULL`)
      .groupBy(`r."${column}"`)
      .getRawMany<Raw>();
  }

  /** Interest counts for several validations at once (the seller's list). Validations with no responses are all zeros. */
  async interestCounts(validationIds: number[]): Promise<Map<number, InterestCounts>> {
    const out = new Map<number, InterestCounts>(validationIds.map((id) => [id, { interested: 0, maybe: 0, notInterested: 0 }]));
    if (validationIds.length === 0) return out;
    const rows = await this.responses
      .createQueryBuilder('r')
      .select('r."validationId"', 'validationId')
      .addSelect('r."interest"', 'interest')
      .addSelect('COUNT(*)', 'count')
      .where('r."validationId" IN (:...ids)', { ids: validationIds })
      .groupBy('r."validationId"')
      .addGroupBy('r."interest"')
      .getRawMany<{ validationId: number; interest: string; count: string }>();
    for (const row of rows) {
      const counts = out.get(Number(row.validationId))!;
      if (row.interest === 'interested') counts.interested = Number(row.count);
      else if (row.interest === 'maybe') counts.maybe = Number(row.count);
      else counts.notInterested = Number(row.count);
    }
    return out;
  }

  /** `validation` must be loaded with its category. */
  async results(validation: Validation): Promise<ValidationResults> {
    const [interestRows, bucketRows, featureRows] = await Promise.all([
      this.grouped(validation.id, 'interest'),
      this.grouped(validation.id, 'priceBucket'),
      this.grouped(validation.id, 'topFeature'),
    ]);

    const interestCount = (name: string) => Number(interestRows.find((r) => r.key === name)?.count ?? 0);
    const counts: InterestCounts = { interested: interestCount('interested'), maybe: interestCount('maybe'), notInterested: interestCount('not_interested') };
    const signal = demandSignal(counts);
    const total = signal.total;

    const bucketCounts = new Map(bucketRows.map((r) => [Number(r.key), Number(r.count)]));
    const priceAnswered = [...bucketCounts.values()].reduce((a, b) => a + b, 0);
    const buckets: PriceBucketResult[] = priceBuckets(validation.priceMin, validation.priceMax).map((b) => {
      const count = bucketCounts.get(b.index) ?? 0;
      return { ...b, count, percent: percent(count, priceAnswered), percentOfResponses: percent(count, total) };
    });

    const featureCounts = new Map(featureRows.map((r) => [String(r.key), Number(r.count)]));
    const featureAnswered = [...featureCounts.values()].reduce((a, b) => a + b, 0);
    const features: FeatureResult[] = validation.features
      .map((name, order) => ({ name, order, count: featureCounts.get(name) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.order - b.order)
      .map(({ name, count }) => ({ name, count, percent: percent(count, featureAnswered), percentOfResponses: percent(count, total) }));

    const priceSignal = (bucket: PriceBucketResult): PriceSignal => ({
      bucket: { index: bucket.index, label: bucket.label, min: bucket.min, max: bucket.max },
      count: bucket.count,
      percent: bucket.percent,
      flagged: priceAnswered >= MIN_PRICE_ANSWERS && bucket.percent >= PRICE_SIGNAL_PERCENT,
    });
    // Ties go to the lower price: the cautious reading of "most popular".
    const preferred = priceAnswered > 0 ? buckets.reduce((best, b) => (b.count > best.count ? b : best)) : null;

    return {
      validation: {
        id: validation.id,
        title: validation.title,
        tagline: validation.tagline,
        status: validation.status,
        priceMin: validation.priceMin,
        priceMax: validation.priceMax,
        expectedLaunch: validation.expectedLaunch,
        createdAt: validation.createdAt,
        image: validation.images[0] ?? null,
        category: { id: validation.category.id, name: validation.category.name, slug: validation.category.slug },
      },
      totalResponses: total,
      interest: {
        interested: { count: counts.interested, percent: signal.interestedPercent },
        maybe: { count: counts.maybe, percent: signal.maybePercent },
        notInterested: { count: counts.notInterested, percent: signal.notInterestedPercent },
      },
      signal,
      priceBuckets: buckets,
      priceAnswered,
      features,
      featureAnswered,
      insights: {
        preferredPrice: preferred && { ...preferred, share: preferred.percent },
        pricePressure: priceSignal(buckets[0]),
        priceHeadroom: priceSignal(buckets[4]),
        topFeature: featureAnswered > 0 ? features[0] : null,
      },
    };
  }
}
