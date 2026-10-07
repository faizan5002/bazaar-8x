import type { ShippingAddress } from '../types';

export interface AddressForm {
  fullName: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
}

export type AddressErrors = Partial<Record<keyof AddressForm, string>>;

export const emptyAddress = (fullName = ''): AddressForm => ({ fullName, line1: '', line2: '', city: '', state: '', postalCode: '', country: 'United States', phone: '' });

/** In the order the fields appear, so the first error is the first thing to fix. */
export const FIELD_ORDER: (keyof AddressForm)[] = ['fullName', 'line1', 'line2', 'city', 'state', 'postalCode', 'country', 'phone'];

const PHONE = /^[0-9+()\-.\s]{7,20}$/;

/** Mirrors the API's rules (so the shopper hears about problems before a round trip). The server re-checks everything. */
export function validateAddress(form: AddressForm): AddressErrors {
  const v = (k: keyof AddressForm) => form[k].trim();
  const errors: AddressErrors = {};
  if (v('fullName').length < 2) errors.fullName = 'Enter your full name.';
  if (v('line1').length < 3) errors.line1 = 'Enter your street address.';
  if (!v('city')) errors.city = 'Enter your city.';
  if (!v('state')) errors.state = 'Enter your state or province.';
  if (v('postalCode').length < 3 || v('postalCode').length > 12) errors.postalCode = 'Enter a valid postal code.';
  if (v('country').length < 2) errors.country = 'Enter your country.';
  if (!PHONE.test(v('phone'))) errors.phone = 'Enter a phone number (7–20 digits, spaces, + ( ) - .).';
  return errors;
}

export function toShippingAddress(form: AddressForm): ShippingAddress {
  const t = (k: keyof AddressForm) => form[k].trim();
  return {
    fullName: t('fullName'),
    line1: t('line1'),
    ...(t('line2') ? { line2: t('line2') } : {}),
    city: t('city'),
    state: t('state'),
    postalCode: t('postalCode'),
    country: t('country'),
    phone: t('phone'),
  };
}

// The address (never payment details) is remembered for the tab session so a refresh doesn't wipe what was typed.
const DRAFT_KEY = 'bazaar.checkout.address';

export function loadDraft(): AddressForm | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? { ...emptyAddress(), ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

export function saveDraft(form: AddressForm) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  } catch {
    /* storage unavailable (private mode): the form still works, it just won't survive a refresh */
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nothing to clear */
  }
}
