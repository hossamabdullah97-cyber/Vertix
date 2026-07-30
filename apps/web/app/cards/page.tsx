'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { authFetch, getToken, type Card } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatDate } from '@/lib/format';
import { Icon, actionIcon } from '@/components/Icon';
import AppShell from '@/components/AppShell';
import NewCardModal from '@/components/NewCardModal';

const BRANDS_COLORS: Record<string, string> = {
  SAVE_CONTACT: '#1d4ed8',
  WHATSAPP: '#25d366',
  CALL: '#10b981',
  EMAIL: '#ef4444',
  LINKEDIN: '#0a66c2',
  WEBSITE: '#2563eb',
  BOOK_MEETING: '#f59e0b',
  REQUEST_QUOTE: '#0ea5e9',
  MAPS: '#f43f5e',
  FILE: '#64748b',
};

export default function CardsPage() {
  const router = useRouter();
  const { t } = useTranslation('cards');
  const { locale } = useLocale();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter, Search, and Sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LIVE' | 'DRAFT'>('ALL');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name-asc' | 'name-desc'>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Toast feedback state
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    authFetch<Card[]>('/cards')
      .then(setCards)
      .catch((e) => setError(e.message));
  }, [router]);

  const handleDelete = async (cardId: string) => {
    setIsDeleting(true);
    try {
      await authFetch(`/cards/${cardId}`, { method: 'DELETE' });
      setCards((prev) => (prev ? prev.filter((c) => c.id !== cardId) : prev));
      setDeletingId(null);
      triggerToast(t('toasts.deleted'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsDeleting(false);
    }
  };

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  };

  const copyToClipboard = (e: React.MouseEvent, slug: string) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/c/${slug}`;
    navigator.clipboard.writeText(url)
      .then(() => triggerToast(t('toasts.linkCopied')))
      .catch(() => triggerToast(t('toasts.copyFailed')));
  };

  // 1. Calculate statistics
  const stats = {
    total: cards?.length ?? 0,
    live: cards?.filter((c) => c.isPublished).length ?? 0,
    draft: cards?.filter((c) => !c.isPublished).length ?? 0,
  };

  // 2. Filter and Sort cards
  const filteredAndSortedCards = cards
    ? cards
        .filter((card) => {
          const fullName = (card.vcardData?.fullName as string) ?? '';
          const matchSearch =
            fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            card.slug.toLowerCase().includes(searchQuery.toLowerCase());
          
          const matchStatus =
            statusFilter === 'ALL' ||
            (statusFilter === 'LIVE' && card.isPublished) ||
            (statusFilter === 'DRAFT' && !card.isPublished);

          return matchSearch && matchStatus;
        })
        .sort((a, b) => {
          if (sortBy === 'newest') {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          }
          if (sortBy === 'oldest') {
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          }
          const nameA = ((a.vcardData?.fullName as string) || a.slug).toLowerCase();
          const nameB = ((b.vcardData?.fullName as string) || b.slug).toLowerCase();
          if (sortBy === 'name-asc') {
            return nameA.localeCompare(nameB);
          }
          if (sortBy === 'name-desc') {
            return nameB.localeCompare(nameA);
          }
          return 0;
        })
    : [];

  return (
    <AppShell
      title={t('title', 'Digital Business Cards')}
      action={
        <button
          onClick={() => setOpen(true)}
          className="v-btn flex items-center gap-2 px-5 !h-10 text-sm font-semibold"
        >
          <Icon name="plus" size={16} />
          {t('createCard', 'Create Card')}
        </button>
      }
    >
      <NewCardModal open={open} onClose={() => setOpen(false)} onCreated={(id) => router.push(`/cards/${id}`)} />

      {error && (
        <div className="mb-6 p-4 rounded-xl border border-red-500/10 bg-red-500/5 text-red-500 text-sm font-medium flex items-center gap-2">
          <Icon name="x" size={16} />
          {error}
        </div>
      )}

      {/* 1. Statistics Cards Section */}
      {cards !== null && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="v-stat">
            <div className="flex items-center justify-between">
              <span className="v-stat-label">{t('stats.total', 'Total Cards')}</span>
              <span className="v-icon-tile !h-8 !w-8"><Icon name="layers" size={15} /></span>
            </div>
            <p className="v-stat-value mt-3">{stats.total}</p>
            <p className="mt-1 text-[11px] font-semibold text-faint">{t('stats.allProfiles', 'all profiles')}</p>
          </div>

          <div className="v-stat">
            <div className="flex items-center justify-between">
              <span className="v-stat-label">{t('stats.live', 'Live Cards')}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-emerald-500/10 text-emerald-500">
                <Icon name="globe" size={15} />
              </span>
            </div>
            <p className="v-stat-value mt-3">{stats.live}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-faint">
              {stats.live > 0 && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
              {t('stats.published', 'published')}
            </p>
          </div>

          <div className="v-stat">
            <div className="flex items-center justify-between">
              <span className="v-stat-label">{t('stats.draft', 'Draft Cards')}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-amber-500/10 text-amber-500">
                <Icon name="quote" size={15} />
              </span>
            </div>
            <p className="v-stat-value mt-3">{stats.draft}</p>
            <p className="mt-1 text-[11px] font-semibold text-faint">{t('stats.unpublished', 'unpublished')}</p>
          </div>
        </div>
      )}

      {/* 2. Search and Filters Toolbar */}
      {cards !== null && cards.length > 0 && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-line">
          {/* Search box */}
          <div className="relative flex-1 max-w-md">
            <span className="absolute inset-y-0 start-3 flex items-center text-muted">
              <Icon name="search" size={16} />
            </span>
            <input
              type="text"
              placeholder={t('searchPlaceholder', 'Search by card name or slug...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="v-field !ps-10 !pe-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 end-3 flex items-center text-muted hover:text-ink"
              >
                <Icon name="x" size={14} />
              </button>
            )}
          </div>

          {/* Filter, Sort & Toggle controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Status filters */}
            <div className="inline-flex rounded-xl border border-line p-0.5 bg-canvas/30">
              {(['ALL', 'LIVE', 'DRAFT'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all"
                  style={
                    statusFilter === filter
                      ? { background: 'var(--v-gradient-brand)', color: '#fff', boxShadow: 'var(--v-shadow-accent)' }
                      : undefined
                  }
                  data-inactive={statusFilter !== filter}
                >
                  <span className={statusFilter === filter ? '' : 'text-muted hover:text-ink'}>
                    {t(`statusFilter.${filter.toLowerCase()}`, filter.charAt(0) + filter.slice(1).toLowerCase())}
                  </span>
                </button>
              ))}
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 border border-line rounded-xl bg-surface text-xs font-bold text-ink focus:outline-none focus:border-accent"
            >
              <option value="newest">{t('sortOptions.newest', 'Newest First')}</option>
              <option value="oldest">{t('sortOptions.oldest', 'Oldest First')}</option>
              <option value="name-asc">{t('sortOptions.nameAsc', 'Name (A-Z)')}</option>
              <option value="name-desc">{t('sortOptions.nameDesc', 'Name (Z-A)')}</option>
            </select>

            {/* View Mode Toggle */}
            <div className="inline-flex rounded-xl border border-line p-0.5 bg-canvas/30">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'text-white' : 'text-muted hover:text-ink'}`}
                style={viewMode === 'grid' ? { background: 'var(--v-gradient-brand)', boxShadow: 'var(--v-shadow-accent)' } : undefined}
                title={t('view.grid')}
              >
                <Icon name="grid" size={16} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'text-white' : 'text-muted hover:text-ink'}`}
                style={viewMode === 'list' ? { background: 'var(--v-gradient-brand)', boxShadow: 'var(--v-shadow-accent)' } : undefined}
                title={t('view.list')}
              >
                <Icon name="list" size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Cards Display (Grid or List) */}
      {cards === null ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="v-skeleton h-[270px] rounded-2xl" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="v-card flex flex-col items-center gap-4 py-20 text-center max-w-md mx-auto mt-8 border-dashed">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Icon name="grid" size={24} />
          </span>
          <div className="space-y-1.5">
            <h3 className="font-bold text-lg text-ink">{t('empty.title')}</h3>
            <p className="text-sm text-muted px-6">
              {t('empty.desc')}
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="v-btn mt-2 flex items-center gap-2 !h-10 px-5 text-sm"
          >
            <Icon name="plus" size={16} /> {t('createCard')}
          </button>
        </div>
      ) : filteredAndSortedCards.length === 0 ? (
        <div className="text-center py-20 bg-surface border border-line border-dashed rounded-2xl max-w-md mx-auto">
          <span className="inline-flex p-3 rounded-full bg-canvas text-muted mb-3">
            <Icon name="search" size={20} />
          </span>
          <p className="text-sm font-semibold text-muted">{t('empty.filtered')}</p>
        </div>
      ) : viewMode === 'grid' ? (
        /* PORTRAIT DEVICE MOCKUP GRID VIEW LAYOUT */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredAndSortedCards.map((card) => {
              const accent = (card.theme?.accent as string) ?? '#2563eb';
              const isDark = (card.theme?.mode as string) === 'dark';
              const name = (card.vcardData?.fullName as string) || `/${card.slug}`;
              const isConfirmDeleting = deletingId === card.id;

              const coverImage = card.vcardData?.coverImage as string;
              const coverType = card.theme?.cover as string;
              const avatar = card.vcardData?.avatar as string;
              const activeActions = card.actions?.filter((a) => a.isActive) ?? [];

              const title = (card.vcardData?.title as string) || '';
              const company = (card.vcardData?.org as string) || '';

              return (
                <motion.div
                  key={card.id}
                  layout
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  className="group relative bg-surface border border-line rounded-2xl overflow-hidden shadow-sm hover:shadow-lg hover:border-line-strong transition-all flex flex-col h-[270px]"
                >
                  {/* Glassmorphic Delete Confirmation Overlay */}
                  <AnimatePresence>
                    {isConfirmDeleting && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-surface/95 backdrop-blur-sm p-4 text-center"
                      >
                        <p className="text-xs font-bold text-ink mb-3 px-3">
                          {t('confirmDelete', 'Are you sure you want to delete this card? This action is permanent.')}
                        </p>
                        <div className="flex gap-2 w-full justify-center">
                          <button
                            disabled={isDeleting}
                            onClick={() => setDeletingId(null)}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-line bg-canvas hover:bg-elevated text-ink transition-colors"
                          >
                            {t('actions.cancel', 'Cancel')}
                          </button>
                          <button
                            disabled={isDeleting}
                            onClick={() => handleDelete(card.id)}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors"
                          >
                            {isDeleting ? t('actions.deleting', 'Deleting...') : t('actions.delete', 'Delete')}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Top Part: Cover, Avatar, and Profile Metadata */}
                  <div className="flex-1 flex flex-col min-w-0">
                    {/* Card Cover */}
                    <div
                      className="relative h-[96px] shrink-0 bg-cover bg-center overflow-hidden"
                      style={{
                        background: coverImage
                          ? `url("${coverImage}") center/cover no-repeat`
                          : (coverType === 'constellation' || isDark ? '#09090b' : `linear-gradient(135deg, ${accent}, rgba(0,0,0,0.15))`),
                      }}
                    >
                      <div className="absolute inset-0 bg-black/5" />

                      {(isDark || coverType === 'constellation') && !coverImage && (
                        <span
                          className="absolute inset-0 opacity-60 pointer-events-none"
                          style={{
                            background: `radial-gradient(100% 120% at 75% 20%, ${accent}55, transparent)`,
                          }}
                        />
                      )}

                      {/* Live/Draft badge on top-left of cover */}
                      <span
                        className="absolute top-3 start-3 flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border backdrop-blur-sm text-white"
                        style={
                          card.isPublished
                            ? { background: 'rgba(16,185,129,0.25)', borderColor: 'rgba(16,185,129,0.4)', color: '#a7f3d0' }
                            : { background: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)', color: '#e4e4e7' }
                        }
                      >
                        {card.isPublished && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                        {card.isPublished ? t('cardStatus.live', 'Live') : t('cardStatus.draft', 'Draft')}
                      </span>
                    </div>

                    {/* Centered Avatar badge overlapping the cover */}
                    <div className="flex justify-center -mt-8 z-10 select-none">
                      <span
                        className="flex h-16 w-16 overflow-hidden items-center justify-center rounded-full border-3 border-surface bg-slate-100 shadow-md transition-transform group-hover:scale-105"
                        style={{ borderColor: 'hsl(var(--v-surface))', background: accent }}
                      >
                        {avatar ? (
                          <img src={avatar} alt={name} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-[18px] font-extrabold text-white">
                            {name.charAt(name.startsWith('/') ? 1 : 0).toUpperCase()}
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Centered Typography for Name, Subtitle and Slug */}
                    <div className="pt-2 px-3 text-center min-w-0">
                      <p className="font-extrabold text-[15.5px] text-ink group-hover:text-accent transition-colors truncate px-1">
                        {name}
                      </p>
                      
                      {title || company ? (
                        <p className="truncate text-[11px] text-muted font-bold mt-0.5 px-2">
                          {title}{title && company && ' · '}{company}
                        </p>
                      ) : (
                        <p className="text-[11px] text-faint font-semibold mt-0.5">{t('digitalCard')}</p>
                      )}

                      <p className="truncate text-[10px] text-faint font-medium font-mono mt-1">/c/{card.slug}</p>
                    </div>

                    {/* Centered active connection links */}
                    <div className="flex justify-center items-center gap-1.5 mt-3 px-4 overflow-hidden shrink-0">
                      {activeActions.slice(0, 6).map((a) => {
                        const color = BRANDS_COLORS[a.type] ?? '#2563eb';
                        return (
                          <span
                            key={a.id}
                            className="flex h-6.5 w-6.5 items-center justify-center rounded-lg text-white shadow-sm shrink-0 border border-white/5"
                            style={{ background: color }}
                            title={a.type}
                          >
                            <Icon name={actionIcon(a.type)} size={11} />
                          </span>
                        );
                      })}
                      {activeActions.length === 0 && (
                        <span className="text-[11px] text-faint font-semibold">{t('noActiveLinks', 'No active links')}</span>
                      )}
                      {activeActions.length > 6 && (
                        <span className="text-[9px] font-bold text-muted bg-canvas px-1.5 py-0.5 rounded border border-line shrink-0">
                          +{activeActions.length - 6}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Premium Unified Actions Bar (Footer) */}
                  <div className="flex border-t border-line divide-x divide-line bg-canvas/30 shrink-0 text-center select-none">
                    <Link
                      href={`/cards/${card.id}`}
                      className="flex-1 flex items-center justify-center gap-1 py-2.5 text-[11px] font-black text-muted hover:text-accent hover:bg-canvas/50 transition-all"
                      title={t('actions.edit', 'Edit')}
                    >
                      <Icon name="settings" size={12} />
                      <span>{t('actions.edit', 'Edit')}</span>
                    </Link>
                    <a
                      href={`/c/${card.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 flex items-center justify-center gap-1 py-2.5 text-[11px] font-black text-muted hover:text-accent hover:bg-canvas/50 transition-all"
                      title={t('actions.view', 'View')}
                    >
                      <Icon name="external-link" size={12} />
                      <span>{t('actions.view', 'View')}</span>
                    </a>
                    <button
                      onClick={(e) => copyToClipboard(e, card.slug)}
                      className="flex-1 flex items-center justify-center gap-1 py-2.5 text-[11px] font-black text-muted hover:text-accent hover:bg-canvas/50 transition-all"
                      title={t('actions.copy', 'Copy')}
                    >
                      <Icon name="copy" size={12} />
                      <span>{t('actions.copy', 'Copy')}</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeletingId(card.id);
                      }}
                      className="flex-1 flex items-center justify-center gap-1 py-2.5 text-[11px] font-black text-muted hover:text-red-500 hover:bg-red-500/5 transition-all"
                      title={t('actions.delete', 'Delete')}
                    >
                      <Icon name="trash" size={12} />
                      <span>{t('actions.delete', 'Delete')}</span>
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      ) : (
        /* LIST VIEW LAYOUT */
        <div className="flex flex-col gap-3">
          <AnimatePresence mode="popLayout">
            {filteredAndSortedCards.map((card) => {
              const accent = (card.theme?.accent as string) ?? '#2563eb';
              const name = (card.vcardData?.fullName as string) || `/${card.slug}`;
              const isConfirmDeleting = deletingId === card.id;
              const avatar = card.vcardData?.avatar as string;
              const activeActions = card.actions?.filter((a) => a.isActive) ?? [];
              const createdDate = formatDate(card.createdAt, locale, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              });

              return (
                <motion.div
                  key={card.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  className="group relative bg-surface border border-line rounded-2xl p-4 flex items-center justify-between gap-4 hover:border-line-strong hover:shadow-sm transition-all"
                >
                  {/* Inline Delete Confirmation Overlay for List Mode */}
                  <AnimatePresence>
                    {isConfirmDeleting && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-20 flex items-center justify-between bg-surface/95 backdrop-blur-sm px-6"
                      >
                        <p className="text-xs font-bold text-ink">
                          {t('confirmDelete')}
                        </p>
                        <div className="flex gap-2">
                          <button
                            disabled={isDeleting}
                            onClick={() => setDeletingId(null)}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-line bg-canvas hover:bg-elevated text-ink transition-colors"
                          >
                            {t('actions.cancel')}
                          </button>
                          <button
                            disabled={isDeleting}
                            onClick={() => handleDelete(card.id)}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors"
                          >
                            {isDeleting ? t('actions.deleting') : t('actions.delete')}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Left section: Avatar & Profile info */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1 md:flex-initial md:w-[280px]">
                    <span
                      className="flex h-11 w-11 shrink-0 overflow-hidden items-center justify-center rounded-full border border-line shadow-sm"
                      style={{ background: accent }}
                    >
                      {avatar ? (
                        <img src={avatar} alt={name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[13px] font-black text-white">
                          {name.charAt(name.startsWith('/') ? 1 : 0).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="font-extrabold text-[14.5px] text-ink group-hover:text-accent transition-colors truncate">
                        {name}
                      </p>
                      <p className="text-[11px] text-muted font-mono truncate">/c/{card.slug}</p>
                    </div>
                  </div>

                  {/* Middle Section 1: Active links list (hidden on mobile) */}
                  <div className="hidden lg:flex items-center gap-1.5 max-w-[200px] overflow-hidden shrink-0">
                    <div className="flex gap-1.5">
                      {activeActions.slice(0, 6).map((a) => {
                        const color = BRANDS_COLORS[a.type] ?? '#2563eb';
                        return (
                          <span
                            key={a.id}
                            className="flex h-5.5 w-5.5 items-center justify-center rounded-lg text-white shadow-sm shrink-0 border border-white/5"
                            style={{ background: color }}
                            title={a.type}
                          >
                            <Icon name={actionIcon(a.type)} size={10} />
                          </span>
                        );
                      })}
                      {activeActions.length === 0 && (
                        <span className="text-xs text-faint font-semibold">—</span>
                      )}
                      {activeActions.length > 6 && (
                        <span className="text-[9px] font-bold text-muted bg-canvas px-1.5 py-0.5 rounded border border-line shrink-0">
                          +{activeActions.length - 6}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Middle Section 2: Created date */}
                  <div className="hidden md:block text-xs font-semibold text-muted tracking-wide shrink-0 md:w-[100px]">
                    {createdDate}
                  </div>

                  {/* Right Section: Status badge & Actions */}
                  <div className="flex items-center gap-4 shrink-0">
                    {/* Status badge */}
                    <span
                      className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border shrink-0"
                      style={
                        card.isPublished
                          ? { background: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.2)', color: '#10b981' }
                          : { background: 'hsl(var(--v-border))', borderColor: 'hsl(var(--v-border-strong))', color: 'hsl(var(--v-muted))' }
                      }
                    >
                      {card.isPublished && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                      {card.isPublished ? t('cardStatus.live') : t('cardStatus.draft')}
                    </span>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => copyToClipboard(e, card.slug)}
                        className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-canvas hover:text-accent active:scale-90 transition-all text-muted border border-transparent hover:border-line"
                        title={t('actions.copyLink')}
                      >
                        <Icon name="copy" size={14} />
                      </button>
                      <a
                        href={`/c/${card.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-canvas hover:text-accent active:scale-90 transition-all text-muted border border-transparent hover:border-line"
                        title={t('actions.previewCard')}
                      >
                        <Icon name="external-link" size={14} />
                      </a>
                      <Link
                        href={`/cards/${card.id}`}
                        className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-canvas hover:text-accent active:scale-90 transition-all text-muted border border-transparent hover:border-line"
                        title={t('actions.editCard')}
                      >
                        <Icon name="settings" size={14} />
                      </Link>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeletingId(card.id);
                        }}
                        className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-red-500/5 hover:text-red-500 active:scale-90 transition-all text-muted border border-transparent hover:border-line"
                        title={t('actions.deleteCard')}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Floating Copy Feedback Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 border border-white/10 dark:border-black/5 px-4.5 py-3 rounded-2xl shadow-xl text-xs font-bold tracking-wide"
          >
            <span className="text-emerald-400 dark:text-emerald-600">
              <Icon name="check" size={14} />
            </span>
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}
