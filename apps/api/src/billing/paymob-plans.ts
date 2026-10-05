/**
 * Creates (or updates) the Personal, Pro and Business subscription plans at
 * Paymob from the prices in the environment, and prints their ids for
 * PAYMOB_PLAN_PERSONAL, PAYMOB_PLAN_PRO and PAYMOB_PLAN_BUSINESS. Run after
 * changing a price:
 *
 *   pnpm --filter @vertex/api paymob:plans
 *
 * Needs PAYMOB_API_KEY, PAYMOB_MOTO_INTEGRATION_ID (renewals are charged
 * through it), API_PUBLIC_URL (for Paymob's callbacks) and the prices.
 */
import { PaymobClient } from './paymob.client';
import { PAID_PLANS } from '@vertex/shared';
import { planItemName, planPrices, toCents } from './prices';

async function main() {
  const env = process.env;
  const need = (k: string) => {
    const v = env[k]?.trim();
    if (!v) throw new Error(`${k} is not set`);
    return v;
  };
  const moto = Number(need('PAYMOB_MOTO_INTEGRATION_ID'));
  const webhookUrl = `${need('API_PUBLIC_URL').replace(/\/$/, '')}/api/billing/paymob/webhook`;
  const client = new PaymobClient({
    baseUrl: (env.PAYMOB_BASE_URL ?? 'https://accept.paymob.com').replace(/\/$/, ''),
    apiKey: need('PAYMOB_API_KEY'),
    secretKey: env.PAYMOB_SECRET_KEY ?? '',
    publicKey: env.PAYMOB_PUBLIC_KEY ?? '',
    cardIntegrationId: 0,
  });
  const prices = planPrices((k) => env[k]);

  for (const plan of PAID_PLANS) {
    const price = prices[plan];
    if (!price) {
      console.log(`${plan}: no PRICE_${plan}_EGP set, skipped`);
      continue;
    }
    const existing = env[`PAYMOB_PLAN_${plan}`]?.trim();
    if (existing) {
      await client.updatePlan(Number(existing), { amountCents: toCents(price), motoIntegrationId: moto });
      console.log(`${plan}: plan ${existing} now charges ${price} EGP a month`);
    } else {
      const created = await client.createPlan({ name: planItemName(plan), amountCents: toCents(price), motoIntegrationId: moto, webhookUrl });
      console.log(`${plan}: created plan ${created.id} at ${price} EGP a month. Set PAYMOB_PLAN_${plan}=${created.id}`);
    }
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
