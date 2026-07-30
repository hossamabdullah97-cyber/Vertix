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

  // Public web origin used to build card page / vCard URLs in NFC redirects.
  APP_PUBLIC_URL: z.string().url().default('http://localhost:3000'),

  // Stripe billing (optional — billing is disabled when STRIPE_SECRET_KEY is unset).
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_BUSINESS: z.string().optional(),

  // Email (optional — emails are logged to the console when RESEND_API_KEY is unset).
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // Integration credential encryption (optional — when unset, integrations that
  // need stored credentials are disabled and shown as unavailable, never faked).
  // Must be 32 bytes, base64-encoded (openssl rand -base64 32).
  INTEGRATION_ENCRYPTION_KEY: z.string().optional(),
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
