'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import type { InvoiceParty, InvoiceView } from '@vertex/shared';
import { authFetch, getToken } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatDate, formatMoneyExact } from '@/lib/format';
import { Icon } from '@/components/Icon';

/**
 * One invoice, laid out as a document: it prints, or saves as a PDF from the
 * browser's print dialog, on a single A4 page in the reader's language.
 */
export default function InvoicePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { t } = useTranslation('billing');
  const { locale } = useLocale();
  const [inv, setInv] = useState<InvoiceView | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getToken()) {
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    authFetch<InvoiceView>(`/billing/invoices/${encodeURIComponent(params.id)}`).then(setInv, (e) => setError((e as Error).message));
  }, [params.id, router]);

  useEffect(() => {
    if (inv) document.title = `${t('invoice.title')} ${inv.number}`;
  }, [inv, t]);

  const money = (cents: number) => formatMoneyExact(cents, locale, inv?.currency ?? 'EGP');
  const plan = inv ? t(`plans.${inv.plan}`, { defaultValue: inv.plan }) : '';

  return (
    <div className="min-h-screen bg-canvas px-4 py-6 print:bg-white print:p-0 sm:py-10">
      <div className="mx-auto mb-4 flex max-w-[800px] items-center gap-2 print:hidden">
        <Link href="/billing" className="v-btn v-btn-ghost">
          <Icon name="arrow" size={14} className="-scale-x-100 rtl:scale-x-100" /> {t('invoice.back')}
        </Link>
        {inv && (
          <button type="button" onClick={() => window.print()} className="v-btn v-btn-primary ms-auto">
            <Icon name="download" size={14} /> {t('invoice.print')}
          </button>
        )}
      </div>

      {error ? (
        <p role="alert" className="mx-auto max-w-[800px] rounded-xl px-4 py-6 text-center text-sm text-red-600 ring-1 ring-inset ring-line">
          {error}
        </p>
      ) : !inv ? (
        <div className="v-skeleton mx-auto h-[600px] max-w-[800px] rounded-xl" />
      ) : (
        <article
          className="mx-auto max-w-[800px] rounded-xl bg-white p-6 text-sm leading-relaxed text-neutral-900 shadow-sm ring-1 ring-black/5 print:max-w-none print:rounded-none print:p-0 print:shadow-none print:ring-0 sm:p-10"
          aria-label={`${t('invoice.title')} ${inv.number}`}
        >
          <header className="flex flex-wrap items-start justify-between gap-6 border-b border-neutral-200 pb-6">
            <Party party={inv.seller} heading={null} strong />
            <div className="text-end">
              <h1 className="text-2xl font-semibold tracking-tight">{t('invoice.title')}</h1>
              <p className="mt-1 font-mono text-sm text-neutral-600" dir="ltr">
                {inv.number}
              </p>
              <span className="mt-2 inline-block rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                {t('invoice.paid')}
              </span>
            </div>
          </header>

          <div className="grid gap-6 border-b border-neutral-200 py-6 sm:grid-cols-2">
            <Party party={inv.billedTo} heading={t('invoice.billedTo')} />
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 sm:justify-self-end">
              <dt className="text-neutral-500">{t('invoice.issued')}</dt>
              <dd>{formatDate(inv.paidAt, locale)}</dd>
              <dt className="text-neutral-500">{t('invoice.period')}</dt>
              <dd>
                {formatDate(inv.periodStart, locale)} – {formatDate(inv.periodEnd, locale)}
              </dd>
              {inv.paymentMethod && (
                <>
                  <dt className="text-neutral-500">{t('invoice.paidWith')}</dt>
                  <dd dir="ltr" style={{ textAlign: 'start' }}>
                    {inv.paymentMethod}
                  </dd>
                </>
              )}
            </dl>
          </div>

          <table className="mt-6 w-full">
            <thead>
              <tr className="border-b border-neutral-200 text-xs text-neutral-500">
                <th className="pb-2 text-start font-medium">{t('invoice.item')}</th>
                <th className="pb-2 text-end font-medium">{t('invoice.amount')}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-neutral-100">
                <td className="py-3">
                  <span className="block font-medium">{t('invoice.line', { plan })}</span>
                  <span className="block text-xs text-neutral-500">
                    {formatDate(inv.periodStart, locale)} – {formatDate(inv.periodEnd, locale)}
                  </span>
                </td>
                <td className="tabular py-3 text-end">{money(inv.amountCents)}</td>
              </tr>
            </tbody>
          </table>

          <dl className="ms-auto mt-4 grid max-w-[320px] grid-cols-[1fr_auto] gap-x-6 gap-y-1.5">
            {inv.taxPercent ? (
              <>
                <dt className="text-neutral-500">{t('invoice.subtotal')}</dt>
                <dd className="tabular text-end">{money(inv.amountCents - inv.taxCents)}</dd>
                <dt className="text-neutral-500">{t('invoice.vat', { percent: inv.taxPercent })}</dt>
                <dd className="tabular text-end">{money(inv.taxCents)}</dd>
              </>
            ) : null}
            <dt className="border-t border-neutral-200 pt-2 font-semibold">{t('invoice.total')}</dt>
            <dd className="tabular border-t border-neutral-200 pt-2 text-end font-semibold">{money(inv.amountCents)}</dd>
            <dt className="text-neutral-500">{t('invoice.amountPaid')}</dt>
            <dd className="tabular text-end text-neutral-500">{money(inv.amountCents)}</dd>
          </dl>

          <footer className="mt-10 border-t border-neutral-200 pt-4 text-xs text-neutral-500">
            <p>{inv.taxPercent ? t('invoice.vatNote', { percent: inv.taxPercent }) : t('invoice.noVatNote')}</p>
            <p className="mt-1">{t('invoice.thanks')}</p>
          </footer>
        </article>
      )}
    </div>
  );
}

function Party({ party, heading, strong = false }: { party: InvoiceParty; heading: string | null; strong?: boolean }) {
  const { t } = useTranslation('billing');
  // Each line takes its own direction, so an English address reads in order on an Arabic invoice.
  const line = 'text-neutral-600 [unicode-bidi:plaintext] rtl:text-right';
  return (
    <div className="min-w-0">
      {heading && <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500 rtl:normal-case rtl:tracking-normal">{heading}</p>}
      <p className={`${strong ? 'text-base font-semibold' : 'font-medium'} [unicode-bidi:plaintext] rtl:text-right`}>{party.legalName || party.name}</p>
      {party.legalName && party.name && party.legalName !== party.name && <p className={line}>{party.name}</p>}
      {party.address && <p className={`whitespace-pre-line ${line}`}>{party.address}</p>}
      {party.taxId && (
        <p className="text-neutral-600">
          {t('invoice.taxId')}: <bdi>{party.taxId}</bdi>
        </p>
      )}
      {party.email && <p className={line}>{party.email}</p>}
    </div>
  );
}
