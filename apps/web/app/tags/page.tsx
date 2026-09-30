'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { authFetch, getToken, type Card, type Me, type Member, type NfcTag } from '@/lib/client';
import { API_URL } from '@/lib/api';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatDate, formatNumber, formatRelativeTime } from '@/lib/format';
import { useNfcScanner } from '@/components/nfc/useNfcScanner';
import AppShell from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { CardThumb } from '@/components/cards/CardThumb';
import { ActionMenu, type ActionItem } from '@/components/ui/ActionMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Sheet } from '@/components/ui/Sheet';

const HARDWARE = ['CARD', 'STICKER', 'KEYCHAIN', 'WRISTBAND', 'OTHER'] as const;
type Hardware = (typeof HARDWARE)[number];
type StatusFilter = 'all' | NfcTag['status'];
const STATUSES: StatusFilter[] = ['all', 'ACTIVE', 'UNASSIGNED', 'DISABLED'];

const tapUrl = (uid: string) => `${API_URL}/t/${uid}`;
const cardName = (c: Card) => ((c.vcardData?.fullName as string) || '').trim() || `/c/${c.slug}`;

export default function TagsPage() {
  const router = useRouter();
  const { t } = useTranslation('nfc');
  const { locale } = useLocale();
  const fmt = (n: number) => formatNumber(n, locale);

  const [tags, setTags] = useState<NfcTag[] | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [batch, setBatch] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<NfcTag | null>(null);

  // An employee handles only their own chip: no holders, no stock decisions.
  const isEmployee = me?.role === 'EMPLOYEE';

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }

  const load = useCallback(async () => {
    const [tg, c] = await Promise.all([authFetch<NfcTag[]>('/nfc/tags'), authFetch<Card[]>('/cards')]);
    setTags(tg);
    setCards(c);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load().catch((e) => setError(e.message));
    authFetch<Me>('/auth/me')
      .then((m) => {
        setMe(m);
        // The member list is a manager's tool; an employee would only get a 403.
        if (m.role && m.role !== 'EMPLOYEE') authFetch<Member[]>('/orgs/members').then(setMembers).catch(() => setMembers([]));
      })
      .catch(() => setMe(null));
  }, [router, load]);

  /** Runs a change, reloads the list and says what happened; errors surface where the user is looking. */
  const act = useCallback(
    async (fn: () => Promise<unknown>, done: string) => {
      setError('');
      try {
        await fn();
        await load();
        flash(done);
      } catch (e) {
        setError((e as Error).message);
        throw e;
      }
    },
    [load],
  );

  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const counts = useMemo(() => {
    const by = { all: tags?.length ?? 0, ACTIVE: 0, UNASSIGNED: 0, DISABLED: 0 } as Record<StatusFilter, number>;
    for (const tg of tags ?? []) by[tg.status] += 1;
    return by;
  }, [tags]);
  const batches = useMemo(() => Array.from(new Set((tags ?? []).map((tg) => tg.batchId).filter(Boolean) as string[])).sort(), [tags]);
  const totalTaps = (tags ?? []).reduce((s, tg) => s + (tg.activationCount ?? 0), 0);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (tags ?? []).filter((tg) => {
      if (status !== 'all' && tg.status !== status) return false;
      if (batch && tg.batchId !== batch) return false;
      if (!q) return true;
      const card = tg.cardId ? cardById.get(tg.cardId) : undefined;
      const hay = `${tg.uid} ${tg.batchId ?? ''} ${card ? `${cardName(card)} ${card.slug}` : ''} ${tg.assignedUser?.name ?? ''} ${tg.assignedUser?.email ?? ''}`;
      return hay.toLowerCase().includes(q);
    });
  }, [tags, status, batch, query, cardById]);

  const selected = tags?.find((tg) => tg.id === selectedId) ?? null;
  const filtersActive = query.trim() !== '' || batch !== '' || status !== 'all';
  const clearFilters = () => {
    setQuery('');
    setBatch('');
    setStatus('all');
  };
  const closeDetails = useCallback(() => setSelectedId(null), []);
  const closeAdd = useCallback(() => setAdding(false), []);
  const closeDelete = useCallback(() => setDeleting(null), []);

  async function copyLink(tg: NfcTag) {
    try {
      await navigator.clipboard.writeText(tapUrl(tg.uid));
      flash(t('toasts.linkCopied'));
    } catch {
      flash(t('toasts.copyFailed'));
    }
  }
  // A test tap counts like a real one; refresh so the new count shows.
  const afterTestTap = () => setTimeout(() => load().catch(() => {}), 1500);

  const setEnabled = (tg: NfcTag, enabled: boolean) =>
    act(
      () =>
        authFetch(`/nfc/tags/${tg.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: enabled ? (tg.cardId ? 'ACTIVE' : 'UNASSIGNED') : 'DISABLED' }),
        }),
      enabled ? t('toasts.enabled') : t('toasts.disabled'),
    ).catch(() => {});

  const menuFor = (tg: NfcTag): ActionItem[] => [
    { key: 'open', label: t('actions.details'), icon: 'settings', onSelect: () => setSelectedId(tg.id) },
    { key: 'copy', label: t('actions.copyLink'), icon: 'copy', onSelect: () => copyLink(tg) },
    { key: 'test', label: t('actions.testTap'), icon: 'external-link', externalHref: tapUrl(tg.uid), onSelect: afterTestTap },
    ...(isEmployee
      ? []
      : [
          tg.status === 'DISABLED'
            ? { key: 'enable', label: t('actions.enable'), icon: 'check', onSelect: () => setEnabled(tg, true), separated: true }
            : { key: 'disable', label: t('actions.disable'), icon: 'eye-off', onSelect: () => setEnabled(tg, false), separated: true },
          { key: 'delete', label: t('actions.delete'), icon: 'trash', danger: true, onSelect: () => setDeleting(tg) },
        ]),
  ];

  return (
    <AppShell
      title={t('title')}
      fluid
      action={
        <button onClick={() => setAdding(true)} className="v-btn">
          <Icon name="plus" size={14} /> {t('add')}
        </button>
      }
    >
      {tags && tags.length > 0 && (
        <p className="text-base text-muted">
          <span className="font-medium text-ink">{t('summary.chips', { count: counts.all, value: fmt(counts.all) })}</span>
          <span className="mx-2 text-faint" aria-hidden>
            ·
          </span>
          {t('summary.linked', { count: counts.ACTIVE, value: fmt(counts.ACTIVE) })}
          <span className="mx-2 text-faint" aria-hidden>
            ·
          </span>
          {t('summary.taps', { count: totalTaps, value: fmt(totalTaps) })}
        </p>
      )}

      {error && !selected && !adding && (
        <div role="alert" className="mt-4 flex items-start gap-3 rounded-lg bg-red-500/[0.06] px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-300">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} aria-label={t('actions.dismiss')} className="-m-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-red-500/10">
            <Icon name="x" size={13} />
          </button>
        </div>
      )}

      {tags === null ? (
        <div className="mt-6 space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="v-skeleton h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : tags.length === 0 ? (
        <FirstChip onAdd={() => setAdding(true)} />
      ) : (
        <>
          <nav role="tablist" aria-label={t('filters.status')} className="no-scrollbar -mx-5 mt-4 flex gap-5 overflow-x-auto border-b border-line px-5 md:-mx-8 md:px-8">
            {STATUSES.map((s) => {
              const active = status === s;
              return (
                <button
                  key={s}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStatus(s)}
                  className={`relative flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-medium transition-colors sm:min-h-10 ${
                    active ? 'text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {t(`filters.${s}`)}
                  <span className="tabular text-xs text-faint">{counts[s]}</span>
                  {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ink" />}
                </button>
              );
            })}
          </nav>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className="relative min-w-[220px] flex-1 sm:max-w-[320px]">
              <span className="sr-only">{t('search')}</span>
              <span className="pointer-events-none absolute inset-y-0 start-2.5 flex items-center text-faint">
                <Icon name="search" size={14} />
              </span>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search')} className="v-field !ps-8 !text-sm sm:!h-8" />
            </label>
            {batches.length > 0 && (
              <select value={batch} onChange={(e) => setBatch(e.target.value)} aria-label={t('filters.batch')} className="v-field !h-11 !w-auto !py-0 !pe-8 !text-sm sm:!h-8">
                <option value="">{t('filters.allBatches')}</option>
                {batches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            )}
            {filtersActive && (
              <>
                <span className="text-xs text-faint">{t('results', { count: shown.length })}</span>
                <button onClick={clearFilters} className="min-h-11 text-xs font-medium text-accent hover:underline sm:min-h-0">
                  {t('clearFilters')}
                </button>
              </>
            )}
          </div>

          <div className="mt-4">
            {shown.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-6 py-14 text-center">
                <p className="text-sm text-muted">{t('empty.noMatch')}</p>
                <button onClick={clearFilters} className="v-btn v-btn-ghost">
                  {t('clearFilters')}
                </button>
              </div>
            ) : (
              <div className="v-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="v-table">
                    <thead>
                      <tr>
                        <th>{t('table.chip')}</th>
                        <th>{t('table.status')}</th>
                        <th className="hidden md:table-cell">{t('table.opens')}</th>
                        {!isEmployee && <th className="hidden lg:table-cell">{t('table.holder')}</th>}
                        <th className="hidden !text-end sm:table-cell">{t('table.taps')}</th>
                        <th className="hidden sm:table-cell">{t('table.lastTap')}</th>
                        <th className="w-12">
                          <span className="sr-only">{t('table.actions')}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((tg) => {
                        const card = tg.cardId ? cardById.get(tg.cardId) : undefined;
                        return (
                          <tr
                            key={tg.id}
                            tabIndex={0}
                            onClick={() => setSelectedId(tg.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && e.target === e.currentTarget) setSelectedId(tg.id);
                            }}
                            className={`cursor-pointer outline-none focus-visible:[&>td]:bg-elevated ${selectedId === tg.id ? '[&>td]:!bg-accent/[0.06]' : ''}`}
                          >
                            <td className="w-full max-w-0">
                              {/* Pinned LTR: the bidi algorithm would otherwise move the
                                  first group of a colon-separated serial to the end. It
                                  wraps rather than truncates: the tail tells chips apart. */}
                              <span dir="ltr" className="block font-mono text-xs text-ink rtl:text-right sm:text-sm">
                                <Serial uid={tg.uid} />
                              </span>
                              <span className="block truncate text-xs text-faint">
                                {t(`hardwareType.${tg.hardwareType.toLowerCase()}`)}
                                {tg.batchId && (
                                  <>
                                    {' · '}
                                    <span dir="ltr">{tg.batchId}</span>
                                  </>
                                )}
                              </span>
                            </td>
                            <td>
                              <StatusBadge status={tg.status} />
                            </td>
                            <td className="hidden md:table-cell">
                              {card ? (
                                <span className="flex items-center gap-2 whitespace-nowrap">
                                  <CardThumb card={card} />
                                  <span className="max-w-[180px] truncate text-ink">{cardName(card)}</span>
                                </span>
                              ) : (
                                <span className="text-faint">{t('table.notLinked')}</span>
                              )}
                            </td>
                            {!isEmployee && (
                              <td className="hidden whitespace-nowrap lg:table-cell">
                                {tg.assignedUser ? (
                                  <span className="text-muted">{tg.assignedUser.name || tg.assignedUser.email}</span>
                                ) : (
                                  <span className="text-faint">—</span>
                                )}
                              </td>
                            )}
                            <td className="hidden text-end sm:table-cell">{fmt(tg.activationCount ?? 0)}</td>
                            <td className="hidden whitespace-nowrap text-muted sm:table-cell">
                              {tg.lastScanAt ? formatRelativeTime(tg.lastScanAt, locale, 'short') : <span className="text-faint">{t('table.never')}</span>}
                            </td>
                            <td>
                              <ActionMenu label={t('actions.more')} items={menuFor(tg)} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <ChipDetails
        tag={selected}
        cards={cards}
        members={members}
        isEmployee={isEmployee}
        error={selected ? error : ''}
        onClose={closeDetails}
        onLink={(cardId) =>
          selected &&
          act(
            () =>
              cardId
                ? authFetch(`/nfc/tags/${selected.id}/assign`, { method: 'POST', body: JSON.stringify({ cardId }) })
                : authFetch(`/nfc/tags/${selected.id}/unassign`, { method: 'POST' }),
            cardId ? t('toasts.linked') : t('toasts.unlinked'),
          ).catch(() => {})
        }
        onHolder={(userId) =>
          selected &&
          act(() => authFetch(`/nfc/tags/${selected.id}/holder`, { method: 'POST', body: JSON.stringify({ userId: userId || null }) }), t('toasts.holderSet')).catch(() => {})
        }
        onEnable={(enabled) => selected && setEnabled(selected, enabled)}
        onDelete={() => selected && setDeleting(selected)}
        onCopy={() => selected && copyLink(selected)}
        onTestTap={afterTestTap}
      />

      <AddChips open={adding} onClose={closeAdd} members={members} isEmployee={isEmployee} onAdded={() => load().catch(() => {})} />

      <ConfirmDialog
        open={deleting !== null}
        title={t('delete.title')}
        body={
          <>
            <span dir="ltr" className="font-mono text-ink">
              {deleting?.uid}
            </span>
            <p className="mt-1.5">{t('delete.body')}</p>
          </>
        }
        confirmLabel={t('actions.delete')}
        busyLabel={t('actions.deleting')}
        cancelLabel={t('actions.cancel')}
        danger
        onConfirm={async () => {
          if (!deleting) return;
          await authFetch(`/nfc/tags/${deleting.id}`, { method: 'DELETE' });
          if (selectedId === deleting.id) setSelectedId(null);
          setDeleting(null);
          await load();
          flash(t('toasts.deleted'));
        }}
        onCancel={closeDelete}
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            role="status"
            className="fixed inset-x-0 bottom-[calc(1.5rem+var(--v-dock,0px))] z-[110] mx-auto flex w-fit items-center gap-2 rounded-lg bg-[#17171a] px-3.5 py-2.5 text-sm font-medium text-white shadow-lg"
          >
            <Icon name="check" size={14} /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}

/** A serial that may wrap only between its colon groups, never inside one. */
function Serial({ uid }: { uid: string }) {
  const parts = uid.split(':');
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <>
              :<wbr />
            </>
          )}
          {part}
        </Fragment>
      ))}
    </>
  );
}

function StatusBadge({ status }: { status: NfcTag['status'] }) {
  const { t } = useTranslation('nfc');
  const cls = status === 'ACTIVE' ? 'v-badge-success' : status === 'DISABLED' ? 'v-badge-danger' : 'v-badge-neutral';
  return (
    <span className={`v-badge shrink-0 whitespace-nowrap ${cls}`}>
      {status === 'ACTIVE' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
      {t(`status.${status.toLowerCase()}`)}
    </span>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-faint">{hint}</span>}
    </label>
  );
}

/* ---------------------------------------------------------------------------
 * One chip: where it points, who carries it, its tap link, and the switches.
 * ------------------------------------------------------------------------- */
function ChipDetails({
  tag,
  cards,
  members,
  isEmployee,
  error,
  onClose,
  onLink,
  onHolder,
  onEnable,
  onDelete,
  onCopy,
  onTestTap,
}: {
  tag: NfcTag | null;
  cards: Card[];
  members: Member[];
  isEmployee: boolean;
  error: string;
  onClose: () => void;
  onLink: (cardId: string) => void;
  onHolder: (userId: string) => void;
  onEnable: (enabled: boolean) => void;
  onDelete: () => void;
  onCopy: () => void;
  onTestTap: () => void;
}) {
  const { t } = useTranslation('nfc');
  const { locale } = useLocale();

  return (
    <Sheet
      open={tag !== null}
      onClose={onClose}
      closeLabel={t('actions.close')}
      title={
        <span dir="ltr" className="font-mono">
          {tag?.uid}
        </span>
      }
      subtitle={
        tag && (
          <>
            {t(`hardwareType.${tag.hardwareType.toLowerCase()}`)}
            {tag.batchId && (
              <>
                {' · '}
                <span dir="ltr">{tag.batchId}</span>
              </>
            )}
            {' · '}
            {t('details.added', { date: formatDate(tag.createdAt, locale, { day: 'numeric', month: 'short', year: 'numeric' }) })}
          </>
        )
      }
      footer={
        tag &&
        !isEmployee && (
          <div className="flex items-center gap-2">
            <button onClick={() => onEnable(tag.status === 'DISABLED')} className="v-btn v-btn-ghost">
              <Icon name={tag.status === 'DISABLED' ? 'check' : 'eye-off'} size={14} />
              {tag.status === 'DISABLED' ? t('actions.enable') : t('actions.disable')}
            </button>
            <button onClick={onDelete} className="v-btn v-btn-ghost ms-auto !text-red-600 dark:!text-red-400">
              <Icon name="trash" size={14} /> {t('actions.delete')}
            </button>
          </div>
        )
      }
    >
      {tag && (
        <div className="space-y-5">
          {error && (
            <p role="alert" className="rounded-lg bg-red-500/[0.06] px-3 py-2.5 text-sm text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-300">
              {error}
            </p>
          )}

          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-line ring-1 ring-line">
            <div className="bg-surface px-3 py-2.5">
              <p className="text-xs text-faint">{t('details.status')}</p>
              <div className="mt-1">
                <StatusBadge status={tag.status} />
              </div>
            </div>
            <div className="bg-surface px-3 py-2.5">
              <p className="text-xs text-faint">{t('table.taps')}</p>
              <p className="tabular mt-0.5 text-md font-medium text-ink">{formatNumber(tag.activationCount ?? 0, locale)}</p>
            </div>
            <div className="bg-surface px-3 py-2.5">
              <p className="text-xs text-faint">{t('table.lastTap')}</p>
              <p className="mt-0.5 truncate text-sm text-ink">{tag.lastScanAt ? formatRelativeTime(tag.lastScanAt, locale, 'short') : t('table.never')}</p>
            </div>
          </div>

          {tag.status === 'DISABLED' && <p className="text-xs leading-relaxed text-muted">{t('details.disabledNote')}</p>}

          <Field label={t('details.opens')} hint={t('details.opensHint')}>
            <select className="v-field" value={tag.cardId ?? ''} onChange={(e) => onLink(e.target.value)}>
              <option value="">{t('details.noCard')}</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {cardName(c)} (/c/{c.slug})
                </option>
              ))}
            </select>
          </Field>

          {!isEmployee && members.length > 0 && (
            <Field label={t('details.holder')} hint={t('details.holderHint')}>
              <select className="v-field" value={tag.assignedUserId ?? ''} onChange={(e) => onHolder(e.target.value)}>
                <option value="">{t('details.noHolder')}</option>
                {members.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name || m.user.email}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div>
            <p className="mb-1.5 text-xs text-muted">{t('details.tapLink')}</p>
            <div className="flex items-center gap-2">
              <span dir="ltr" className="flex h-9 min-w-0 flex-1 items-center truncate rounded-lg bg-elevated px-3 font-mono text-xs text-muted ring-1 ring-inset ring-line rtl:text-right">
                {tapUrl(tag.uid)}
              </span>
              <button onClick={onCopy} className="v-btn v-btn-ghost shrink-0 !h-11 sm:!h-9">
                <Icon name="copy" size={13} /> {t('actions.copy')}
              </button>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-faint">{t('details.tapLinkHint')}</p>
            <a href={tapUrl(tag.uid)} target="_blank" rel="noreferrer" onClick={onTestTap} className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-accent hover:underline sm:min-h-0">
              <Icon name="external-link" size={13} /> {t('actions.testTap')}
            </a>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/* ---------------------------------------------------------------------------
 * Bringing chips in: tap them on an Android phone, type a serial, or paste a
 * delivery list. Only chips the platform issued to this workspace are accepted.
 * ------------------------------------------------------------------------- */
function AddChips({
  open,
  onClose,
  members,
  isEmployee,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  members: Member[];
  isEmployee: boolean;
  onAdded: () => void;
}) {
  const { t } = useTranslation('nfc');
  const [mode, setMode] = useState<'tap' | 'type' | 'paste'>('tap');
  const [hardware, setHardware] = useState<Hardware>('CARD');
  const [batchId, setBatchId] = useState('');
  const [holder, setHolder] = useState('');
  const [uid, setUid] = useState('');
  const [uids, setUids] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ created: number; requested: number; rejected: { uid: string; reason: string }[] } | null>(null);
  const [log, setLog] = useState<{ uid: string; ok: boolean; message?: string }[]>([]);

  // The reader keeps running between taps, so it reads settings through a ref.
  const settings = useRef({ hardware, batchId, holder });
  settings.current = { hardware, batchId, holder };

  const claim = useCallback(
    async (serial: string) => {
      try {
        await authFetch('/nfc/tags', {
          method: 'POST',
          body: JSON.stringify({
            uid: serial,
            hardwareType: settings.current.hardware,
            batchId: settings.current.batchId || undefined,
            assignedUserId: settings.current.holder || undefined,
          }),
        });
        setLog((prev) => [{ uid: serial, ok: true }, ...prev]);
        onAdded();
      } catch (e) {
        setLog((prev) => [{ uid: serial, ok: false, message: (e as Error).message }, ...prev]);
      }
    },
    [onAdded],
  );
  const scanner = useNfcScanner((serial) => void claim(serial));

  // Where a phone cannot read chips, open on typing instead of a dead end.
  useEffect(() => {
    if (open && scanner.blocker !== 'none' && mode === 'tap') setMode('type');
    // Only when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!open && scanner.scanning) scanner.stop();
  }, [open, scanner]);

  async function addOne(e: React.FormEvent) {
    e.preventDefault();
    if (!uid.trim()) return;
    setBusy(true);
    setError('');
    try {
      await authFetch('/nfc/tags', {
        method: 'POST',
        body: JSON.stringify({ uid: uid.trim(), hardwareType: hardware, batchId: batchId || undefined, assignedUserId: holder || undefined }),
      });
      setLog((prev) => [{ uid: uid.trim(), ok: true }, ...prev]);
      setUid('');
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addMany(e: React.FormEvent) {
    e.preventDefault();
    const list = uids.split(/\s*\n\s*/).map((s) => s.trim()).filter(Boolean);
    if (!list.length) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const res = await authFetch<{ created: number; requested: number; rejected?: { uid: string; reason: string }[] }>('/nfc/tags/batch', {
        method: 'POST',
        body: JSON.stringify({ uids: list, hardwareType: hardware, batchId: batchId || undefined, assignedUserId: holder || undefined }),
      });
      setResult({ created: res.created, requested: res.requested, rejected: res.rejected ?? [] });
      if (res.created > 0) {
        setUids('');
        onAdded();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const modes = (['tap', 'type', 'paste'] as const).filter((m) => m !== 'paste' || !isEmployee);

  return (
    <Sheet open={open} onClose={onClose} closeLabel={t('actions.close')} title={t('addSheet.title')} subtitle={t('addSheet.subtitle')}>
      <div className="space-y-5">
        <div role="radiogroup" aria-label={t('addSheet.how')} className="flex rounded-lg bg-elevated p-0.5 ring-1 ring-inset ring-line">
          {modes.map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              onClick={() => {
                setMode(m);
                setError('');
              }}
              className={`h-11 flex-1 rounded-md px-3 text-xs font-medium transition-colors sm:h-8 ${
                mode === m ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'
              }`}
            >
              {t(`addSheet.modes.${m}`)}
            </button>
          ))}
        </div>

        {/* Shared details for whatever comes in next. */}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('addSheet.hardware')}>
            <select className="v-field" value={hardware} onChange={(e) => setHardware(e.target.value as Hardware)}>
              {HARDWARE.map((h) => (
                <option key={h} value={h}>
                  {t(`hardwareType.${h.toLowerCase()}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('addSheet.batch')}>
            <input dir="ltr" className="v-field rtl:text-right" value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder={t('addSheet.batchPlaceholder')} />
          </Field>
        </div>
        {!isEmployee && members.length > 0 && (
          <Field label={t('addSheet.holder')}>
            <select className="v-field" value={holder} onChange={(e) => setHolder(e.target.value)}>
              <option value="">{t('details.noHolder')}</option>
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name || m.user.email}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="border-t border-line pt-5">
          {mode === 'tap' &&
            (scanner.blocker !== 'none' ? (
              <p className="rounded-lg bg-elevated px-3.5 py-3 text-sm leading-relaxed text-muted ring-1 ring-inset ring-line">
                {scanner.blocker === 'insecure' ? t('addSheet.tap.insecure') : t('addSheet.tap.unsupported')}
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-muted">{t('addSheet.tap.hint')}</p>
                {scanner.scanning ? (
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-2 text-sm font-medium text-accent">
                      <Icon name="loader" size={14} className="animate-spin" /> {t('addSheet.tap.listening')}
                    </span>
                    <button onClick={scanner.stop} className="v-btn v-btn-ghost ms-auto">
                      {t('addSheet.tap.stop')}
                    </button>
                  </div>
                ) : (
                  <button onClick={scanner.start} className="v-btn w-full">
                    {t('addSheet.tap.start')}
                  </button>
                )}
                {scanner.error && scanner.error !== 'read' && <p className="text-xs text-red-600 dark:text-red-400">{scanner.error}</p>}
              </div>
            ))}

          {mode === 'type' && (
            <form onSubmit={addOne} className="space-y-3">
              <Field label={t('addSheet.type.uid')} hint={t('addSheet.type.hint')}>
                <input dir="ltr" className="v-field font-mono rtl:text-right" value={uid} onChange={(e) => setUid(e.target.value)} placeholder="04:A1:B2:C3:D4:E5:F6" required />
              </Field>
              <button disabled={busy || !uid.trim()} className="v-btn w-full disabled:opacity-60">
                {busy ? t('addSheet.adding') : t('addSheet.type.add')}
              </button>
            </form>
          )}

          {mode === 'paste' && (
            <form onSubmit={addMany} className="space-y-3">
              <Field label={t('addSheet.paste.uids')} hint={t('addSheet.paste.hint')}>
                <textarea
                  dir="ltr"
                  rows={6}
                  className="v-field !h-auto py-2 font-mono !text-xs rtl:text-right"
                  value={uids}
                  onChange={(e) => setUids(e.target.value)}
                  placeholder={'04:A1:B2:C3:D4:E5:01\n04:A1:B2:C3:D4:E5:02'}
                />
              </Field>
              <button disabled={busy || !uids.trim()} className="v-btn w-full disabled:opacity-60">
                {busy ? t('addSheet.adding') : t('addSheet.paste.add')}
              </button>
              {result && (
                <div className="rounded-lg bg-elevated px-3.5 py-3 text-sm ring-1 ring-inset ring-line">
                  <p className="text-ink">{t('addSheet.paste.result', { created: result.created, requested: result.requested })}</p>
                  {result.rejected.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-muted">
                      {result.rejected.map((r) => (
                        <li key={r.uid} className="flex flex-wrap gap-x-2">
                          <span dir="ltr" className="font-mono text-ink">
                            {r.uid}
                          </span>
                          <span>{t(`addSheet.paste.reasons.${r.reason}`, r.reason)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </form>
          )}

          {error && <p role="alert" className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>

        {log.length > 0 && mode !== 'paste' && (
          <div>
            <p className="mb-2 text-xs font-medium text-ink">{t('addSheet.log')}</p>
            <ul className="max-h-48 space-y-1.5 overflow-y-auto">
              {log.map((x, i) => (
                <li key={`${x.uid}-${i}`} className="flex items-start gap-2 text-xs">
                  <Icon name={x.ok ? 'check' : 'x'} size={13} className={`mt-0.5 shrink-0 ${x.ok ? 'text-emerald-600' : 'text-red-600'}`} />
                  <span className="min-w-0">
                    <span dir="ltr" className="font-mono text-ink">
                      {x.uid}
                    </span>
                    <span className="ms-2 text-muted">{x.ok ? t('addSheet.added') : x.message}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** No chips yet: what they are for, and how to bring the first ones in. */
function FirstChip({ onAdd }: { onAdd: () => void }) {
  const { t } = useTranslation('nfc');
  const steps = ['add', 'link', 'tap'] as const;
  return (
    <div className="mx-auto mt-6 max-w-[560px] rounded-xl px-6 py-10 text-center ring-1 ring-inset ring-line">
      <h2 className="text-lg font-semibold text-ink">{t('first.title')}</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{t('first.body')}</p>
      <ol className="mx-auto mt-6 grid max-w-md gap-2 text-start sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s} className="flex items-start gap-2.5 rounded-lg bg-elevated px-3 py-2.5 text-xs text-muted ring-1 ring-inset ring-line sm:flex-col sm:gap-1.5">
            <span className="tabular flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface text-2xs font-medium text-ink ring-1 ring-line">{i + 1}</span>
            {t(`first.steps.${s}`)}
          </li>
        ))}
      </ol>
      <button onClick={onAdd} className="v-btn mt-6">
        <Icon name="plus" size={14} /> {t('add')}
      </button>
    </div>
  );
}
