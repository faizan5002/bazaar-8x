import { filledValues, parsePrice, type FormState } from '../../lib/demandForm';
import { formatLaunchMonth, formatPriceRange } from '../../lib/format';
import type { ValidationCard as ValidationCardData } from '../../types';
import { ValidationCard } from '../validation/ValidationCard';

/**
 * "How shoppers will see it": the real ValidationCard (as a non-clickable block) plus the few detail-page facts that
 * the card leaves out. It re-renders as the seller types; nothing in it is interactive.
 */
export function ValidationPreview({ form, sellerName, categoryName }: { form: FormState; sellerName: string; categoryName?: string }) {
  const min = parsePrice(form.priceMin);
  const max = parsePrice(form.priceMax);
  const priceOk = min !== null && max !== null && max >= min;
  const features = filledValues(form.features);
  const image = filledValues(form.images)[0] ?? null;
  const title = form.title.trim();
  const tagline = form.tagline.trim();

  const card: ValidationCardData = {
    id: 0,
    title: title || 'Your product name',
    tagline: tagline || 'A short line that makes shoppers curious',
    image,
    priceMin: min ?? 0,
    priceMax: max ?? 0,
    expectedLaunch: form.expectedLaunch,
    status: 'open',
    responseCount: 0,
    seller: { id: 0, name: sellerName, slug: '' },
    category: { id: 0, name: categoryName ?? '', slug: '' },
    createdAt: new Date().toISOString(),
  };

  return (
    <section aria-labelledby="preview-title" data-testid="preview" className="rounded-card border-t-4 border-accent-400 bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="preview-title" className="text-lg font-bold text-slate-900">
          How shoppers will see it
        </h2>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-green-800">
          <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-green-600" />
          Live preview
        </span>
      </div>
      <p className="mt-0.5 text-sm text-slate-600">This updates as you type. It appears in Coming soon once you create the test.</p>

      <div className="mt-4 max-w-sm">
        <ValidationCard validation={card} preview priceLabel={priceOk ? undefined : '$ —'} />
      </div>

      <dl className="mt-4 space-y-1 text-sm" data-testid="preview-facts">
        <div className="flex gap-2">
          <dt className="text-slate-600">Expected launch:</dt>
          <dd className="font-semibold text-slate-900" data-testid="preview-launch">
            {/^\d{4}-\d{2}$/.test(form.expectedLaunch) ? formatLaunchMonth(form.expectedLaunch) : '—'}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-slate-600">Category:</dt>
          <dd className="font-semibold text-slate-900">{categoryName ?? '—'}</dd>
        </div>
        {priceOk && (
          <div className="flex gap-2">
            <dt className="text-slate-600">Proposed price:</dt>
            <dd className="font-semibold text-slate-900">{formatPriceRange(min, max)}</dd>
          </div>
        )}
      </dl>

      {features.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-bold text-slate-900">Proposed features</h3>
          <ul className="mt-1.5 space-y-1.5" data-testid="preview-features">
            {features.map((f) => (
              <li key={f} className="flex gap-2.5 text-sm text-slate-800">
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-600" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
