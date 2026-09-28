'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/client';
import { formatDate } from '@/lib/format';
import type { Occasion } from '@/lib/occasions';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const todayKey = () => new Date().toISOString().slice(0, 10);

/** "19 – 21 Sep 2026", or one date for a one-day occasion. */
export function useOccasionRange() {
  const { t } = useTranslation('dashboard');
  const { locale } = useLocale();
  return (o: Occasion) => {
    const d = (k: string, year: boolean) =>
      formatDate(`${k}T12:00:00Z`, locale, { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
    return o.startsOn === o.endsOn ? d(o.startsOn, true) : t('occasions.range', { from: d(o.startsOn, false), to: d(o.endsOn, true) });
  };
}

/**
 * The workspace's occasions: exhibitions, launches, campaigns. They are marked
 * on the charts on Home and in Analytics. Everyone sees them; managers and up
 * add, change and remove them, as the API allows.
 */
export function OccasionsSheet({
  open,
  onClose,
  occasions,
  canManage,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  occasions: Occasion[];
  canManage: boolean;
  onChanged: () => Promise<unknown> | void;
}) {
  const { t } = useTranslation('dashboard');
  const { locale } = useLocale();
  const range = useOccasionRange();
  const [editing, setEditing] = useState<Occasion | null>(null);
  const [name, setName] = useState('');
  const [from, setFrom] = useState(todayKey);
  const [to, setTo] = useState(todayKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<Occasion | null>(null);

  function reset() {
    setEditing(null);
    setName('');
    setFrom(todayKey());
    setTo(todayKey());
    setError('');
  }

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  function edit(o: Occasion) {
    setEditing(o);
    setName(o.name);
    setFrom(o.startsOn);
    setTo(o.endsOn);
    setError('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (to < from) return setError(t('occasions.errors.range'));
    setBusy(true);
    setError('');
    try {
      const body = JSON.stringify({ name: name.trim(), startsOn: from, endsOn: to });
      if (editing) await authFetch(`/orgs/occasions/${editing.id}`, { method: 'PATCH', body });
      else await authFetch('/orgs/occasions', { method: 'POST', body });
      reset();
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const today = todayKey();
  const groups = [
    { key: 'now', items: occasions.filter((o) => o.startsOn <= today && today <= o.endsOn) },
    { key: 'upcoming', items: occasions.filter((o) => o.startsOn > today).sort((a, b) => a.startsOn.localeCompare(b.startsOn)) },
    { key: 'past', items: occasions.filter((o) => o.endsOn < today) },
  ].filter((g) => g.items.length > 0);

  return (
    <Sheet open={open} onClose={onClose} closeLabel={t('occasions.close')} title={t('occasions.title')} subtitle={t('occasions.subtitle')}>
      {canManage && (
        <form onSubmit={submit} className="space-y-3 rounded-xl bg-elevated p-4 ring-1 ring-inset ring-line">
          <p className="text-[13px] font-medium text-ink">{editing ? t('occasions.editTitle') : t('occasions.addTitle')}</p>
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-muted">{t('occasions.name')}</span>
            <input className="v-field" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('occasions.namePlaceholder')} maxLength={80} required />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[12.5px] text-muted">{t('occasions.from')}</span>
              <input
                type="date"
                className="v-field"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  if (e.target.value > to) setTo(e.target.value);
                }}
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] text-muted">{t('occasions.to')}</span>
              <input type="date" className="v-field" value={to} min={from} onChange={(e) => setTo(e.target.value)} required />
            </label>
          </div>
          {error && (
            <p role="alert" className="text-[12.5px] text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !name.trim()} className="v-btn">
              {editing ? (busy ? t('occasions.saving') : t('occasions.save')) : busy ? t('occasions.adding') : t('occasions.add')}
            </button>
            {editing && (
              <button type="button" onClick={reset} className="v-btn v-btn-ghost">
                {t('occasions.cancel')}
              </button>
            )}
          </div>
        </form>
      )}

      {groups.length === 0 ? (
        <p className={`${canManage ? 'mt-6' : ''} rounded-xl py-10 text-center text-[13px] text-muted ring-1 ring-inset ring-line`}>
          {canManage ? t('occasions.empty') : t('occasions.emptyViewer')}
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="mt-6">
            <h3 className="mb-2 text-[12.5px] font-medium text-faint">{t(`occasions.groups.${g.key}`)}</h3>
            <ul className="divide-y divide-line overflow-hidden rounded-xl ring-1 ring-inset ring-line">
              {g.items.map((o) => (
                <li key={o.id} className={`flex items-center gap-3 px-3.5 py-3 ${editing?.id === o.id ? 'bg-accent/[0.05]' : ''}`}>
                  <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-surface ring-1 ring-inset ring-line">
                    <span className="text-[10px] leading-none text-faint">{formatDate(`${o.startsOn}T12:00:00Z`, locale, { month: 'short' })}</span>
                    <span className="tabular mt-0.5 text-[14px] font-semibold leading-none text-ink">
                      {formatDate(`${o.startsOn}T12:00:00Z`, locale, { day: 'numeric' })}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">{o.name}</span>
                    <span className="block truncate text-[12px] text-muted">{range(o)}</span>
                  </span>
                  {canManage && (
                    <ActionMenu
                      label={t('occasions.more')}
                      items={[
                        { key: 'edit', label: t('occasions.edit'), icon: 'settings', onSelect: () => edit(o) },
                        { key: 'delete', label: t('occasions.delete'), icon: 'trash', danger: true, separated: true, onSelect: () => setRemoving(o) },
                      ]}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {!canManage && (
        <p className="mt-4 flex items-center gap-1.5 text-[12px] text-faint">
          <Icon name="lock" size={12} /> {t('occasions.viewerHint')}
        </p>
      )}

      <ConfirmDialog
        open={!!removing}
        title={t('occasions.deleteTitle')}
        body={t('occasions.deleteBody', { name: removing?.name ?? '' })}
        confirmLabel={t('occasions.delete')}
        busyLabel={t('occasions.deleting')}
        cancelLabel={t('occasions.cancel')}
        danger
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await authFetch(`/orgs/occasions/${removing.id}`, { method: 'DELETE' });
          if (editing?.id === removing.id) reset();
          setRemoving(null);
          await onChanged();
        }}
      />
    </Sheet>
  );
}
