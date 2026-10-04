import { z } from 'zod';

/** Environment variable schema — validated at startup; the app fails fast if any are missing. */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),

  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  // Local-dev TLS (optional). Set both to serve the API over https — needed
  // when the web app runs over https, since a page cannot call an http API.
  // Production terminates TLS at the proxy and leaves these unset.
  HTTPS_KEY_FILE: z.string().optional(),
  HTTPS_CERT_FILE: z.string().optional(),

  // Proxies in front of the API: a count ("1") or their addresses. Unset when
  // the API is reached directly. See config/trust-proxy.ts.
  TRUST_PROXY: z
    .string()
    .optional()
    .refine((v) => !v || !/^(true|false)$/i.test(v.trim()), 'Give the number of proxies (e.g. 1) or their addresses, not true/false'),

  // Public web origin used to build card page / vCard URLs in NFC redirects.
  APP_PUBLIC_URL: z.string().url().default('http://localhost:3000'),

  // Image storage (S3, Cloudflare R2, …). Required in production: without it
  // uploads go to the container's disk and are lost on redeploy.
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),

  // Telegram's Bot API; only changed to point tests at a stand-in.
  TELEGRAM_API_URL: z.string().url().optional(),

  // The time zone meeting hours are in for cards whose owner has not chosen one.
  DEFAULT_TIMEZONE: z.string().default('Africa/Cairo'),

  // Billing with Paymob (optional — billing is off until the keys and the
  // card integration are set). Keys are in the Paymob dashboard under
  // Settings → API Keys; plans are made with `pnpm --filter @vertex/api paymob:plans`.
  PAYMOB_BASE_URL: z.string().url().optional(),
  PAYMOB_API_KEY: z.string().optional(),
  PAYMOB_SECRET_KEY: z.string().optional(),
  PAYMOB_PUBLIC_KEY: z.string().optional(),
  PAYMOB_CARD_INTEGRATION_ID: z.string().optional(),
  PAYMOB_MOTO_INTEGRATION_ID: z.string().optional(),
  PAYMOB_PLAN_PRO: z.string().optional(),
  PAYMOB_PLAN_BUSINESS: z.string().optional(),
  // Monthly prices in Egyptian pounds; a plan without one is not sold.
  PRICE_PRO_EGP: z.string().optional(),
  PRICE_BUSINESS_EGP: z.string().optional(),
  // This API's own public address, for Paymob's callbacks (defaults to the
  // address a request came in on).
  API_PUBLIC_URL: z.string().url().optional(),

  // Email (optional — emails are logged to the console when RESEND_API_KEY is unset).
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // Sign in with Google (optional — the button shows only when set). The
  // OAuth client id of a "Web application" client in Google Cloud.
  GOOGLE_CLIENT_ID: z.string().optional(),

  // Reading paper business cards with Claude (optional). Without it, cards
  // are still read on the phone itself (QR code and Tesseract); with it, the
  // server reads them more accurately. The model defaults to Claude Haiku.
  ANTHROPIC_API_KEY: z.string().optional(),
  LEAD_SCAN_MODEL: z.string().optional(),

  // WhatsApp lead alerts (optional — offered only when the token and phone
  // number id are set). WhatsApp Business Cloud API, with an approved template.
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_LEAD_TEMPLATE: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().regex(/^v\d+\.\d+$/, 'Like v21.0').optional(),

  // Integration credential encryption (optional — when unset, integrations that
  // need stored credentials are disabled and shown as unavailable, never faked).
  // Must be 32 bytes, base64-encoded (openssl rand -base64 32).
  INTEGRATION_ENCRYPTION_KEY: z.string().optional(),
  // Web Push (notifications on a device's lock screen); off when unset.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),

  // Apple Wallet (optional — the card offers "Add to Apple Wallet" only when
  // all five are set). From a Pass Type ID in an Apple Developer account; the
  // PEM values may be given as PEM text or base64 of it.
  APPLE_PASS_TYPE_ID: z.string().optional(),
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_PASS_CERT: z.string().optional(),
  APPLE_PASS_KEY: z.string().optional(),
  APPLE_PASS_KEY_PASSPHRASE: z.string().optional(),
  APPLE_WWDR_CERT: z.string().optional(),

  // Google Wallet (optional — "Save to Google Wallet" only when both are set).
  // The issuer id from the Google Pay & Wallet Console, and the JSON key of a
  // service account with access to it (raw JSON or base64).
  GOOGLE_WALLET_ISSUER_ID: z.string().optional(),
  GOOGLE_WALLET_SERVICE_ACCOUNT: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${issues}`);
  }
  return parsed.data;
}
