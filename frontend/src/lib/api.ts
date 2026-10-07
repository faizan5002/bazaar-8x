import type { AuthResponse, CartView, Category, CreateOrderInput, CreateSellerInput, CreateValidationInput, MyResponse, OrderView, Paginated, Product, ProductQuery, RespondInput, RespondResult, Review, SellerSummary, SellerValidationItem, ValidationCard, ValidationDetail, ValidationQuery, ValidationResults } from '../types';

const TOKEN_KEY = 'bazaar.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Nest validation errors list one message per problem; kept apart so forms can show each next to its field. */
    public messages: string[] = [message],
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    // Nest validation errors return message as string[]
    const messages: string[] = Array.isArray(body?.message) ? body.message : [body?.message ?? res.statusText];
    throw new ApiError(res.status, messages.join(', '), messages);
  }
  return res.json() as Promise<T>;
}

function toQueryString(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '' && value !== null) params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export const api = {
  categories: () => request<Category[]>('/categories'),
  products: (query: ProductQuery = {}) => request<Paginated<Product>>(`/products${toQueryString(query)}`),
  product: (id: number) => request<Product>(`/products/${id}`),
  relatedProducts: (id: number) => request<Product[]>(`/products/${id}/related`),
  productReviews: (id: number, query: { page?: number; limit?: number } = {}) => request<Paginated<Review>>(`/products/${id}/reviews${toQueryString(query)}`),
  validations: (query: ValidationQuery = {}) => request<Paginated<ValidationCard>>(`/validations${toQueryString(query)}`),
  validation: (id: number) => request<ValidationDetail>(`/validations/${id}`),
  /** Sign-in required. `{ response: null }` when the shopper hasn't answered yet. */
  myValidationResponse: (id: number) => request<{ response: MyResponse | null }>(`/validations/${id}/response`),
  respondToValidation: (id: number, body: RespondInput) => request<RespondResult>(`/validations/${id}/response`, { method: 'PUT', body: JSON.stringify(body) }),
  /** Open a store for the signed-in user (one each). */
  createSeller: (body: CreateSellerInput) => request<SellerSummary & { description: string | null }>('/sellers', { method: 'POST', body: JSON.stringify(body) }),
  seller: {
    validations: () => request<{ items: SellerValidationItem[] }>('/seller/validations'),
    createValidation: (body: CreateValidationInput) => request<ValidationDetail>('/seller/validations', { method: 'POST', body: JSON.stringify(body) }),
    results: (id: number) => request<ValidationResults>(`/seller/validations/${id}/results`),
    setStatus: (id: number, status: 'open' | 'closed') => request<ValidationDetail>(`/seller/validations/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  },
  cart: {
    get: () => request<CartView>('/cart'),
    add: (body: { productId: number; quantity: number; selectedVariants?: Record<string, string> }) => request<CartView>('/cart/items', { method: 'POST', body: JSON.stringify(body) }),
    update: (itemId: number, quantity: number) => request<CartView>(`/cart/items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ quantity }) }),
    remove: (itemId: number) => request<CartView>(`/cart/items/${itemId}`, { method: 'DELETE' }),
  },
  orders: {
    create: (body: CreateOrderInput) => request<OrderView>('/orders', { method: 'POST', body: JSON.stringify(body) }),
    get: (orderNumber: string) => request<OrderView>(`/orders/${encodeURIComponent(orderNumber)}`),
  },
  auth: {
    register: (body: { name: string; email: string; password: string }) =>
      request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
    login: (body: { email: string; password: string }) =>
      request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    me: () => request<AuthResponse['user']>('/auth/me'),
  },
};
