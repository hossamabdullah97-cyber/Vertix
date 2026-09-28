'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { authFetch, createBlankCard, getToken, type Card, type Member, type NfcTag } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import { readableOn, shade } from '@/lib/color';
import { Icon, actionIcon } from '@/components/Icon';
import AppShell from '@/components/AppShell';
import { ActionMenu, type ActionItem } from '@/components/ui/ActionMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

/** The list endpoint returns a little more than the shared Card type declares. */
type ListCard = Card & { updatedAt?: string; _count?: { variants: number } };
/** All-time event counts for one card, from /analytics/cards/:id. */
type CardStats = { VIEW: number; CLICK: number; SAVE: number; SHARE: number; NFC_SCAN: number };
type Status = 'all' | 'live' | 'draft';
type Sort = 'updated' | 'created' | 'name' | 'views';
type Layout = 'grid' | 'table';

const LAYOUT_KEY = 'vertex_cards_layout';
const STATS_CONCURRENCY = 4;

const nameOf = (c: Card) => ((c.vcardData?.fullName as string) || '').trim();
const roleOf = (c: Card) =>
  [(c.vcardData?.title as string) || '', (c.vcardData?.org as string) || ''].filter(Boolean).join(' · ');
const editedAt = (c: ListCard) => c.updatedAt ?? c.createdAt;

export default function CardsPage() {
  const router = useRouter();
  const { t } = useTranslation('cards');
  const { locale } = useLocale();

  const [cards, setCards] = useState<ListCard[] | null>(null);
  const [stats, setStats] = useState<Record<string, CardStats | null>>({});
  const [leadsBySlug, setLeadsBySlug] = useState<Record<string, number> | null>(null);
  const [chipsByCard, setChipsByCard] = useState<Record<string, number> | null>(null);
  const [owners, setOwners] = useState<Record<string, Member['user']>>({});
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ListCard | null>(null);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [sort, setSort] = useState<Sort>('updated');
  const [layout, setLayout] = useState<Layout>('grid');

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }

  /** Straight into the guided start: the card exists before any questions. */
  const startNewCard = async () => {
    if (creating) return;
    setCreating(true);
    setError('');
    try {
      const card = await createBlankCard();
      router.push(`/cards/${card.id}`);
    } catch (e) {
      // Usually the plan's card limit; the API says which.
      setError((e as Error).message);
      setCreating(false);
    }
  };

  // `?new=1` starts a card straight away. The Home checklist links here so
  // "Create your card" creates one; `replace` means Back never makes a second.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !getToken()) return;
    if (new URLSearchParams(window.location.search).get('new') !== '1') return;
    autoStarted.current = true;
    createBlankCard()
      .then((card) => router.replace(`/cards/${card.id}`))
      .catch(() => router.replace('/cards'));
  }, [router]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_KEY);
      if (saved === 'grid' || saved === 'table') setLayout(saved);
    } catch {
      // no storage: stay on the grid
    }
  }, []);

  function chooseLayout(next: Layout) {
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // the choice still holds for this visit
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    authFetch<ListCard[]>('/cards')
      .then(setCards)
      .catch((e) => setError(e.message));

    // Counts that live elsewhere. Each is optional: a role that cannot read
    // leads or members simply does not see that column.
    authFetch<{ card: { slug: string } | null }[]>('/leads')
      .then((leads) => {
        const by: Record<string, number> = {};
        for (const l of leads) if (l.card?.slug) by[l.card.slug] = (by[l.card.slug] ?? 0) + 1;
        setLeadsBySlug(by);
      })
      .catch(() => setLeadsBySlug(null));
    authFetch<NfcTag[]>('/nfc/tags')
      .then((tags) => {
        const by: Record<string, number> = {};
        for (const tag of tags) if (tag.cardId && tag.status !== 'DISABLED') by[tag.cardId] = (by[tag.cardId] ?? 0) + 1;
        setChipsByCard(by);
      })
      .catch(() => setChipsByCard(null));
    authFetch<Member[]>('/orgs/members')
      .then((members) => setOwners(Object.fromEntries(members.map((m) => [m.user.id, m.user]))))
      .catch(() => setOwners({}));
  }, [router]);

  // Per-card numbers, a few requests at a time so a large workspace does not
  // fire a hundred at once. A failed card shows a dash, not a zero.
  useEffect(() => {
    if (!cards?.length) return;
    let cancelled = false;
    const queue = cards.map((c) => c.id).filter((id) => !(id in stats));
    const worker = async () => {
      while (!cancelled && queue.length) {
        const id = queue.shift()!;
        const s = await authFetch<CardStats>(`/analytics/cards/${id}`).catch(() => null);
        if (!cancelled) setStats((prev) => ({ ...prev, [id]: s }));
      }
    };
    Array.from({ length: STATS_CONCURRENCY }, worker);
    return () => {
      cancelled = true;
    };
    // Only a new set of cards needs fetching; `stats` is read to skip known ones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  const counts = useMemo(
    () => ({
      all: cards?.length ?? 0,
      live: cards?.filter((c) => c.isPublished).length ?? 0,
      draft: cards?.filter((c) => !c.isPublished).length ?? 0,
    }),
    [cards],
  );

  const shown = useMemo(() => {
    if (!cards) return [];
    const q = query.trim().toLowerCase();
    return cards
      .filter((c) => (status === 'all' ? true : status === 'live' ? c.isPublished : !c.isPublished))
      .filter((c) => !q || `${nameOf(c)} ${roleOf(c)} ${c.slug}`.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sort === 'name') return (nameOf(a) || a.slug).localeCompare(nameOf(b) || b.slug, locale);
        if (sort === 'views') return (stats[b.id]?.VIEW ?? -1) - (stats[a.id]?.VIEW ?? -1);
        const key = sort === 'created' ? (c: ListCard) => c.createdAt : editedAt;
        return new Date(key(b)).getTime() - new Date(key(a)).getTime();
      });
  }, [cards, query, status, sort, stats, locale]);

  // Only worth a column when more than one person owns cards here.
  const showOwner = useMemo(() => new Set(cards?.map((c) => c.ownerId)).size > 1 && Object.keys(owners).length > 0, [cards, owners]);

  const totalViews = useMemo(
    () => (cards ?? []).reduce((sum, c) => sum + (stats[c.id]?.VIEW ?? 0), 0),
    [cards, stats],
  );
  const statsReady = !!cards && cards.every((c) => c.id in stats);

  async function copyLink(card: ListCard) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/c/${card.slug}`);
      flash(t('toasts.linkCopied'));
    } catch {
      flash(t('toasts.copyFailed'));
    }
  }

  async function setPublished(card: ListCard, isPublished: boolean) {
    setCards((prev) => prev?.map((c) => (c.id === card.id ? { ...c, isPublished } : c)) ?? prev);
    try {
      await authFetch(`/cards/${card.id}`, { method: 'PATCH', body: JSON.stringify({ isPublished }) });
      flash(isPublished ? t('toasts.published') : t('toasts.unpublished'));
    } catch (e) {
      setCards((prev) => prev?.map((c) => (c.id === card.id ? { ...c, isPublished: !isPublished } : c)) ?? prev);
      setError((e as Error).message);
    }
  }

  async function remove(card: ListCard) {
    await authFetch(`/cards/${card.id}`, { method: 'DELETE' });
    setCards((prev) => prev?.filter((c) => c.id !== card.id) ?? prev);
    setDeleting(null);
    flash(t('toasts.deleted'));
  }

  const closeDelete = useCallback(() => setDeleting(null), []);

  const filtersActive = query.trim() !== '' || status !== 'all';
  const clearFilters = () => {
    setQuery('');
    setStatus('all');
  };

  const rowProps = (card: ListCard): RowProps => ({
    card,
    stats: card.id in stats ? stats[card.id] : undefined,
    leads: leadsBySlug ? leadsBySlug[card.slug] ?? 0 : null,
    chips: chipsByCard ? chipsByCard[card.id] ?? 0 : null,
    owner: showOwner ? owners[card.ownerId] ?? null : undefined,
    onCopy: () => copyLink(card),
    onPublish: (v) => setPublished(card, v),
    onDelete: () => setDeleting(card),
  });

  return (
    <AppShell
      title={t('title')}
      fluid
      action={
        <button onClick={startNewCard} disabled={creating} className="v-btn">
          <Icon name={creating ? 'loader' : 'plus'} size={14} className={creating ? 'animate-spin' : undefined} />
          {t('newCard')}
        </button>
      }
    >
      {cards && cards.length > 0 && (
        <p className="text-[14px] text-muted">
          <span className="font-medium text-ink">{t('summary.cards', { count: counts.all })}</span>
          <span className="mx-2 text-faint" aria-hidden>
            ·
          </span>
          {t('summary.live', { count: counts.live })}
          {statsReady && (
            <>
              <span className="mx-2 text-faint" aria-hidden>
                ·
              </span>
              {t('summary.views', { count: totalViews, value: formatNumber(totalViews, locale) })}
            </>
          )}
        </p>
      )}

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-3 rounded-lg bg-red-500/[0.06] px-4 py-3 text-[13px] text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-300">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} aria-label={t('actions.dismiss')} className="-m-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-red-500/10">
            <Icon name="x" size={13} />
          </button>
        </div>
      )}

      {cards === null ? (
        <GridSkeleton />
      ) : cards.length === 0 ? (
        <FirstCard onCreate={startNewCard} creating={creating} />
      ) : (
        <>
          <nav role="tablist" aria-label={t('filters.status')} className="no-scrollbar -mx-5 mt-4 flex gap-5 overflow-x-auto border-b border-line px-5 md:-mx-8 md:px-8">
            {(['all', 'live', 'draft'] as const).map((s) => {
              const active = status === s;
              return (
                <button
                  key={s}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStatus(s)}
                  className={`relative flex min-h-11 shrink-0 items-center gap-1.5 text-[13.5px] font-medium transition-colors sm:min-h-10 ${
                    active ? 'text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {t(`filters.${s}`)}
                  <span className="tabular text-[12px] text-faint">{counts[s]}</span>
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
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('search')}
                className="v-field !ps-8 !text-[13px] sm:!h-8"
              />
            </label>
            <label className="flex items-center gap-2 text-[12.5px] text-faint">
              <span className="hidden sm:inline">{t('sort.label')}</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                aria-label={t('sort.label')}
                className="v-field !h-11 !w-auto !py-0 !pe-8 !text-[13px] sm:!h-8"
              >
                <option value="updated">{t('sort.updated')}</option>
                <option value="created">{t('sort.created')}</option>
                <option value="name">{t('sort.name')}</option>
                <option value="views">{t('sort.views')}</option>
              </select>
            </label>
            {filtersActive && (
              <>
                <span className="text-[12.5px] text-faint">{t('results', { count: shown.length })}</span>
                <button onClick={clearFilters} className="min-h-11 text-[12.5px] font-medium text-accent hover:underline sm:min-h-0">
                  {t('clearFilters')}
                </button>
              </>
            )}
            <div role="radiogroup" aria-label={t('layout.label')} className="ms-auto inline-flex rounded-lg bg-elevated p-0.5 ring-1 ring-inset ring-line">
              {(['grid', 'table'] as const).map((l) => (
                <button
                  key={l}
                  role="radio"
                  aria-checked={layout === l}
                  onClick={() => chooseLayout(l)}
                  className={`flex h-11 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors sm:h-7 ${
                    layout === l ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'
                  }`}
                >
                  <Icon name={l === 'grid' ? 'grid' : 'list'} size={13} />
                  {t(`layout.${l}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            {shown.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-6 py-14 text-center">
                <p className="text-[13.5px] text-muted">{query.trim() ? t('empty.noMatchFor', { query: query.trim() }) : t('empty.noMatch')}</p>
                <button onClick={clearFilters} className="v-btn v-btn-ghost">
                  {t('clearFilters')}
                </button>
              </div>
            ) : layout === 'grid' ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {shown.map((card) => (
                  <CardTile key={card.id} {...rowProps(card)} />
                ))}
              </div>
            ) : (
              <CardsTable rows={shown.map(rowProps)} showOwner={showOwner} />
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? t('delete.title', { name: nameOf(deleting) || deleting.slug }) : ''}
        body={t('delete.body')}
        confirmLabel={t('actions.delete')}
        busyLabel={t('actions.deleting')}
        cancelLabel={t('actions.cancel')}
        danger
        onConfirm={() => (deleting ? remove(deleting) : undefined)}
        onCancel={closeDelete}
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            role="status"
            className="fixed inset-x-0 bottom-6 z-[60] mx-auto flex w-fit items-center gap-2 rounded-lg bg-[#17171a] px-3.5 py-2.5 text-[13px] font-medium text-white shadow-lg"
          >
            <Icon name="check" size={14} /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}

interface RowProps {
  card: ListCard;
  /** undefined while loading, null when it could not be read. */
  stats: CardStats | null | undefined;
  /** null when this role cannot read leads or chips. */
  leads: number | null;
  chips: number | null;
  /** undefined when the owner column is not shown. */
  owner?: Member['user'] | null;
  onCopy: () => void;
  onPublish: (isPublished: boolean) => void;
  onDelete: () => void;
}

/* ---------------------------------------------------------------------------
 * The card's face, drawn small in its own colours: the thing people will
 * recognise faster than a name.
 * ------------------------------------------------------------------------- */
function CardFace({ card, compact = false }: { card: ListCard; compact?: boolean }) {
  const { t } = useTranslation('cards');
  const accent = /^#[0-9a-f]{6}$/i.test((card.theme?.accent as string) ?? '') ? (card.theme!.accent as string) : '#2563eb';
  const dark = card.theme?.mode === 'dark';
  const cover = (card.theme?.cover as string) || (dark ? 'constellation' : 'gradient');
  const coverImage = card.vcardData?.coverImage as string | undefined;
  const avatar = card.vcardData?.avatar as string | undefined;
  const name = nameOf(card);
  const role = roleOf(card);
  const actions = (card.actions ?? []).filter((a) => a.isActive).sort((a, b) => a.order - b.order);
  const face = dark ? { bg: '#0e0e12', fg: '#fafafa', muted: '#a1a1aa', edge: '#26262e' } : { bg: '#ffffff', fg: '#0a0a0a', muted: '#71717a', edge: '#e7e5e4' };

  const coverStyle: React.CSSProperties = coverImage
    ? { background: `url("${coverImage}") center/cover no-repeat` }
    : cover === 'solid'
      ? { background: accent }
      : cover === 'constellation'
        ? { background: `radial-gradient(90% 140% at 80% 0%, ${accent}66, transparent 70%), #0b0b0e` }
        : { background: `linear-gradient(135deg, ${accent}, ${shade(accent, -46)})` };

  if (compact) {
    return (
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[12px] font-semibold" style={{ background: accent, color: readableOn(accent) }} aria-hidden>
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        ) : (
          (name || card.slug).charAt(0).toUpperCase()
        )}
      </span>
    );
  }

  return (
    // The face reads in the card's own language, whatever the dashboard's is.
    <div
      dir={card.theme?.lang === 'ar' ? 'rtl' : 'ltr'}
      className="relative aspect-[1.7] overflow-hidden rounded-lg"
      style={{ background: face.bg, boxShadow: `inset 0 0 0 1px ${face.edge}` }}
      aria-hidden
    >
      <div className="h-[38%]" style={coverStyle} />
      <div className="absolute inset-x-0 bottom-0 top-[38%] flex flex-col px-[7%] pb-[6%]">
        <span
          className="-mt-[22px] flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-[15px] font-semibold"
          style={{ background: accent, color: readableOn(accent), boxShadow: `0 0 0 2.5px ${face.bg}` }}
        >
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            (name || card.slug).charAt(0).toUpperCase()
          )}
        </span>
        <p className="mt-2 truncate text-[14px] font-semibold leading-tight" style={{ color: face.fg }}>
          {name || t('untitled')}
        </p>
        <p className="mt-0.5 truncate text-[12px]" style={{ color: face.muted }}>
          {role || ' '}
        </p>
        <div className="mt-auto flex items-center gap-1.5" style={{ color: face.muted }}>
          {actions.slice(0, 5).map((a) => (
            <span key={a.id} className="flex h-6 w-6 items-center justify-center rounded-full" style={{ boxShadow: `inset 0 0 0 1px ${face.edge}` }}>
              <Icon name={actionIcon(a.type)} size={11} />
            </span>
          ))}
          {actions.length > 5 && <span className="tabular text-[11px]">+{actions.length - 5}</span>}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ live }: { live: boolean }) {
  const { t } = useTranslation('cards');
  return live ? (
    <span className="v-badge v-badge-success shrink-0">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {t('status.live')}
    </span>
  ) : (
    <span className="v-badge v-badge-neutral shrink-0">{t('status.draft')}</span>
  );
}

/** A number that may still be loading (undefined) or be unavailable (null). */
function Num({ value }: { value: number | null | undefined }) {
  const { locale } = useLocale();
  if (value === undefined) return <span className="v-skeleton inline-block h-3.5 w-7 align-middle" />;
  if (value === null) return <span className="text-faint">—</span>;
  return <>{formatNumber(value, locale)}</>;
}

function CardTile({ card, stats, leads, chips, owner, onCopy, onPublish, onDelete }: RowProps) {
  const { t } = useTranslation('cards');
  const { locale } = useLocale();
  const metrics: { key: string; value: number | null | undefined }[] = [
    { key: 'views', value: stats === undefined ? undefined : stats?.VIEW ?? null },
    { key: 'taps', value: stats === undefined ? undefined : stats?.NFC_SCAN ?? null },
    { key: 'leads', value: leads },
  ];

  return (
    <article className="group relative flex flex-col rounded-xl bg-surface p-2 ring-1 ring-inset ring-line transition-shadow hover:ring-[hsl(var(--v-border-strong))]">
      <Link href={`/cards/${card.id}`} className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label={t('actions.openNamed', { name: nameOf(card) || card.slug })}>
        <CardFace card={card} />
      </Link>

      <div className="flex items-center gap-2 px-1.5 pt-3">
        <span dir="ltr" className="min-w-0 flex-1 truncate font-mono text-[12px] text-faint rtl:text-right">
          /c/{card.slug}
        </span>
        <StatusBadge live={card.isPublished} />
        <RowMenu card={card} onCopy={onCopy} onPublish={onPublish} onDelete={onDelete} />
      </div>

      <dl className="mx-1.5 mt-3 grid grid-cols-3 border-t border-line pt-3">
        {metrics.map((m) => (
          <div key={m.key} className="min-w-0">
            <dt className="text-[11.5px] text-faint">{t(`metrics.${m.key}`)}</dt>
            <dd className="tabular mt-0.5 text-[15px] font-medium text-ink">
              <Num value={m.value} />
            </dd>
          </div>
        ))}
      </dl>

      <p className="mx-1.5 mb-1 mt-3 flex items-center gap-1.5 text-[12px] text-faint">
        {owner && (
          <>
            <span className="truncate text-muted">{owner.name || owner.email}</span>
            <span aria-hidden>·</span>
          </>
        )}
        <span className="shrink-0">{t('edited', { when: formatRelativeTime(editedAt(card), locale) })}</span>
        {chips !== null && chips > 0 && (
          <>
            <span aria-hidden>·</span>
            <span className="shrink-0">{t('chips', { count: chips })}</span>
          </>
        )}
      </p>
    </article>
  );
}

function CardsTable({ rows, showOwner }: { rows: RowProps[]; showOwner: boolean }) {
  const { t } = useTranslation('cards');
  const { locale } = useLocale();
  const router = useRouter();
  return (
    <div className="v-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="v-table">
          <thead>
            <tr>
              <th>{t('table.card')}</th>
              <th>{t('table.status')}</th>
              {showOwner && <th className="hidden md:table-cell">{t('table.owner')}</th>}
              <th className="!text-end">{t('metrics.views')}</th>
              <th className="hidden !text-end sm:table-cell">{t('metrics.taps')}</th>
              <th className="hidden !text-end sm:table-cell">{t('metrics.leads')}</th>
              <th className="hidden !text-end lg:table-cell">{t('table.chips')}</th>
              <th className="hidden lg:table-cell">{t('table.edited')}</th>
              <th className="w-12">
                <span className="sr-only">{t('table.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ card, stats, leads, chips, owner, onCopy, onPublish, onDelete }) => (
              <tr
                key={card.id}
                tabIndex={0}
                onClick={() => router.push(`/cards/${card.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target === e.currentTarget) router.push(`/cards/${card.id}`);
                }}
                className="cursor-pointer outline-none focus-visible:[&>td]:bg-elevated"
              >
                <td className="w-full max-w-0">
                  <span className="flex items-center gap-3">
                    <CardFace card={card} compact />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{nameOf(card) || t('untitled')}</span>
                      <span dir="ltr" className="block truncate text-start font-mono text-[12px] text-faint rtl:text-right">
                        /c/{card.slug}
                      </span>
                    </span>
                  </span>
                </td>
                <td>
                  <StatusBadge live={card.isPublished} />
                </td>
                {showOwner && <td className="hidden whitespace-nowrap text-muted md:table-cell">{owner ? owner.name || owner.email : '—'}</td>}
                <td className="text-end">
                  <Num value={stats === undefined ? undefined : stats?.VIEW ?? null} />
                </td>
                <td className="hidden text-end sm:table-cell">
                  <Num value={stats === undefined ? undefined : stats?.NFC_SCAN ?? null} />
                </td>
                <td className="hidden text-end sm:table-cell">
                  <Num value={leads} />
                </td>
                <td className="hidden text-end lg:table-cell">
                  <Num value={chips} />
                </td>
                <td className="hidden whitespace-nowrap text-muted lg:table-cell">{formatRelativeTime(editedAt(card), locale, 'short')}</td>
                <td onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <RowMenu card={card} onCopy={onCopy} onPublish={onPublish} onDelete={onDelete} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Everything else you can do to a card, behind one button. */
function RowMenu({
  card,
  onCopy,
  onPublish,
  onDelete,
}: {
  card: ListCard;
  onCopy: () => void;
  onPublish: (isPublished: boolean) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation('cards');
  const items: ActionItem[] = [
    { key: 'edit', label: t('actions.edit'), icon: 'settings', href: `/cards/${card.id}` },
    ...(card.isPublished ? [{ key: 'view', label: t('actions.view'), icon: 'external-link', externalHref: `/c/${card.slug}` }] : []),
    { key: 'copy', label: t('actions.copyLink'), icon: 'copy', onSelect: onCopy },
    {
      key: 'publish',
      label: card.isPublished ? t('actions.unpublish') : t('actions.publish'),
      icon: card.isPublished ? 'eye-off' : 'globe',
      onSelect: () => onPublish(!card.isPublished),
    },
    { key: 'delete', label: t('actions.delete'), icon: 'trash', onSelect: onDelete, danger: true, separated: true },
  ];
  return <ActionMenu label={t('actions.more')} items={items} />;
}

function GridSkeleton() {
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl p-2 ring-1 ring-inset ring-line">
          <div className="v-skeleton aspect-[1.7] w-full rounded-lg" />
          <div className="v-skeleton mx-1.5 mt-3 h-4 w-2/3" />
          <div className="v-skeleton mx-1.5 mb-1 mt-4 h-9" />
        </div>
      ))}
    </div>
  );
}

/** No cards yet: say what a card is for and make the first one a click away. */
function FirstCard({ onCreate, creating }: { onCreate: () => void; creating: boolean }) {
  const { t } = useTranslation('cards');
  const steps = ['details', 'look', 'share'] as const;
  return (
    <div className="mx-auto mt-6 max-w-[560px] rounded-xl px-6 py-10 text-center ring-1 ring-inset ring-line">
      <h2 className="text-[17px] font-semibold text-ink">{t('first.title')}</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-muted">{t('first.body')}</p>
      <ol className="mx-auto mt-6 grid max-w-md gap-2 text-start sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s} className="flex items-start gap-2.5 rounded-lg bg-elevated px-3 py-2.5 text-[12.5px] text-muted ring-1 ring-inset ring-line sm:flex-col sm:gap-1.5">
            <span className="tabular flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface text-[11px] font-medium text-ink ring-1 ring-line">{i + 1}</span>
            {t(`first.steps.${s}`)}
          </li>
        ))}
      </ol>
      <button onClick={onCreate} disabled={creating} className="v-btn mt-6">
        <Icon name={creating ? 'loader' : 'plus'} size={14} className={creating ? 'animate-spin' : undefined} />
        {t('newCard')}
      </button>
    </div>
  );
}
