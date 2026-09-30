import Link from 'next/link';
import { getT, serverLocale } from '@/lib/i18n/server';
import { PLAN_LIMITS, type Plan } from '@vertex/shared';
import { formatCurrency } from '@/lib/format';
import { SALES_MAILTO } from '@/lib/contact';
import { Icon } from '@/components/Icon';
import { REGISTER, SectionHead, WRAP } from './shared';

const PLANS: Plan[] = ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE'];

/**
 * The same plans, prices and limits the Billing page sells, in the same
 * words. Prices are the server's settings, in Egyptian pounds.
 */
export function Pricing({ prices }: { prices: Record<'PRO' | 'BUSINESS', number | null> }) {
  const t = getT(serverLocale(), ['landing', 'billing']);
  const locale = serverLocale();

  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20 py-20 sm:py-28">
      <div className={WRAP}>
        <SectionHead id="pricing-title" label={t('pricing.label')} title={t('pricing.title')} subtitle={t('pricing.subtitle')} />

        <div className="mt-12 grid gap-px overflow-hidden rounded-xl bg-line ring-1 ring-line sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => {
            const def = PLAN_LIMITS[plan];
            const price = plan === 'FREE' ? 0 : plan === 'ENTERPRISE' ? null : prices[plan];
            const features = (['cards', 'members', 'nfcTags'] as const).map((k) =>
              def[k] === null ? t(`billing:features.${k}Unlimited`) : t(`billing:features.${k}`, { count: def[k] as number }),
            );
            if (plan !== 'FREE') features.push(t('billing:features.verified'));
            return (
              <div key={plan} className="flex flex-col bg-surface p-6">
                <h3 className="text-[15px] font-semibold text-ink">{t(`billing:plans.${plan}`, { defaultValue: def.label })}</h3>
                <p className="mt-1 min-h-[2.6em] text-[13px] leading-snug text-muted">{t(`billing:taglines.${plan}`)}</p>
                <p className="mt-5 flex items-baseline gap-1.5">
                  {plan === 'ENTERPRISE' ? (
                    <span className="text-[30px] font-semibold leading-none tracking-[-0.02em] text-ink rtl:tracking-normal">{t('billing:plan.custom')}</span>
                  ) : price !== null ? (
                    <>
                      <span className="tabular text-[30px] font-semibold leading-none tracking-[-0.02em] text-ink rtl:tracking-normal">{formatCurrency(price, locale, 'EGP')}</span>
                      <span className="text-[13px] text-muted">{t('billing:plan.perMonth')}</span>
                    </>
                  ) : (
                    <span className="text-[16px] font-medium leading-[30px] text-muted">{t('billing:plan.priceSoon')}</span>
                  )}
                </p>
                {plan === 'ENTERPRISE' ? (
                  <a href={SALES_MAILTO} className="v-btn v-btn-ghost mt-6 w-full">
                    {t('billing:plan.contactSales')}
                  </a>
                ) : (
                  <Link href={REGISTER} className={`v-btn mt-6 w-full ${plan === 'FREE' ? '' : 'v-btn-ghost'}`}>
                    {t('pricing.start')}
                  </Link>
                )}
                <ul className="mt-6 space-y-2.5 border-t border-line pt-6 text-[13.5px] text-ink">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Icon name="check" size={14} className="mt-[3px] shrink-0 text-accent" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-[13px] text-faint">{t('pricing.note')}</p>
      </div>
    </section>
  );
}
