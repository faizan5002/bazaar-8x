import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Totals } from '../components/cart/Totals';
import { variantText } from '../components/cart/CartItemRow';
import { Button, ButtonLink } from '../components/ui/Button';
import { Container } from '../components/ui/Container';
import { CartIcon } from '../components/ui/icons';
import { SafeImage } from '../components/ui/SafeImage';
import { ErrorState } from '../components/ui/StateMessage';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { ApiError, api } from '../lib/api';
import { FIELD_ORDER, clearDraft, emptyAddress, loadDraft, saveDraft, toShippingAddress, validateAddress, type AddressErrors, type AddressForm } from '../lib/checkout';
import { formatDateOnly, formatPrice, formatShipping } from '../lib/format';
import { sizedImage } from '../lib/images';
import type { DeliveryOptionId, PaymentMethodId } from '../types';

const PAYMENT_OPTIONS: { id: PaymentMethodId; label: string; hint: string }[] = [
  { id: 'card', label: 'Credit / Debit Card (mock)', hint: 'Demo only: no card details are asked for and nothing is charged.' },
  { id: 'cod', label: 'Cash on Delivery', hint: 'Pay when your order arrives.' },
];

const inputClass = 'mt-1 h-11 w-full rounded-md border bg-white px-3 text-base text-slate-900 focus:outline-none focus:ring-2';

interface FieldProps {
  name: keyof AddressForm;
  label: string;
  value: string;
  error?: string;
  optional?: boolean;
  autoComplete?: string;
  type?: string;
  inputMode?: 'tel' | 'text';
  className?: string;
  onChange: (value: string) => void;
}

/** A labelled input with its error wired up for screen readers (aria-invalid + aria-describedby). */
function Field({ name, label, value, error, optional, autoComplete, type = 'text', inputMode, className = '', onChange }: FieldProps) {
  const uid = useId();
  const errorId = `${uid}-error`;
  return (
    <div className={className}>
      <label htmlFor={`field-${name}`} className="text-sm font-medium text-slate-800">
        {label}
        {optional && <span className="font-normal text-slate-500"> (optional)</span>}
      </label>
      <input
        id={`field-${name}`}
        name={name}
        type={type}
        inputMode={inputMode}
        value={value}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} ${error ? 'border-deal focus:border-deal focus:ring-red-200' : 'border-slate-300 focus:border-accent-500 focus:ring-accent-400/40'}`}
      />
      {error && (
        <p id={errorId} className="mt-1 text-sm text-deal">
          {error}
        </p>
      )}
    </div>
  );
}

function Section({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`step-${step}`} className="rounded-card bg-white p-4 shadow-card sm:p-6">
      <h2 id={`step-${step}`} className="mb-4 flex items-center gap-3 text-lg font-bold text-slate-900">
        <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-900 text-sm text-white">
          {step}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

const choice = 'flex cursor-pointer items-start gap-3 rounded-md border border-slate-300 p-3.5 transition has-[input:checked]:border-accent-500 has-[input:checked]:bg-amber-50 has-[input:checked]:ring-2 has-[input:checked]:ring-accent-400 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent-500';

/** Shipping address, delivery speed, mock payment, and a summary with the Place order button. */
export function CheckoutPage() {
  const { user } = useAuth();
  const { cart, loading, error, reload } = useCart();
  const navigate = useNavigate();

  const [form, setForm] = useState<AddressForm>(() => loadDraft() ?? emptyAddress(user?.name));
  const [errors, setErrors] = useState<AddressErrors>({});
  const [delivery, setDelivery] = useState<DeliveryOptionId>('standard');
  const [payment, setPayment] = useState<PaymentMethodId>('card');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => saveDraft(form), [form]);

  const setField = (name: keyof AddressForm) => (value: string) => {
    setForm((f) => ({ ...f, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!cart || submitting) return;
    setFailure(null);

    const found = validateAddress(form);
    setErrors(found);
    const firstBad = FIELD_ORDER.find((k) => found[k]);
    if (firstBad) {
      document.getElementById(`field-${firstBad}`)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const order = await api.orders.create({ shippingAddress: toShippingAddress(form), deliveryOption: delivery, paymentMethod: payment });
      clearDraft();
      reload(); // the server emptied the cart: refresh the header badge
      navigate(`/orders/${order.orderNumber}/confirmation`, { replace: true });
    } catch (err) {
      // No success is ever shown here: the order was not placed. Refresh the cart, since stock may be why.
      setFailure(err instanceof ApiError ? err.message : "We couldn't reach the store, so your order was NOT placed and nothing was charged. Please try again.");
      reload();
      setSubmitting(false);
    }
  };

  const emptyState = (
    <div className="flex flex-col items-center rounded-card bg-white px-4 py-16 text-center shadow-card">
      <CartIcon width={44} height={44} className="text-slate-400" />
      <h2 className="mt-4 text-2xl font-bold text-slate-900">Your cart is empty</h2>
      <p className="mt-2 max-w-md text-slate-600">There is nothing to check out yet.</p>
      <ButtonLink to="/search" className="mt-6">
        Continue shopping
      </ButtonLink>
    </div>
  );

  let body;
  if (loading) {
    body = (
      <div aria-busy="true" aria-label="Loading checkout" className="grid animate-pulse gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="h-96 rounded-card bg-white shadow-card" />
        <div className="h-72 rounded-card bg-white shadow-card" />
      </div>
    );
  } else if (error || !cart) {
    body = <ErrorState message="We couldn't load your cart. Check your connection and try again." onRetry={reload} />;
  } else if (cart.items.length === 0) {
    body = emptyState;
  } else {
    const chosen = cart.deliveryOptions.find((o) => o.id === delivery) ?? cart.deliveryOptions[0];
    const errorCount = Object.values(errors).filter(Boolean).length;
    body = (
      <form onSubmit={onSubmit} noValidate className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          {failure && (
            <p role="alert" className="rounded-md bg-red-50 p-4 text-sm font-medium text-red-800 ring-1 ring-red-200">
              {failure}
            </p>
          )}
          {!cart.canCheckout && (
            <p role="alert" className="rounded-md bg-amber-50 p-4 text-sm text-slate-800 ring-1 ring-amber-200">
              Some items in your cart need attention before you can order.{' '}
              <Link to="/cart" className="font-semibold text-link hover:underline">
                Review your cart
              </Link>
            </p>
          )}
          {errorCount > 0 && (
            <p role="alert" className="rounded-md bg-red-50 p-4 text-sm font-medium text-red-800 ring-1 ring-red-200">
              Please fix the {errorCount} highlighted {errorCount === 1 ? 'field' : 'fields'} below.
            </p>
          )}

          <Section step={1} title="Shipping address">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="fullName" label="Full name" value={form.fullName} error={errors.fullName} autoComplete="name" onChange={setField('fullName')} className="sm:col-span-2" />
              <Field name="line1" label="Street address" value={form.line1} error={errors.line1} autoComplete="address-line1" onChange={setField('line1')} className="sm:col-span-2" />
              <Field name="line2" label="Apartment, suite, etc." optional value={form.line2} error={errors.line2} autoComplete="address-line2" onChange={setField('line2')} className="sm:col-span-2" />
              <Field name="city" label="City" value={form.city} error={errors.city} autoComplete="address-level2" onChange={setField('city')} />
              <Field name="state" label="State / Province" value={form.state} error={errors.state} autoComplete="address-level1" onChange={setField('state')} />
              <Field name="postalCode" label="Postal code" value={form.postalCode} error={errors.postalCode} autoComplete="postal-code" onChange={setField('postalCode')} />
              <Field name="country" label="Country" value={form.country} error={errors.country} autoComplete="country-name" onChange={setField('country')} />
              <Field name="phone" label="Phone" type="tel" inputMode="tel" value={form.phone} error={errors.phone} autoComplete="tel" onChange={setField('phone')} className="sm:col-span-2" />
            </div>
          </Section>

          <Section step={2} title="Delivery option">
            <div role="radiogroup" aria-label="Delivery option" className="space-y-3">
              {cart.deliveryOptions.map((o) => (
                <label key={o.id} className={choice}>
                  <input type="radio" name="delivery" value={o.id} checked={delivery === o.id} onChange={() => setDelivery(o.id)} className="mt-1 h-4 w-4 accent-accent-600" />
                  <span className="flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <span className="font-semibold text-slate-900">{o.label}</span>
                      <span className={`font-semibold ${o.cost === 0 ? 'text-success' : 'text-slate-900'}`}>{formatShipping(o.cost)}</span>
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-700">Estimated arrival {formatDateOnly(o.estimatedDelivery)}</span>
                    <span className="block text-xs text-slate-500">{o.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </Section>

          <Section step={3} title="Payment method">
            <div role="radiogroup" aria-label="Payment method" className="space-y-3">
              {PAYMENT_OPTIONS.map((o) => (
                <label key={o.id} className={choice}>
                  <input type="radio" name="payment" value={o.id} checked={payment === o.id} onChange={() => setPayment(o.id)} className="mt-1 h-4 w-4 accent-accent-600" />
                  <span>
                    <span className="block font-semibold text-slate-900">{o.label}</span>
                    <span className="block text-sm text-slate-600">{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">This is a demo store. No real payment is taken for any order.</p>
          </Section>
        </div>

        <aside aria-label="Order summary" className="rounded-card bg-white p-5 shadow-card lg:sticky lg:top-4">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Order summary</h2>
          <ul className="max-h-80 divide-y divide-line overflow-y-auto pr-1">
            {cart.items.map((line) => (
              <li key={line.id} data-testid="summary-item" className="flex gap-3 py-3 first:pt-0">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-slate-100">
                  <SafeImage src={sizedImage(line.image ?? undefined, 120)} alt="" width={56} height={56} className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="line-clamp-2 font-medium leading-snug text-slate-900">{line.title}</p>
                  {Object.keys(line.selectedVariants).length > 0 && <p className="text-xs text-slate-500">{variantText(line.selectedVariants)}</p>}
                  <p className="text-slate-600">
                    {line.quantity} × {formatPrice(line.unitPrice)}
                  </p>
                </div>
                <p className="text-sm font-semibold text-slate-900">{formatPrice(line.lineTotal)}</p>
              </li>
            ))}
          </ul>

          <div className="mt-4 border-t border-line pt-4">
            <Totals itemCount={cart.itemCount} subtotal={cart.subtotal} shipping={chosen.cost} tax={cart.tax} total={chosen.total} />
          </div>
          <p className="mt-3 text-sm text-slate-700">
            <span className="font-semibold">{chosen.label}:</span> estimated arrival <span data-testid="summary-eta">{formatDateOnly(chosen.estimatedDelivery)}</span>
          </p>

          <Button type="submit" fullWidth disabled={submitting || !cart.canCheckout} className="mt-5 py-3 text-base">
            {submitting ? 'Placing your order…' : 'Place your order'}
          </Button>
          <p className="mt-3 text-center text-xs text-slate-500">
            <Link to="/cart" className="text-link hover:underline">
              Back to cart
            </Link>
          </p>
        </aside>
      </form>
    );
  }

  return (
    <Container className="py-4 lg:py-6">
      <h1 className="mb-4 text-2xl font-bold text-slate-900 sm:text-3xl">Checkout</h1>
      {body}
    </Container>
  );
}
