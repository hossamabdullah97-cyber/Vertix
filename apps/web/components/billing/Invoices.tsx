'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import type { BillingDetails, InvoiceView } from '@vertex/shared';
import { authFetch } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatDate, formatMoneyExact, inputDir } from '@/lib/format';
import { Icon } from '@/components/Icon';

/** The workspace's invoices, one for each payment, each opening as a page to print or save. */
export function InvoiceList() {
  const { t } = useTranslation('billing');
  const { locale } = useLocale();
  const [list, setList] = useState<InvoiceView[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    authFetch<InvoiceView[]>('/billing/invoices').then(setList, (e) => setError((e as Error).message));
  }, []);

  return (
    <section aria-labelledby="invoices-title">
      <h2 id="invoices-title" className="text-md font-semibold text-ink">
        {t('invoices.title')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('invoices.hint')}</p>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : !list ? (
        <div className="v-skeleton mt-4 h-24 rounded-xl" />
      ) : list.length === 0 ? (
        <p className="mt-4 rounded-xl px-4 py-6 text-center text-sm text-muted ring-1 ring-inset ring-line">{t('invoices.empty')}</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-inset ring-line">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-start text-xs text-muted">
                <th className="px-4 py-2.5 text-start font-medium">{t('invoices.date')}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t('invoices.number')}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t('invoices.plan')}</th>
                <th className="px-4 py-2.5 text-end font-medium">{t('invoices.amount')}</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((inv) => (
                <tr key={inv.id} data-testid="invoice-row">
                  <td className="px-4 py-3 text-ink">{formatDate(inv.paidAt, locale)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    <bdi>{inv.number}</bdi>
                  </td>
                  <td className="px-4 py-3 text-ink">{t(`plans.${inv.plan}`, { defaultValue: inv.plan })}</td>
                  <td className="tabular px-4 py-3 text-end text-ink">{formatMoneyExact(inv.amountCents, locale, inv.currency)}</td>
                  <td className="px-4 py-3 text-end">
                    <Link href={`/billing/invoices/${inv.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
                      {t('invoices.view')} <Icon name="arrow" size={13} className="rtl:-scale-x-100" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const EMPTY: Required<BillingDetails> = { legalName: '', taxId: '', address: '', email: '' };

/** Who invoices are made out to: the business's legal name, tax number, address and accounts email. */
export function BillingDetailsForm() {
  const { t } = useTranslation('billing');
  const { locale } = useLocale();
  const [form, setForm] = useState<Required<BillingDetails> | null>(null);
  const [saved, setSaved] = useState<Required<BillingDetails> | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    authFetch<BillingDetails>('/billing/details').then(
      (d) => {
        const v = { ...EMPTY, ...d } as Required<BillingDetails>;
        setForm(v);
        setSaved(v);
      },
      () => setForm({ ...EMPTY }),
    );
  }, []);

  const changed = !!form && !!saved && (Object.keys(EMPTY) as (keyof BillingDetails)[]).some((k) => form[k] !== saved[k]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setNote(null);
    try {
      const d = await authFetch<BillingDetails>('/billing/details', { method: 'PUT', body: JSON.stringify(form) });
      const v = { ...EMPTY, ...d } as Required<BillingDetails>;
      setForm(v);
      setSaved(v);
      setNote({ ok: true, text: t('details.saved') });
    } catch (err) {
      setNote({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof BillingDetails, kind: 'text' | 'email' = 'text', multiline = false) => (
    <label className={multiline ? 'sm:col-span-2' : ''}>
      <span className="mb-1.5 block text-xs font-medium text-ink">{t(`details.${key}`)}</span>
      {multiline ? (
        <textarea
          className="v-field min-h-[72px] w-full"
          value={form?.[key] ?? ''}
          onChange={(e) => setForm((f) => f && { ...f, [key]: e.target.value })}
          maxLength={400}
          rows={2}
          dir="auto"
        />
      ) : (
        <input
          className="v-field w-full"
          type={kind}
          dir={kind === 'email' ? inputDir('email', locale) : 'auto'}
          value={form?.[key] ?? ''}
          onChange={(e) => setForm((f) => f && { ...f, [key]: e.target.value })}
          maxLength={key === 'taxId' ? 40 : 200}
          autoComplete={key === 'legalName' ? 'organization' : key === 'email' ? 'email' : 'off'}
        />
      )}
    </label>
  );

  return (
    <section aria-labelledby="details-title">
      <h2 id="details-title" className="text-md font-semibold text-ink">
        {t('details.title')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('details.hint')}</p>
      {!form ? (
        <div className="v-skeleton mt-4 h-40 rounded-xl" />
      ) : (
        <form onSubmit={save} className="mt-4 rounded-xl p-4 ring-1 ring-inset ring-line">
          <div className="grid gap-4 sm:grid-cols-2">
            {field('legalName')}
            {field('taxId')}
            {field('address', 'text', true)}
            {field('email', 'email')}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="v-btn v-btn-primary disabled:opacity-50" disabled={busy || !changed}>
              {busy ? t('details.saving') : t('details.save')}
            </button>
            {note && (
              <span role="status" className={`text-sm ${note.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'}`}>
                {note.text}
              </span>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
