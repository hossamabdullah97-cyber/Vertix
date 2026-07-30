'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch, getToken, type NfcTag, type Card } from '@/lib/client';
import { API_URL } from '@/lib/api';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatDate } from '@/lib/format';
import AppShell from '@/components/AppShell';
import { Icon } from '@/components/Icon';

const HARDWARE = ['CARD', 'STICKER', 'KEYCHAIN', 'WRISTBAND', 'OTHER'] as const;
const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/15',
  UNASSIGNED: 'bg-canvas text-muted border border-line',
  DISABLED: 'bg-rose-500/10 text-rose-700 border border-rose-500/15',
};

export default function TagsPage() {
  const router = useRouter();
  const { t } = useTranslation('nfc');
  const { locale } = useLocale();
  const [tags, setTags] = useState<NfcTag[] | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterBatch, setFilterBatch] = useState('');

  // single register form
  const [uid, setUid] = useState('');
  const [hardware, setHardware] = useState<(typeof HARDWARE)[number]>('CARD');
  const [batchId, setBatchId] = useState('');
  // batch register form
  const [batchUids, setBatchUids] = useState('');
  const [batchHardware, setBatchHardware] = useState<(typeof HARDWARE)[number]>('CARD');
  const [batchBatchId, setBatchBatchId] = useState('');

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (filterStatus) qs.set('status', filterStatus);
    if (filterBatch) qs.set('batchId', filterBatch);
    const [t, c] = await Promise.all([
      authFetch<NfcTag[]>(`/nfc/tags${qs.toString() ? `?${qs}` : ''}`),
      authFetch<Card[]>('/cards'),
    ]);
    setTags(t);
    setCards(c);
  }, [filterStatus, filterBatch]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load().catch((e) => setError(e.message));
  }, [router, load]);

  const run = (fn: () => Promise<unknown>) => {
    setError('');
    fn()
      .then(() => load())
      .catch((e) => setError((e as Error).message));
  };

  const registerSingle = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await authFetch('/nfc/tags', {
        method: 'POST',
        body: JSON.stringify({ uid, hardwareType: hardware, batchId: batchId || undefined }),
      });
      setUid('');
    });
  };

  const registerBatch = (e: React.FormEvent) => {
    e.preventDefault();
    const uids = batchUids
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (uids.length === 0) return;
    run(async () => {
      const res = await authFetch<{ requested: number; created: number }>(
        '/nfc/tags/batch',
        {
          method: 'POST',
          body: JSON.stringify({
            uids,
            hardwareType: batchHardware,
            batchId: batchBatchId || undefined,
          }),
        },
      );
      setBatchUids('');
      setError(t('batchSuccess', { created: res.created, requested: res.requested }));
    });
  };

  return (
    <AppShell title={t('title', 'NFC Hardware Management')}>
      <p className="text-[13px] text-muted -mt-2 font-semibold tracking-wide uppercase">{t('subtitle', 'Register, configure, and bind physical NFC chips to digital business cards.')}</p>

      {/* Real fleet summary — computed from the registered tags */}
      {tags && tags.length > 0 && (() => {
        const active = tags.filter((t) => t.status === 'ACTIVE').length;
        const unassigned = tags.filter((t) => t.status === 'UNASSIGNED').length;
        const disabled = tags.filter((t) => t.status === 'DISABLED').length;
        const scans = tags.reduce((s, t) => s + (t.activationCount ?? 0), 0);
        const cells = [
          { label: t('stats.total', 'Total Tags'), value: tags.length, icon: 'tag', color: '#2563eb' },
          { label: t('stats.active', 'Active'), value: active, icon: 'check', color: '#10b981' },
          { label: t('stats.unassigned', 'Unassigned'), value: unassigned, icon: 'inbox', color: '#f59e0b' },
          { label: t('stats.disabled', 'Disabled'), value: disabled, icon: 'x', color: '#ef4444' },
          { label: t('stats.totalScans', 'Total Scans'), value: scans, icon: 'zap', color: '#4f46e5' },
        ];
        return (
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {cells.map((c) => (
              <div key={c.label} className="v-stat">
                <div className="flex items-center justify-between">
                  <span className="v-stat-label">{c.label}</span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: `${c.color}1a`, color: c.color }}>
                    <Icon name={c.icon} size={15} />
                  </span>
                </div>
                <p className="v-stat-value mt-2 tabular-nums">{c.value}</p>
              </div>
            ))}
          </div>
        );
      })()}

      {error && (
        <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-semibold flex items-center gap-2">
          <span>⚠️</span>{error}
        </div>
      )}

      {/* Register forms */}
      <div className="mt-6 grid md:grid-cols-2 gap-6">
        <form onSubmit={registerSingle} className="v-card p-6 bg-surface flex flex-col justify-between">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <span className="v-icon-tile"><Icon name="tag" size={16} /></span>
              <div>
                <h2 className="text-[15.5px] font-extrabold text-ink tracking-tight">{t('singleTitle', 'Single Tag Registration')}</h2>
                <p className="text-[12px] text-muted">{t('singleSub', 'Register a single physical chip manually')}</p>
              </div>
            </div>
            <div className="space-y-3.5">
              <label className="block space-y-1">
                <span className="text-[11.5px] font-bold text-muted uppercase tracking-wider">{t('uidLabel', 'Physical Tag UID')}</span>
                <input className="v-field font-mono" dir="ltr" placeholder="e.g. 04:A1:B2:C3:D4:E5:F6" value={uid}
                  onChange={(e) => setUid(e.target.value)} required />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-[11.5px] font-bold text-muted uppercase tracking-wider">{t('hardwareLabel', 'Hardware Type')}</span>
                  <select className="v-field font-semibold" value={hardware}
                    onChange={(e) => setHardware(e.target.value as never)}>
                    {HARDWARE.map((h) => <option key={h} value={h}>{t(`hardwareType.${h.toLowerCase()}`, h)}</option>)}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-[11.5px] font-bold text-muted uppercase tracking-wider">{t('batchLabel', 'Batch ID (Optional)')}</span>
                  <input className="v-field" placeholder="e.g. BATCH-01" value={batchId}
                    onChange={(e) => setBatchId(e.target.value)} />
                </label>
              </div>
            </div>
          </div>
          <button className="v-btn w-full mt-6 font-bold shadow-md">{t('registerSingleBtn', 'Register single chip')}</button>
        </form>

        <form onSubmit={registerBatch} className="v-card p-6 bg-surface flex flex-col justify-between">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <span className="v-icon-tile"><Icon name="layers" size={16} /></span>
              <div>
                <h2 className="text-[15.5px] font-extrabold text-ink tracking-tight">{t('batchTitle', 'Batch Factory Import')}</h2>
                <p className="text-[12px] text-muted">{t('batchSub', 'Register multiple tags at once from manufacturer data')}</p>
              </div>
            </div>
            <div className="space-y-3.5">
              <label className="block space-y-1">
                <span className="text-[11.5px] font-bold text-muted uppercase tracking-wider">{t('batchUidsLabel', 'List of UIDs (One per line)')}</span>
                <textarea className="v-field font-mono text-[11px] !h-16" dir="ltr" rows={3}
                  placeholder="04:11:22:33&#10;04:44:55:66" value={batchUids}
                  onChange={(e) => setBatchUids(e.target.value)} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-[11.5px] font-bold text-muted uppercase tracking-wider">{t('hardwareLabel', 'Hardware Type')}</span>
                  <select className="v-field font-semibold" value={batchHardware}
                    onChange={(e) => setBatchHardware(e.target.value as never)}>
                    {HARDWARE.map((h) => <option key={h} value={h}>{t(`hardwareType.${h.toLowerCase()}`, h)}</option>)}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-[11.5px] font-bold text-muted uppercase tracking-wider">{t('batchIdLabel', 'Batch ID')}</span>
                  <input className="v-field" placeholder="e.g. BATCH-FACTORY-22" value={batchBatchId}
                    onChange={(e) => setBatchBatchId(e.target.value)} />
                </label>
              </div>
            </div>
          </div>
          <button className="v-btn v-btn-ghost w-full mt-6 font-bold"><Icon name="layers" size={15} /> {t('importBatchBtn', 'Import Batch')}</button>
        </form>
      </div>

      {/* Filters & Header */}
      <div className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-line pt-6">
        <div>
          <h3 className="text-[16px] font-bold text-ink tracking-tight">{t('listTitle', 'Registered Chips list')}</h3>
          <p className="text-[12px] text-muted font-medium">{t('listSub', 'Link tags to profile cards below')}</p>
        </div>
        <div className="flex items-center gap-3">
          <select className="v-field !h-9 w-auto !text-[12.5px] font-bold" value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">{t('allStatuses', 'All statuses')}</option>
            <option value="UNASSIGNED">{t('status.unassigned', 'Unassigned')}</option>
            <option value="ACTIVE">{t('status.active', 'Active')}</option>
            <option value="DISABLED">{t('status.disabled', 'Disabled')}</option>
          </select>
          <input className="v-field !h-9 w-44 !text-[12.5px]" placeholder={t('filterBatchPlaceholder', 'Filter by Batch ID')}
            value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)} />
        </div>
      </div>

      {/* Tag list */}
      <div className="mt-4 grid gap-3">
        {tags === null && (
          <div className="grid gap-3">
            {[1, 2].map((n) => <div key={n} className="v-skeleton h-20 rounded-xl" />)}
          </div>
        )}
        {tags?.length === 0 && (
          <div className="v-card py-16 text-center text-muted font-semibold bg-surface">
            {t('emptyStateFilter', 'No registered NFC tags match the current filter criteria.')}
          </div>
        )}
        {tags?.map((tag) => (
          <div key={tag.id} className="v-card p-5 bg-surface hover:shadow-md transition-shadow">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[14px] font-bold text-ink bg-canvas border border-line px-2 py-0.5 rounded-lg">{tag.uid}</span>
                  <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border tracking-wider uppercase ${STATUS_STYLES[tag.status]}`}>
                    {t(`status.${tag.status.toLowerCase()}`, tag.status)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-muted font-semibold uppercase tracking-wide">
                  <span>{t('tagRow.type')} {t(`hardwareType.${tag.hardwareType.toLowerCase()}`, tag.hardwareType)}</span>
                  {tag.batchId && (
                    <>
                      <span>·</span>
                      <span>{t('tagRow.batch')} <span dir="ltr">{tag.batchId}</span></span>
                    </>
                  )}
                  <span>·</span>
                  <span className="text-accent">{tag.activationCount} {t('tagRow.scans')}</span>
                  {tag.lastScanAt && (
                    <>
                      <span>·</span>
                      <span>{t('tagRow.last')} {formatDate(tag.lastScanAt, locale, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <button
                    onClick={() => navigator.clipboard?.writeText(`${API_URL}/t/${tag.uid}`)}
                    className="inline-flex items-center gap-1.5 text-[10.5px] text-muted hover:text-ink font-mono"
                    title={t('tagRow.copyUrl')}
                  >
                    <span className="font-medium" dir="ltr">{API_URL}/t/{tag.uid}</span>
                    <span className="inline-flex items-center gap-1 bg-canvas border border-line px-1.5 py-0.5 rounded text-[9px] font-sans font-bold"><Icon name="copy" size={9} /> {t('tagRow.copy')}</span>
                  </button>
                  <a
                    href={`${API_URL}/t/${tag.uid}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      setTimeout(() => load().catch(() => {}), 1500);
                    }}
                    className="inline-flex items-center gap-1 bg-accent/10 border border-accent/25 hover:bg-accent/20 text-accent font-semibold px-2 py-0.5 rounded-lg text-[10px] transition-colors"
                    title={t('tagRow.simulateTitle')}
                  >
                    <Icon name="zap" size={11} /> {t('tagRow.simulateTap')}
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <select
                  className="v-field !h-9 w-[180px] !text-[12.5px] font-semibold bg-canvas"
                  value={tag.cardId ?? ''}
                  onChange={(e) =>
                    e.target.value
                      ? run(() => authFetch(`/nfc/tags/${tag.id}/assign`, {
                          method: 'POST', body: JSON.stringify({ cardId: e.target.value }) }))
                      : run(() => authFetch(`/nfc/tags/${tag.id}/unassign`, { method: 'POST' }))
                  }
                >
                  <option value="">{t('tagRow.linkCard')}</option>
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>c/{c.slug}</option>
                  ))}
                </select>

                <button
                  onClick={() =>
                    run(() => authFetch(`/nfc/tags/${tag.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({
                        status: tag.status === 'DISABLED'
                          ? (tag.cardId ? 'ACTIVE' : 'UNASSIGNED')
                          : 'DISABLED',
                      }),
                    }))
                  }
                  className="v-btn v-btn-ghost !h-9 text-[12px] font-bold"
                >
                  {tag.status === 'DISABLED' ? t('tagRow.enable') : t('tagRow.disable')}
                </button>
                <button
                  onClick={() => run(() => authFetch(`/nfc/tags/${tag.id}`, { method: 'DELETE' }))}
                  className="v-btn v-btn-danger !h-9 text-[12px] font-bold hover:bg-red-600"
                >
                  {t('tagRow.delete')}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
