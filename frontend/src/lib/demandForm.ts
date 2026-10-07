import type { CreateValidationInput } from '../types';

/** The same limits the API enforces (backend/src/validations/dto/validation.dto.ts). The API stays the authority; these just give feedback sooner. */
export const LIMITS = { title: [3, 120], tagline: [3, 160], description: [10, 4000], feature: [2, 60], minFeatures: 3, maxFeatures: 6, maxImages: 5, maxPrice: 100_000, maxLaunchMonthsAhead: 36 } as const;

/** Rows keep a stable key so React doesn't reuse the wrong input when one is removed. */
export interface Row {
  key: number;
  value: string;
}

export interface FormState {
  title: string;
  tagline: string;
  description: string;
  categoryId: string;
  images: Row[];
  features: Row[];
  priceMin: string;
  priceMax: string;
  expectedLaunch: string;
}

export type FieldKey = 'title' | 'tagline' | 'description' | 'categoryId' | 'images' | 'features' | 'priceMin' | 'priceMax' | 'expectedLaunch';
export type Errors = Partial<Record<FieldKey, string>>;

/** Display order of the fields: used to focus the first problem. */
export const FIELD_ORDER: FieldKey[] = ['title', 'tagline', 'description', 'categoryId', 'images', 'features', 'priceMin', 'priceMax', 'expectedLaunch'];

const pad = (n: number) => String(n).padStart(2, '0');
/** "YYYY-MM" for `months` months from `now`, in the shopper's local calendar (like the rest of the app). */
export function monthFromNow(months: number, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() + months, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function emptyForm(now = new Date()): FormState {
  return {
    title: '',
    tagline: '',
    description: '',
    categoryId: '',
    images: [{ key: 1, value: '' }],
    features: [1, 2, 3].map((key) => ({ key, value: '' })),
    priceMin: '',
    priceMax: '',
    expectedLaunch: monthFromNow(3, now),
  };
}

/** "49.5" → 49.5; anything that isn't a plain amount with at most two decimals → null. */
export function parsePrice(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t) && !/^\.\d{1,2}$/.test(t)) return null;
  return Number(t);
}

/** The non-empty, trimmed values of a list of input rows. */
export const filledValues = (rows: Row[]) => rows.map((r) => r.value.trim()).filter(Boolean);
const filled = filledValues;

function isHttpUrl(text: string) {
  try {
    const u = new URL(text);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function lengthProblem(label: string, value: string, [min, max]: readonly [number, number]) {
  const n = value.trim().length;
  if (n === 0) return `${label} is required.`;
  if (n < min) return `${label} must be at least ${min} characters.`;
  if (n > max) return `${label} must be ${max} characters or fewer.`;
  return null;
}

export function validate(f: FormState, now = new Date()): Errors {
  const e: Errors = {};
  const title = lengthProblem('Product title', f.title, LIMITS.title);
  if (title) e.title = title;
  const tagline = lengthProblem('Tagline', f.tagline, LIMITS.tagline);
  if (tagline) e.tagline = tagline;
  const description = lengthProblem('Description', f.description, LIMITS.description);
  if (description) e.description = description;
  if (!f.categoryId) e.categoryId = 'Choose a category.';

  const images = filled(f.images);
  const badImage = images.find((u) => !isHttpUrl(u) || u.length > 500);
  if (badImage) e.images = `"${badImage.slice(0, 40)}${badImage.length > 40 ? '…' : ''}" isn't a valid image link. Use a full http(s) URL.`;

  const features = filled(f.features);
  if (features.length < LIMITS.minFeatures) e.features = `Add at least ${LIMITS.minFeatures} features (you have ${features.length}).`;
  else if (features.some((x) => x.length < LIMITS.feature[0] || x.length > LIMITS.feature[1])) e.features = `Each feature must be ${LIMITS.feature[0]}–${LIMITS.feature[1]} characters.`;
  else if (new Set(features.map((x) => x.toLowerCase())).size !== features.length) e.features = 'Features must be different from each other.';

  const min = parsePrice(f.priceMin);
  const max = parsePrice(f.priceMax);
  if (!f.priceMin.trim()) e.priceMin = 'Enter a minimum price.';
  else if (min === null) e.priceMin = 'Enter an amount like 79 or 79.50.';
  else if (min < 0.01 || min > LIMITS.maxPrice) e.priceMin = `Minimum price must be between $0.01 and $${LIMITS.maxPrice.toLocaleString('en-US')}.`;
  if (!f.priceMax.trim()) e.priceMax = 'Enter a maximum price.';
  else if (max === null) e.priceMax = 'Enter an amount like 99 or 99.50.';
  else if (max < 0.01 || max > LIMITS.maxPrice) e.priceMax = `Maximum price must be between $0.01 and $${LIMITS.maxPrice.toLocaleString('en-US')}.`;
  else if (min !== null && max < min) e.priceMax = 'Maximum price must be at least the minimum price.';

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(f.expectedLaunch)) e.expectedLaunch = 'Choose the month you expect to launch.';
  else if (f.expectedLaunch < monthFromNow(0, now)) e.expectedLaunch = 'The launch month can’t be in the past.';
  else if (f.expectedLaunch > monthFromNow(LIMITS.maxLaunchMonthsAhead, now)) e.expectedLaunch = `The launch month must be within the next ${LIMITS.maxLaunchMonthsAhead} months.`;
  return e;
}

/** Only call after `validate` found nothing. */
export function toInput(f: FormState): CreateValidationInput {
  return {
    title: f.title.trim(),
    tagline: f.tagline.trim(),
    description: f.description.trim(),
    categoryId: Number(f.categoryId),
    images: filled(f.images),
    features: filled(f.features),
    priceMin: parsePrice(f.priceMin)!,
    priceMax: parsePrice(f.priceMax)!,
    expectedLaunch: f.expectedLaunch,
  };
}

const PATTERNS: [RegExp, FieldKey][] = [
  [/\btitle\b/i, 'title'],
  [/\btagline\b/i, 'tagline'],
  [/\bdescription\b/i, 'description'],
  [/\bcategory(Id)?\b/i, 'categoryId'],
  [/\bimages?\b/i, 'images'],
  [/\bfeatures?\b/i, 'features'],
  [/\bpriceMin\b/i, 'priceMin'],
  [/\bpriceMax\b/i, 'priceMax'],
  [/\bexpectedLaunch\b/i, 'expectedLaunch'],
];

const FRIENDLY: [RegExp, string][] = [
  [/\bpriceMin\b/g, 'Minimum price'],
  [/\bpriceMax\b/g, 'Maximum price'],
  [/\bexpectedLaunch\b/g, 'Expected launch'],
  [/\bcategoryId\b/g, 'Category'],
];
const friendly = (m: string) => {
  const text = FRIENDLY.reduce((s, [re, label]) => s.replace(re, label), m);
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** The API reports one message per problem, naming the field. Pins each to its field; the rest stay in `general`. */
export function placeServerErrors(messages: string[]): { fields: Errors; general: string[] } {
  const fields: Errors = {};
  const general: string[] = [];
  for (const raw of messages) {
    const m = friendly(raw);
    // Match on the API's own wording (show the friendlier one). A message can name two fields ("priceMax must be ≥ priceMin"):
    // it belongs to the one it starts with, i.e. the earliest mention.
    const hit = PATTERNS.map(([re, key]) => ({ key, at: raw.search(re) }))
      .filter((h) => h.at >= 0)
      .sort((x, y) => x.at - y.at)[0];
    if (hit) fields[hit.key] = fields[hit.key] ? `${fields[hit.key]} ${m}` : m;
    else general.push(m);
  }
  return { fields, general };
}
