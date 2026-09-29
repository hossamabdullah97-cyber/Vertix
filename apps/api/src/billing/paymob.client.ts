/**
 * The small part of Paymob's API that billing uses, with fetch. Two kinds of
 * credentials: the secret key (Intention API, "Token <secret>") and the API
 * key, exchanged for an hour-long bearer token (subscriptions and lookups).
 * See https://developers.paymob.com and PaymobAccept/API-Postman-Collections.
 */

export interface PaymobConfig {
  baseUrl: string;
  apiKey: string;
  secretKey: string;
  publicKey: string;
  /** The online card (3DS) integration the first payment goes through. */
  cardIntegrationId: number;
}

export interface PaymobSubscription {
  id: number;
  plan_id: number;
  /** "active", "suspended", "canceled" (sometimes spelt "cancelled"). */
  state: string;
  amount_cents?: number;
  next_billing?: string | null;
  ends_at?: string | null;
  initial_transaction?: number | null;
}

export interface PaymobTransaction {
  id: number;
  success: boolean;
  pending: boolean;
  amount_cents: number;
  currency?: string;
  order?: { id?: number; merchant_order_id?: string | null } | null;
  source_data?: { pan?: string; sub_type?: string; type?: string } | null;
}

export class PaymobError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

export class PaymobClient {
  private token: { value: string; until: number } | null = null;

  constructor(
    readonly config: PaymobConfig,
    private readonly http: Fetch = fetch,
  ) {}

  private async request<T>(path: string, init: RequestInit & { auth: 'secret' | 'bearer' }): Promise<T> {
    const authorization = init.auth === 'secret' ? `Token ${this.config.secretKey}` : `Bearer ${await this.bearer()}`;
    const res = await this.http(`${this.config.baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: authorization, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) throw new PaymobError(`Paymob ${init.method ?? 'GET'} ${path} failed (${res.status}): ${text.slice(0, 300)}`, res.status);
    return (text ? JSON.parse(text) : null) as T;
  }

  /** A bearer token for the account APIs; Paymob's last an hour, reused for 50 minutes. */
  private async bearer(): Promise<string> {
    if (this.token && this.token.until > Date.now()) return this.token.value;
    const res = await this.http(`${this.config.baseUrl}/api/auth/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: this.config.apiKey }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new PaymobError(`Paymob sign-in failed (${res.status})`, res.status);
    const { token } = (await res.json()) as { token: string };
    this.token = { value: token, until: Date.now() + 50 * 60_000 };
    return token;
  }

  /**
   * Starts a subscription: a payment intention tied to a subscription plan.
   * The customer pays on Paymob's checkout page (`checkoutUrl`), which saves
   * the card for the renewals.
   */
  async createSubscriptionIntention(input: {
    planId: number;
    amountCents: number;
    reference: string;
    itemName: string;
    customer: { firstName: string; lastName: string; email: string; phone: string };
    notificationUrl: string;
    redirectionUrl: string;
    extras?: Record<string, unknown>;
  }): Promise<{ clientSecret: string; checkoutUrl: string }> {
    const res = await this.request<{ client_secret: string }>('/v1/intention/', {
      method: 'POST',
      auth: 'secret',
      body: JSON.stringify({
        amount: input.amountCents,
        currency: 'EGP',
        payment_methods: [this.config.cardIntegrationId],
        subscription_plan_id: input.planId,
        items: [{ name: input.itemName, amount: input.amountCents, description: input.itemName, quantity: 1 }],
        billing_data: {
          first_name: input.customer.firstName,
          last_name: input.customer.lastName,
          email: input.customer.email,
          phone_number: input.customer.phone,
          apartment: 'NA',
          floor: 'NA',
          street: 'NA',
          building: 'NA',
          city: 'NA',
          state: 'NA',
          country: 'EG',
        },
        special_reference: input.reference,
        extras: input.extras ?? {},
        notification_url: input.notificationUrl,
        redirection_url: input.redirectionUrl,
      }),
    });
    const q = new URLSearchParams({ publicKey: this.config.publicKey, clientSecret: res.client_secret });
    return { clientSecret: res.client_secret, checkoutUrl: `${this.config.baseUrl}/unifiedcheckout/?${q}` };
  }

  getTransaction(id: number): Promise<PaymobTransaction> {
    return this.request(`/api/acceptance/transactions/${id}`, { method: 'GET', auth: 'bearer' });
  }

  getSubscription(id: number): Promise<PaymobSubscription> {
    return this.request(`/api/acceptance/subscriptions/${id}`, { method: 'GET', auth: 'bearer' });
  }

  /** The subscription a payment belongs to (its first payment or a renewal), if any. */
  async subscriptionOfTransaction(transactionId: number): Promise<PaymobSubscription | null> {
    const res = await this.request<PaymobSubscription[] | { results?: PaymobSubscription[] }>(
      `/api/acceptance/subscriptions?transaction=${transactionId}`,
      { method: 'GET', auth: 'bearer' },
    );
    const list = Array.isArray(res) ? res : res?.results ?? [];
    return list[0] ?? null;
  }

  cancelSubscription(id: number): Promise<PaymobSubscription> {
    return this.request(`/api/acceptance/subscriptions/${id}/cancel`, { method: 'POST', auth: 'bearer' });
  }

  createPlan(input: { name: string; amountCents: number; motoIntegrationId: number; webhookUrl: string }): Promise<{ id: number }> {
    return this.request('/api/acceptance/subscription-plans', {
      method: 'POST',
      auth: 'bearer',
      body: JSON.stringify({
        frequency: 30,
        name: input.name,
        reminder_days: 3,
        retrial_days: 3,
        plan_type: 'rent',
        number_of_deductions: null,
        amount_cents: input.amountCents,
        // The first payment is the first month.
        use_transaction_amount: true,
        is_active: true,
        integration: input.motoIntegrationId,
        webhook_url: input.webhookUrl,
      }),
    });
  }

  updatePlan(id: number, input: { amountCents: number; motoIntegrationId: number }): Promise<unknown> {
    return this.request(`/api/acceptance/subscription-plans/${id}`, {
      method: 'PUT',
      auth: 'bearer',
      body: JSON.stringify({ amount_cents: input.amountCents, integration: input.motoIntegrationId, number_of_deductions: null }),
    });
  }
}
