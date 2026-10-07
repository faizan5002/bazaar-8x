import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { SellerBreadcrumb } from '../components/seller/SellerStates';
import { ValidationPreview } from '../components/seller/ValidationPreview';
import { Button, ButtonLink } from '../components/ui/Button';
import { Container } from '../components/ui/Container';
import { XIcon } from '../components/ui/icons';
import { useAuth } from '../context/AuthContext';
import { useCategories } from '../context/CatalogContext';
import { ApiError, api } from '../lib/api';
import { FIELD_ORDER, LIMITS, emptyForm, monthFromNow, placeServerErrors, toInput, validate, type Errors, type FieldKey, type FormState } from '../lib/demandForm';

const control = 'w-full rounded-md border bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2';
const ok = 'border-slate-300 focus:border-accent-500 focus:ring-accent-400/40';
const bad = 'border-red-500 focus:border-red-500 focus:ring-red-300/50';
const inputBox = (invalid: boolean) => `${control} ${invalid ? bad : ok} h-11`;

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: (aria: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
}

/** Label + control + hint + inline error, wired together for screen readers. */
function Field({ id, label, hint, error, optional, children }: FieldProps) {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-900">
        {label} {optional && <span className="font-normal text-slate-500">(optional)</span>}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="mt-0.5 text-sm text-slate-600">
          {hint}
        </p>
      )}
      <div className="mt-1.5">{children({ id, 'aria-invalid': !!error, 'aria-describedby': describedBy })}</div>
      {error && (
        <p id={`${id}-error`} data-testid={`${id}-error`} className="mt-1 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card bg-white p-4 shadow-card sm:p-6">
      <h2 className="mb-4 text-lg font-bold text-slate-900 sm:text-xl">{title}</h2>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

/** A dollar amount: shows a "$", lets people type digits and one decimal point only. */
function MoneyInput({ aria, value, onChange, onBlur, invalid }: { aria: object; value: string; onChange: (v: string) => void; onBlur: () => void; invalid: boolean }) {
  return (
    <div className="relative">
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
        $
      </span>
      <input {...aria} type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))} onBlur={onBlur} className={`${inputBox(invalid)} pl-7`} />
    </div>
  );
}

let nextKey = 100;

/** /seller/validations/new: propose a product, see how shoppers will see it, and publish the test. */
export function NewValidationPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data: categories, loading: categoriesLoading, error: categoriesError } = useCategories();

  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [touched, setTouched] = useState<Set<FieldKey>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverFields, setServerFields] = useState<Errors>({});
  const [general, setGeneral] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'Create a demand test — Bazaar';
  }, []);

  const problems = useMemo(() => validate(form), [form]);
  const shown = (key: FieldKey) => serverFields[key] ?? (submitted || touched.has(key) ? problems[key] : undefined);
  const invalidKeys = FIELD_ORDER.filter((k) => shown(k));

  const update = (patch: Partial<FormState>, key: FieldKey) => {
    setForm((f) => ({ ...f, ...patch }));
    setServerFields((s) => {
      if (!s[key]) return s;
      const next = { ...s };
      delete next[key];
      return next;
    });
  };
  const touch = (key: FieldKey) => setTouched((t) => (t.has(key) ? t : new Set(t).add(key)));
  const setRow = (list: 'images' | 'features', key: number, value: string) => update({ [list]: form[list].map((r) => (r.key === key ? { ...r, value } : r)) }, list);
  const addRow = (list: 'images' | 'features') => update({ [list]: [...form[list], { key: nextKey++, value: '' }] }, list);
  const removeRow = (list: 'images' | 'features', key: number) => update({ [list]: form[list].filter((r) => r.key !== key) }, list);

  const focusField = (key: FieldKey) => {
    const el = document.querySelector<HTMLElement>(`[data-field="${key}"] input, [data-field="${key}"] textarea, [data-field="${key}"] select`) ?? document.getElementById(`f-${key}`);
    el?.focus();
    return !!el && document.activeElement === el;
  };
  /** Moves focus to the first field with a problem. The field is already on the page for our own checks; after a server
      refusal the message is rendered a moment later, so try again shortly if the first attempt didn't take. */
  const focusFirstProblem = (keys: FieldKey[]) => {
    const first = keys[0];
    if (first && !focusField(first)) window.setTimeout(() => focusField(first), 50);
  };

  const onSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (submittingRef.current) return;
    setSubmitted(true);
    setGeneral([]);
    const found = FIELD_ORDER.filter((k) => problems[k]);
    if (found.length > 0) {
      focusFirstProblem(found);
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const created = await api.seller.createValidation(toInput(form));
      navigate(`/seller/validations/${created.id}`, { state: { justCreated: true } });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        navigate('/login', { state: { from: '/seller/validations/new' } });
      } else if (err instanceof ApiError && err.status === 403) {
        setGeneral(['You need a seller account to create a demand test.']);
      } else if (err instanceof ApiError && err.status === 400) {
        const placed = placeServerErrors(err.messages);
        setServerFields(placed.fields);
        setGeneral(placed.general);
        const keys = FIELD_ORDER.filter((k) => placed.fields[k]);
        if (keys.length) focusFirstProblem(keys);
        else summaryRef.current?.focus();
      } else if (err instanceof ApiError) {
        setGeneral([err.message]);
      } else {
        setGeneral(["We couldn't reach the store, so your demand test was NOT created. Please try again."]);
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const categoryName = categories?.find((c) => String(c.id) === form.categoryId)?.name;
  const launchMin = monthFromNow(0);
  const launchMax = monthFromNow(LIMITS.maxLaunchMonthsAhead);
  const describe = (id: string, errorId: string, error?: string) => ({ id, 'aria-invalid': !!error, 'aria-describedby': error ? errorId : undefined });

  return (
    <Container className="py-4 lg:py-6">
      <SellerBreadcrumb trail={[{ label: 'Create a demand test' }]} />

      <header className="mt-3 rounded-card bg-white p-4 shadow-card sm:p-6">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Create a demand test</h1>
        <p className="mt-1 max-w-3xl text-slate-700">Show shoppers what you&apos;re thinking of making and learn what they want before you commit to production.</p>
      </header>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <form id="demand-form" onSubmit={onSubmit} noValidate aria-label="Demand test" className="space-y-4 lg:col-start-1 lg:row-start-1">
          <Section title="The product">
            <div data-field="title">
              <Field id="f-title" label="Product title" error={shown('title')}>
                {(aria) => <input {...aria} className={inputBox(!!shown('title'))} value={form.title} onChange={(e) => update({ title: e.target.value }, 'title')} onBlur={() => touch('title')} placeholder="Smart Travel Backpack" maxLength={LIMITS.title[1]} autoComplete="off" />}
              </Field>
            </div>
            <div data-field="tagline">
              <Field id="f-tagline" label="Tagline" error={shown('tagline')}>
                {(aria) => (
                  <input {...aria} className={inputBox(!!shown('tagline'))} value={form.tagline} onChange={(e) => update({ tagline: e.target.value }, 'tagline')} onBlur={() => touch('tagline')} placeholder="A smarter carry-on built for modern travelers" maxLength={LIMITS.tagline[1]} autoComplete="off" />
                )}
              </Field>
            </div>
            <div data-field="description">
              <Field id="f-description" label="Description" hint="What is it, who is it for, and what makes it different?" error={shown('description')}>
                {(aria) => (
                  <textarea {...aria} className={`${control} ${shown('description') ? bad : ok} min-h-32 py-2.5`} rows={5} value={form.description} onChange={(e) => update({ description: e.target.value }, 'description')} onBlur={() => touch('description')} maxLength={LIMITS.description[1]} />
                )}
              </Field>
            </div>
            <div data-field="categoryId">
              <Field id="f-categoryId" label="Category" error={shown('categoryId') ?? (categoriesError ? 'We couldn’t load the categories. Reload the page to try again.' : undefined)}>
                {(aria) => (
                  <select {...aria} className={inputBox(!!shown('categoryId'))} value={form.categoryId} onChange={(e) => update({ categoryId: e.target.value }, 'categoryId')} onBlur={() => touch('categoryId')} disabled={categoriesLoading}>
                    <option value="">{categoriesLoading ? 'Loading categories…' : 'Choose a category'}</option>
                    {categories?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
          </Section>

          <Section title="Photos">
            <fieldset data-field="images">
              <legend className="text-sm font-semibold text-slate-900">
                Image links <span className="font-normal text-slate-500">(optional)</span>
              </legend>
              <p className="mt-0.5 text-sm text-slate-600">Paste links to photos or renders. The first one is the cover. Uploads aren&apos;t supported.</p>
              <ul className="mt-2 space-y-2">
                {form.images.map((row, i) => (
                  <li key={row.key} className="flex gap-2">
                    <input
                      {...describe(i === 0 ? 'f-images' : `f-images-${row.key}`, 'f-images-error', shown('images'))}
                      aria-label={`Image link ${i + 1}`}
                      type="url"
                      inputMode="url"
                      className={inputBox(!!shown('images'))}
                      value={row.value}
                      onChange={(e) => setRow('images', row.key, e.target.value)}
                      onBlur={() => touch('images')}
                      placeholder="https://…"
                      autoComplete="off"
                    />
                    <button type="button" onClick={() => removeRow('images', row.key)} aria-label={`Remove image link ${i + 1}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50">
                      <XIcon width={18} height={18} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="min-h-6">
                {shown('images') && (
                  <p id="f-images-error" data-testid="f-images-error" className="mt-1 text-sm font-medium text-red-700">
                    {shown('images')}
                  </p>
                )}
              </div>
              <Button type="button" variant="ghost" onClick={() => addRow('images')} disabled={form.images.length >= LIMITS.maxImages} className="mt-2 min-h-11">
                Add image link
              </Button>
              {form.images.length >= LIMITS.maxImages && <span className="ml-3 text-sm text-slate-500">Up to {LIMITS.maxImages} images.</span>}
            </fieldset>
          </Section>

          <Section title="Features">
            <fieldset data-field="features">
              <legend className="text-sm font-semibold text-slate-900">Proposed features</legend>
              <p className="mt-0.5 text-sm text-slate-600">
                List {LIMITS.minFeatures}–{LIMITS.maxFeatures} features. Shoppers choose the one that matters most to them.
              </p>
              <ul className="mt-2 space-y-2">
                {form.features.map((row, i) => (
                  <li key={row.key} className="flex gap-2">
                    <input
                      {...describe(i === 0 ? 'f-features' : `f-features-${row.key}`, 'f-features-error', shown('features'))}
                      aria-label={`Feature ${i + 1}`}
                      className={inputBox(!!shown('features') && (!row.value.trim() || row.value.trim().length < LIMITS.feature[0]))}
                      value={row.value}
                      onChange={(e) => setRow('features', row.key, e.target.value)}
                      onBlur={() => touch('features')}
                      placeholder={['USB-C charging', 'Waterproof', 'Anti-theft design'][i] ?? 'Another feature'}
                      maxLength={LIMITS.feature[1]}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => removeRow('features', row.key)}
                      disabled={form.features.length <= LIMITS.minFeatures}
                      aria-label={`Remove feature ${i + 1}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <XIcon width={18} height={18} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="min-h-6">
                {shown('features') && (
                  <p id="f-features-error" data-testid="f-features-error" className="mt-1 text-sm font-medium text-red-700">
                    {shown('features')}
                  </p>
                )}
              </div>
              <Button type="button" variant="ghost" onClick={() => addRow('features')} disabled={form.features.length >= LIMITS.maxFeatures} className="mt-2 min-h-11">
                Add feature
              </Button>
              {form.features.length >= LIMITS.maxFeatures && <span className="ml-3 text-sm text-slate-500">Up to {LIMITS.maxFeatures} features.</span>}
            </fieldset>
          </Section>

          <Section title="Price and timing">
            <fieldset>
              <legend className="text-sm font-semibold text-slate-900">Proposed price range</legend>
              <p className="mt-0.5 text-sm text-slate-600">Shoppers are asked which price in this range feels reasonable.</p>
              <div className="mt-2 grid gap-4 sm:grid-cols-2">
                <div data-field="priceMin">
                  <Field id="f-priceMin" label="Minimum price" error={shown('priceMin')}>
                    {(aria) => <MoneyInput aria={aria} value={form.priceMin} onChange={(v) => update({ priceMin: v }, 'priceMin')} onBlur={() => touch('priceMin')} invalid={!!shown('priceMin')} />}
                  </Field>
                </div>
                <div data-field="priceMax">
                  <Field id="f-priceMax" label="Maximum price" error={shown('priceMax')}>
                    {(aria) => <MoneyInput aria={aria} value={form.priceMax} onChange={(v) => update({ priceMax: v }, 'priceMax')} onBlur={() => touch('priceMax')} invalid={!!shown('priceMax')} />}
                  </Field>
                </div>
              </div>
            </fieldset>
            <div data-field="expectedLaunch" className="max-w-xs">
              <Field id="f-expectedLaunch" label="Expected launch" hint="The month you hope to start selling, if the idea works." error={shown('expectedLaunch')}>
                {(aria) => (
                  <input {...aria} type="month" min={launchMin} max={launchMax} className={inputBox(!!shown('expectedLaunch'))} value={form.expectedLaunch} onChange={(e) => update({ expectedLaunch: e.target.value }, 'expectedLaunch')} onBlur={() => touch('expectedLaunch')} />
                )}
              </Field>
            </div>
          </Section>
        </form>

        <aside aria-label="Preview" className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-4 lg:self-start">
          <ValidationPreview form={form} sellerName={user?.seller?.name ?? 'Your store'} categoryName={categoryName} />
        </aside>

        <div className="space-y-3 lg:col-start-1 lg:row-start-2">
          {(general.length > 0 || (submitted && invalidKeys.length > 0)) && (
            <div ref={summaryRef} tabIndex={-1} role="alert" data-testid="form-summary" className="rounded-md bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200 outline-none">
              {general.length > 0 ? (
                <ul className="space-y-1">
                  {general.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              ) : (
                <p>
                  {invalidKeys.length === 1 ? 'One thing needs your attention' : `${invalidKeys.length} things need your attention`} before this test can go live.
                </p>
              )}
            </div>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
            <ButtonLink to="/seller" variant="ghost" className="min-h-11 sm:px-6">
              Cancel
            </ButtonLink>
            {/* Keep focus where it is on mouse-down: otherwise the field you just left shows its error, the page shifts, and the click is lost. */}
            <Button type="submit" form="demand-form" disabled={submitting} onMouseDown={(e) => e.preventDefault()} className="min-h-11 sm:px-8">
              {submitting ? 'Creating your test…' : 'Create demand test'}
            </Button>
          </div>
          <p className="text-sm text-slate-600">Your test goes live in Coming soon straight away. You can close it any time; its content can&apos;t be edited afterwards.</p>
        </div>
      </div>
    </Container>
  );
}

