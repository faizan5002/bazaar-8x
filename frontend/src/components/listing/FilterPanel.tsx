import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { priceRangeLabel, type ListingFilters } from '../../lib/listingQuery';
import type { Category } from '../../types';
import { Button } from '../ui/Button';
import { Rating } from '../ui/Rating';

interface FilterPanelProps {
  value: ListingFilters;
  /** Receives only the keys that changed; `undefined` means "remove this filter". */
  onChange: (patch: Partial<ListingFilters>) => void;
  categories: Category[];
}

const PRICE_PRESETS: { min?: number; max?: number }[] = [{ max: 25 }, { min: 25, max: 50 }, { min: 50, max: 100 }, { min: 100, max: 200 }, { min: 200 }];
const RATING_OPTIONS = [4.5, 4, 3];

const input = 'h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-400/40';
const option = 'flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm text-slate-800 hover:bg-slate-50';
const control = 'h-4 w-4 shrink-0 accent-accent-600';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-line py-4 first:border-t-0 first:pt-0">
      {/* The border lives on the wrapper: a bordered <fieldset> draws its line straight through the <legend>. */}
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-2 p-0 text-sm font-bold text-slate-900">{title}</legend>
        <div className="space-y-0.5">{children}</div>
      </fieldset>
    </div>
  );
}

/**
 * The filter controls, shared by the desktop sidebar (applies immediately) and the mobile drawer
 * (edits a draft that is applied on "Apply"). It is fully controlled: it never owns the filter values.
 */
export function FilterPanel({ value, onChange, categories }: FilterPanelProps) {
  const uid = useId();
  // Price inputs hold text while typing and are committed with the "Go" button / Enter.
  const [min, setMin] = useState(value.minPrice?.toString() ?? '');
  const [max, setMax] = useState(value.maxPrice?.toString() ?? '');
  useEffect(() => {
    setMin(value.minPrice?.toString() ?? '');
    setMax(value.maxPrice?.toString() ?? '');
  }, [value.minPrice, value.maxPrice]);

  const applyPrice = (e: FormEvent) => {
    e.preventDefault();
    let lo = min.trim() === '' ? undefined : Math.max(0, Number(min));
    let hi = max.trim() === '' ? undefined : Math.max(0, Number(max));
    if (lo !== undefined && !Number.isFinite(lo)) lo = undefined;
    if (hi !== undefined && !Number.isFinite(hi)) hi = undefined;
    if (lo !== undefined && hi !== undefined && lo > hi) [lo, hi] = [hi, lo];
    onChange({ minPrice: lo, maxPrice: hi });
  };

  return (
    <div>
      <Group title="Category">
        <label className={option}>
          <input type="radio" name={`${uid}-category`} className={control} checked={!value.category} onChange={() => onChange({ category: undefined })} />
          All categories
        </label>
        {categories.map((c) => (
          <label key={c.id} className={option}>
            <input type="radio" name={`${uid}-category`} className={control} checked={value.category === c.slug} onChange={() => onChange({ category: c.slug })} />
            {c.name}
          </label>
        ))}
      </Group>

      <Group title="Price">
        <label className={option}>
          <input type="radio" name={`${uid}-price`} className={control} checked={value.minPrice === undefined && value.maxPrice === undefined} onChange={() => onChange({ minPrice: undefined, maxPrice: undefined })} />
          Any price
        </label>
        {PRICE_PRESETS.map((p) => (
          <label key={priceRangeLabel(p.min, p.max)} className={option}>
            <input
              type="radio"
              name={`${uid}-price`}
              className={control}
              checked={value.minPrice === p.min && value.maxPrice === p.max}
              onChange={() => onChange({ minPrice: p.min, maxPrice: p.max })}
            />
            {priceRangeLabel(p.min, p.max)}
          </label>
        ))}
        <form onSubmit={applyPrice} className="flex items-center gap-2 pt-2" aria-label="Custom price range">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Minimum price</span>
            <input type="number" inputMode="decimal" min={0} step="any" placeholder="Min" value={min} onChange={(e) => setMin(e.target.value)} className={input} />
          </label>
          <span aria-hidden="true" className="text-slate-400">
            –
          </span>
          <label className="min-w-0 flex-1">
            <span className="sr-only">Maximum price</span>
            <input type="number" inputMode="decimal" min={0} step="any" placeholder="Max" value={max} onChange={(e) => setMax(e.target.value)} className={input} />
          </label>
          <Button type="submit" variant="ghost" className="h-9 px-3 py-0">
            Go
          </Button>
        </form>
      </Group>

      <Group title="Customer rating">
        {RATING_OPTIONS.map((r) => (
          <label key={r} className={option}>
            <input type="radio" name={`${uid}-rating`} className={control} checked={value.minRating === r} onChange={() => onChange({ minRating: r })} aria-label={`${r} stars & up`} />
            <Rating value={r} size={16} />
            <span className="text-slate-700">&amp; up</span>
          </label>
        ))}
        <label className={option}>
          <input type="radio" name={`${uid}-rating`} className={control} checked={value.minRating === undefined} onChange={() => onChange({ minRating: undefined })} />
          Any rating
        </label>
      </Group>

      <Group title="Availability">
        <label className={option}>
          <input type="checkbox" className={control} checked={!!value.inStock} onChange={(e) => onChange({ inStock: e.target.checked || undefined })} />
          In stock only
        </label>
      </Group>

      <Group title="Deals">
        <label className={option}>
          <input type="checkbox" className={control} checked={!!value.deals} onChange={(e) => onChange({ deals: e.target.checked || undefined })} />
          Today&apos;s deals only
        </label>
      </Group>
    </div>
  );
}
