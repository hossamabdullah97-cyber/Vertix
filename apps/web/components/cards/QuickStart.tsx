'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { authFetch, type Card as CardType } from '@/lib/client';
import { Icon } from '@/components/Icon';
import { ImageUpload } from '@/components/ImageUpload';
import ShareCard from '@/components/ShareCard';
import type { ReadProgress } from '@/lib/card-reader';
import { photoCanvas } from '@/lib/card-reader';
import { paletteFromImage } from '@/lib/palette';
import { CARD_FONTS, FONT_STACKS, type CardFont } from '@/lib/profile';
import { readCardPhoto, scanAvailable, type ReadBy } from '@/lib/read-card';

/**
 * The channels a card is worth having on day one. Each maps to the same action
 * type the full studio creates, so nothing here is a special case downstream.
 */
const CHANNELS = [
  { key: 'whatsapp', type: 'WHATSAPP', field: 'phone', color: '#25d366', icon: 'whatsapp', dir: 'ltr' },
  { key: 'call',     type: 'CALL',     field: 'phone', color: '#10b981', icon: 'phone',    dir: 'ltr' },
  { key: 'email',    type: 'EMAIL',    field: 'email', color: '#ef4444', icon: 'mail',     dir: 'ltr' },
  { key: 'linkedin', type: 'LINKEDIN', field: 'url',   color: '#0a66c2', icon: 'linkedin', dir: 'ltr' },
  { key: 'website',  type: 'WEBSITE',  field: 'url',   color: '#2563eb', icon: 'globe',    dir: 'ltr' },
] as const;

type ChannelKey = (typeof CHANNELS)[number]['key'];

/** A deliberately short list — the full 19 are under Design in the Studio. */
type Look = { key: string; id: string; accent: string; mode: 'light' | 'dark'; from?: 'card' | 'logo' | 'workspace' };
const LOOKS: Look[] = [
  { key: 'swiss-blue', id: 'swiss-blue',   accent: '#2563eb', mode: 'light' as const },
  { key: 'swiss-green', id: 'swiss-green',  accent: '#15803d', mode: 'light' as const },
  { key: 'swiss-violet', id: 'swiss-violet', accent: '#7c3aed', mode: 'light' as const },
  { key: 'noir-blue', id: 'noir-blue',    accent: '#60a5fa', mode: 'dark'  as const },
  { key: 'noir-amber', id: 'noir-amber',   accent: '#fbbf24', mode: 'dark'  as const },
  { key: 'carbon', id: 'carbon',       accent: '#ffffff', mode: 'dark'  as const },
];

/** The steps shown in the progress bar; before them, the choice of how to start; after them, the card ready. */
const STEPS = ['identity', 'channels', 'look'] as const;
type Stage = 'start' | (typeof STEPS)[number] | 'done';

const isArabic = (s: string) => /[؀-ۿ]/.test(s);

/**
 * The quickest path to a usable card: a photo of the paper card fills it in
 * (its QR code, Claude on the server when there, or this device), or the
 * owner types it. Three short steps, the card's colours offered from the
 * paper card and the logo, then the card ready to publish and share. It
 * writes through the same endpoints the studio uses and commits once at the
 * end, so stepping back never leaves the card half-saved.
 */
export default function QuickStart({
  cardId,
  card,
  onDone,
  onSkip,
}: {
  cardId: string;
  card: CardType;
  /** Called to leave for the studio after the card is made; the parent reloads it. */
  onDone: () => void;
  /** Leave the guided path without saving anything. */
  onSkip: () => void;
}) {
  const { t, i18n } = useTranslation('cardEditor');
  const uid = useId();
  const [stage, setStage] = useState<Stage>('start');
  const step = (STEPS as readonly string[]).indexOf(stage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const existing = (card.vcardData as Record<string, string>) ?? {};
  const [fullName, setFullName] = useState(existing.fullName ?? '');
  const [nameAlt, setNameAlt] = useState('');
  const [title, setTitle] = useState(existing.title ?? existing.org ?? '');
  const [company, setCompany] = useState(existing.company ?? '');
  const [location, setLocation] = useState(existing.location ?? '');
  const [avatar, setAvatar] = useState(existing.avatar ?? '');
  const [values, setValues] = useState<Partial<Record<ChannelKey, string>>>({});
  const [font, setFont] = useState<CardFont>('modern');

  // Reading the paper card.
  const [ai, setAi] = useState(false);
  useEffect(() => {
    void scanAvailable().then(setAi);
  }, []);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState<ReadProgress | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [readBy, setReadBy] = useState<ReadBy | null>(null);
  const [readError, setReadError] = useState<'notCard' | 'read' | null>(null);
  const attempt = useRef(0);
  const cameraRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const [cardColors, setCardColors] = useState<string[]>([]);
  const [logoColors, setLogoColors] = useState<string[]>([]);

  // A card created in a workspace starts in its brand colour and language
  // (see createBlankCard); offer that colour first so finishing keeps it.
  const startTheme = (card.theme ?? {}) as Record<string, unknown>;
  const startAccent = typeof startTheme.accent === 'string' ? startTheme.accent.toLowerCase() : '';
  const looks = useMemo<Look[]>(() => {
    const own: Look[] = [
      ...logoColors.slice(0, 2).map((accent, i) => ({ key: `logo-${i}`, id: 'swiss-blue', accent, mode: 'light' as const, from: 'logo' as const })),
      ...cardColors.slice(0, 2).map((accent, i) => ({ key: `card-${i}`, id: 'swiss-blue', accent, mode: 'light' as const, from: 'card' as const })),
    ];
    const workspace: Look[] =
      startAccent && !LOOKS.some((l) => l.accent === startAccent && l.mode === 'light')
        ? [{ key: 'workspace', id: 'swiss-blue', accent: startAccent, mode: 'light', from: 'workspace' }]
        : [];
    return [...own, ...workspace, ...LOOKS].slice(0, 9);
  }, [startAccent, cardColors, logoColors]);
  const [lookKey, setLookKey] = useState<string | null>(null);
  // The owner's pick; until then, the paper card's or logo's own colour, else the workspace's.
  const look = looks.find((l) => l.key === lookKey) ?? looks.find((l) => l.from) ?? looks.find((l) => l.accent === startAccent) ?? looks[0];

  // The workspace's language when it has one; otherwise the script the name is
  // written in, then the language this page is in — so an Arabic card reads right to left.
  const lang: 'ar' | 'en' =
    startTheme.lang === 'ar' || startTheme.lang === 'en'
      ? startTheme.lang
      : isArabic(fullName)
        ? 'ar'
        : /[A-Za-z]/.test(fullName)
          ? 'en'
          : i18n.language?.startsWith('ar')
            ? 'ar'
            : 'en';

  const chosen = useMemo(() => CHANNELS.filter((c) => (values[c.key] ?? '').trim().length > 0), [values]);

  async function readPhoto(file: File | undefined) {
    if (!file) return;
    const id = ++attempt.current;
    const current = () => id === attempt.current;
    setReadError(null);
    setReadBy(null);
    setPhoto((p) => {
      if (p) URL.revokeObjectURL(p);
      return URL.createObjectURL(file);
    });
    setReading(true);
    try {
      const read = await readCardPhoto(file, { ai, current, onProgress: setProgress });
      if (!read) return;
      if (!read.ok) {
        setReadError(read.error);
        return;
      }
      const c = read.contact;
      if (c.name) setFullName(c.name);
      // A card printed in both scripts gives the card its second language.
      setNameAlt(c.nameAlt && c.name && isArabic(c.nameAlt) !== isArabic(c.name) ? c.nameAlt : '');
      if (c.title) setTitle(c.title);
      if (c.company) setCompany(c.company);
      if (c.address) setLocation(c.address);
      const phone = c.phones[0] ?? '';
      const linkedin = c.website && /linkedin\.com/i.test(c.website) ? c.website : '';
      setValues((v) => ({
        ...v,
        ...(phone ? { whatsapp: phone, call: phone } : {}),
        ...(c.emails[0] ? { email: c.emails[0] } : {}),
        ...(linkedin ? { linkedin } : c.website ? { website: c.website } : {}),
      }));
      setCardColors(read.colors);
      setReadBy(read.by);
      setStage('identity');
    } finally {
      if (current()) {
        setReading(false);
        setProgress(null);
      }
    }
  }

  async function readLogo(file: File | undefined) {
    if (!file) return;
    try {
      const colors = paletteFromImage(await photoCanvas(file, 400), 3);
      setLogoColors(colors);
      if (colors.length) setLookKey('logo-0');
    } catch {
      /* a picture the browser cannot open: nothing offered */
    }
  }

  const [slug, setSlug] = useState(card.slug);
  const [published, setPublished] = useState(false);

  async function commit() {
    setSaving(true);
    setError('');
    // The details typed here are the card's own too, not only its buttons: the
    // studio's Phone and Email fields and the saved contact (vCard) read them.
    const typed = (k: ChannelKey) => (values[k] ?? '').trim();
    const contact = Object.fromEntries(
      Object.entries({
        phone: typed('call') || typed('whatsapp'),
        email: typed('email'),
        website: typed('website'),
        company: company.trim(),
        location: location.trim(),
      }).filter(([, v]) => v),
    );
    const alt = nameAlt.trim() ? { alt: { lang: lang === 'ar' ? 'en' : 'ar', fullName: nameAlt.trim() } } : {};
    try {
      const updated = await authFetch<CardType>(`/cards/${cardId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          templateId: look.id,
          theme: { accent: look.accent, mode: look.mode, cover: 'gradient', lang, font },
          vcardData: { ...existing, ...contact, ...alt, fullName: fullName.trim(), title: title.trim(), avatar },
        }),
      });
      if (updated?.slug) setSlug(updated.slug);

      // Sequential so ordering on the card matches the order shown here.
      for (const c of chosen) {
        await authFetch(`/cards/${cardId}/actions`, {
          method: 'POST',
          body: JSON.stringify({
            type: c.type,
            config: { [c.field]: (values[c.key] ?? '').trim(), isQuick: true },
          }),
        });
      }
      setStage('done');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setSaving(true);
    setError('');
    try {
      await authFetch(`/cards/${cardId}`, { method: 'PATCH', body: JSON.stringify({ isPublished: true }) });
      setPublished(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const initial = (fullName.trim()[0] ?? '؟').toUpperCase();
  const canContinue = stage === 'identity' ? fullName.trim().length > 0 : true;
  const next = () => setStage(STEPS[step + 1] ?? 'look');
  const back = () => setStage(step > 0 ? STEPS[step - 1] : 'start');

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Progress, for the three steps */}
      {step >= 0 && (
        <div className="mb-8 flex items-center gap-3">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-3">
              <div className="flex-1">
                <div className={`h-1 rounded-full transition-colors duration-300 ${i <= step ? 'bg-accent' : 'bg-line'}`} />
                <p className={`mt-2 text-2xs font-semibold ${i === step ? 'text-ink' : 'text-faint'}`}>{t(`quickStart.steps.${s}`)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* ---------- panel ---------- */}
        <div>
          <AnimatePresence mode="wait">
            <motion.div key={stage} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              {stage === 'start' && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-3xl font-semibold tracking-tight text-ink">{t('quickStart.start.title')}</h2>
                    <p className="mt-1 text-base text-muted">{t('quickStart.start.subtitle')}</p>
                  </div>

                  <input
                    ref={cameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    data-testid="quickstart-photo"
                    onChange={(e) => {
                      void readPhoto(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />

                  {reading ? (
                    <div className="flex items-center gap-4 rounded-2xl p-4 ring-1 ring-inset ring-accent/40" role="status">
                      {photo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo} alt="" className="h-20 w-32 shrink-0 rounded-lg object-cover ring-1 ring-line" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-base font-medium text-ink">
                          <Icon name="loader" size={16} className="animate-spin text-accent" /> {t('quickStart.start.reading')}
                        </p>
                        <p className="mt-1 text-sm text-muted">
                          {progress?.phase === 'loading' ? t('quickStart.start.loadingReader') : t('quickStart.start.readingHint')}
                        </p>
                        {progress && (
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated">
                            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(progress.progress * 100)}%` }} />
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => cameraRef.current?.click()}
                        className="group flex flex-col items-start gap-3 rounded-2xl bg-accent/[0.06] p-5 text-start ring-2 ring-inset ring-accent transition-colors hover:bg-accent/[0.1]"
                      >
                        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white">
                          <Icon name="camera" size={22} />
                        </span>
                        <span>
                          <span className="flex items-center gap-2 text-lg font-semibold text-ink">
                            {t('quickStart.start.photo')}
                            <span className="v-badge v-badge-success">{t('quickStart.start.fastest')}</span>
                          </span>
                          <span className="mt-1 block text-sm leading-relaxed text-muted">{t('quickStart.start.photoHint')}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setStage('identity')}
                        className="flex flex-col items-start gap-3 rounded-2xl p-5 text-start ring-1 ring-inset ring-line transition-colors hover:bg-elevated"
                      >
                        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-elevated text-ink ring-1 ring-inset ring-line">
                          <Icon name="edit" size={22} />
                        </span>
                        <span>
                          <span className="block text-lg font-semibold text-ink">{t('quickStart.start.write')}</span>
                          <span className="mt-1 block text-sm leading-relaxed text-muted">{t('quickStart.start.writeHint')}</span>
                        </span>
                      </button>
                    </div>
                  )}

                  {readError && (
                    <p role="alert" className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                      {t(readError === 'notCard' ? 'quickStart.start.notCard' : 'quickStart.start.readFailed')}
                    </p>
                  )}
                  <p className="flex items-center gap-1.5 text-xs text-faint">
                    <Icon name="lock" size={12} /> {t('quickStart.start.privacy')}
                  </p>
                </div>
              )}

              {stage === 'identity' && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-3xl font-semibold tracking-tight text-ink">{t(readBy ? 'quickStart.identity.readTitle' : 'quickStart.identity.title')}</h2>
                    <p className="mt-1 text-base text-muted">{t(readBy ? 'quickStart.identity.readSubtitle' : 'quickStart.identity.subtitle')}</p>
                  </div>
                  {readBy === 'deviceArabic' && (
                    <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">{t('quickStart.identity.checkArabic')}</p>
                  )}

                  <div className="space-y-1.5">
                    <label htmlFor={`${uid}-name`} className="text-2xs font-semibold text-muted">
                      {t('profile.fullName')}
                    </label>
                    <input
                      id={`${uid}-name`}
                      autoFocus
                      className="v-field font-semibold"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={t('profile.fullNamePlaceholder')}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label htmlFor={`${uid}-title`} className="text-2xs font-semibold text-muted">
                        {t('profile.jobTitle')}
                      </label>
                      <input id={`${uid}-title`} className="v-field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('profile.jobTitlePlaceholder')} />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor={`${uid}-company`} className="text-2xs font-semibold text-muted">
                        {t('profile.company')}
                      </label>
                      <input
                        id={`${uid}-company`}
                        className="v-field"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder={t('profile.companyPlaceholder')}
                        autoComplete="organization"
                      />
                    </div>
                  </div>

                  {nameAlt && (
                    <div className="space-y-1.5">
                      <label htmlFor={`${uid}-alt`} className="text-2xs font-semibold text-muted">
                        {t('quickStart.identity.nameAlt')}
                      </label>
                      <input id={`${uid}-alt`} dir="auto" className="v-field" value={nameAlt} onChange={(e) => setNameAlt(e.target.value)} />
                    </div>
                  )}

                  <div className="rounded-xl border border-line bg-canvas/30 p-4">
                    <ImageUpload label={t('profile.avatarLabel')} shape="circle" crop value={avatar} onChange={setAvatar} />
                  </div>
                </div>
              )}

              {stage === 'channels' && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-3xl font-semibold tracking-tight text-ink">{t('quickStart.channels.title')}</h2>
                    <p className="mt-1 text-base text-muted">{t('quickStart.channels.subtitle')}</p>
                  </div>

                  <div className="space-y-2.5">
                    {CHANNELS.map((c) => {
                      const value = values[c.key] ?? '';
                      const on = value.trim().length > 0;
                      return (
                        <div
                          key={c.key}
                          className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${on ? 'border-accent/40 bg-accent-soft/30' : 'border-line bg-surface'}`}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: c.color }}>
                            <Icon name={c.icon} size={16} />
                          </span>
                          <label htmlFor={`${uid}-${c.key}`} className="w-24 shrink-0 text-sm font-semibold text-ink">
                            {t(`quickStart.channels.${c.key}`)}
                          </label>
                          <input
                            id={`${uid}-${c.key}`}
                            dir={c.dir}
                            className="v-field !h-9 flex-1 text-sm"
                            value={value}
                            onChange={(e) => setValues((v) => ({ ...v, [c.key]: e.target.value }))}
                            placeholder={t(`quickStart.channels.${c.key}Placeholder`)}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-xs text-faint">{t('quickStart.channels.hint')}</p>
                </div>
              )}

              {stage === 'look' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-3xl font-semibold tracking-tight text-ink">{t('quickStart.look.title')}</h2>
                    <p className="mt-1 text-base text-muted">{t('quickStart.look.subtitle')}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                    {looks.map((l) => (
                      <button
                        key={l.key}
                        onClick={() => setLookKey(l.key)}
                        aria-pressed={look.key === l.key}
                        aria-label={l.from ? t(`quickStart.look.from.${l.from}`) : l.id}
                        className={`relative aspect-[3/4] rounded-xl border-2 transition-all ${
                          look.key === l.key ? 'scale-105 border-accent shadow-md' : 'border-line hover:border-line-strong'
                        }`}
                        style={{ background: l.mode === 'dark' ? '#0f1115' : '#ffffff' }}
                      >
                        <span className="mx-auto block h-8 rounded-t-lg" style={{ background: l.accent, opacity: l.mode === 'dark' ? 0.8 : 1 }} />
                        <span className="mx-auto mt-2 block h-6 w-6 rounded-full border-2" style={{ background: l.accent, borderColor: l.mode === 'dark' ? '#0f1115' : '#fff' }} />
                        {l.from && (
                          <span className="absolute inset-x-1 bottom-1.5 truncate rounded-md bg-black/60 px-1 py-0.5 text-center text-3xs font-medium text-white">
                            {t(`quickStart.look.from.${l.from}`)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  <div>
                    <input
                      ref={logoRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      data-testid="quickstart-logo"
                      onChange={(e) => {
                        void readLogo(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                    <button type="button" onClick={() => logoRef.current?.click()} className="v-btn v-btn-ghost">
                      <Icon name="sparkle" size={14} /> {t('quickStart.look.logo')}
                    </button>
                    <p className="mt-1.5 text-xs text-faint">{t('quickStart.look.logoHint')}</p>
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-medium text-ink">{t('designTab.font')}</p>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      {CARD_FONTS.map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFont(f)}
                          aria-pressed={font === f}
                          className={`rounded-xl px-3 py-2.5 text-start transition-colors ${
                            font === f ? 'bg-accent/[0.05] ring-2 ring-inset ring-accent' : 'ring-1 ring-inset ring-line hover:bg-elevated'
                          }`}
                        >
                          <span className="block text-lg leading-tight text-ink" style={{ fontFamily: FONT_STACKS[f] }}>
                            Aa أب
                          </span>
                          <span className="mt-1 block truncate text-xs text-muted">{t(`designTab.fonts.${f}.label`)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {stage === 'done' && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-3xl font-semibold tracking-tight text-ink">{t(published ? 'quickStart.done.liveTitle' : 'quickStart.done.title')}</h2>
                    <p className="mt-1 text-base text-muted">{t(published ? 'quickStart.done.liveSubtitle' : 'quickStart.done.subtitle')}</p>
                  </div>
                  {published ? (
                    <ShareCard slug={slug} />
                  ) : (
                    <div className="flex flex-wrap gap-2.5">
                      <button onClick={() => void publish()} disabled={saving} className="v-btn !h-11 px-6 text-sm font-semibold" data-testid="quickstart-publish">
                        <Icon name="share" size={15} /> {saving ? t('quickStart.saving') : t('quickStart.done.publish')}
                      </button>
                      <a href={`/preview/${cardId}`} target="_blank" rel="noreferrer" className="v-btn v-btn-ghost !h-11 px-5 text-sm">
                        <Icon name="eye" size={15} /> {t('quickStart.done.see')}
                      </a>
                    </div>
                  )}
                  <button onClick={onDone} className="v-btn v-btn-ghost !h-11 px-5 text-sm" data-testid="quickstart-edit">
                    <Icon name="edit" size={15} /> {t('quickStart.done.edit')}
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {error && <p className="mt-4 text-sm font-semibold text-red-500">{error}</p>}

          {/* Navigation — on a phone it stays in reach above the bottom bar. */}
          {step >= 0 && (
            <div className="sticky bottom-[var(--v-dock,0px)] z-10 -mx-4 mt-8 flex items-center gap-3 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:bg-transparent md:px-0 md:pb-0 md:pt-5 md:backdrop-blur-none">
              <button onClick={back} className="v-btn v-btn-ghost !h-10 px-5 text-sm font-semibold">
                {t('quickStart.back')}
              </button>

              {step < STEPS.length - 1 ? (
                <button onClick={next} disabled={!canContinue} className="v-btn !h-10 px-6 text-sm font-semibold disabled:opacity-40">
                  {t('quickStart.next')}
                </button>
              ) : (
                <button onClick={() => void commit()} disabled={saving} className="v-btn !h-10 px-6 text-sm font-semibold disabled:opacity-50">
                  {saving ? t('quickStart.saving') : t('quickStart.finish')}
                </button>
              )}

              <button onClick={onSkip} className="ms-auto text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
                {t('quickStart.skip')}
              </button>
            </div>
          )}
          {stage === 'start' && (
            <div className="mt-8 border-t border-line pt-5">
              <button onClick={onSkip} className="text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
                {t('quickStart.skip')}
              </button>
            </div>
          )}
        </div>

        {/* ---------- live mini preview ---------- */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 text-2xs font-semibold text-faint">{t('quickStart.preview')}</p>
          <div
            className="overflow-hidden rounded-[22px] border border-line shadow-lg"
            style={{ background: look.mode === 'dark' ? '#0f1115' : '#ffffff', fontFamily: FONT_STACKS[font] }}
          >
            <div className="h-20" style={{ background: `linear-gradient(135deg, ${look.accent}, ${look.accent}bb)` }} />
            <div className="px-5 pb-6 text-center">
              <div
                className="mx-auto -mt-9 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-4 text-3xl font-semibold text-white"
                style={{ background: look.accent, borderColor: look.mode === 'dark' ? '#0f1115' : '#fff' }}
              >
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  initial
                )}
              </div>

              <h3 className="mt-3 text-lg font-semibold" style={{ color: look.mode === 'dark' ? '#f4f6fa' : '#0f172a' }}>
                {fullName.trim() || t('quickStart.previewName')}
              </h3>
              <p className="text-xs" style={{ color: look.mode === 'dark' ? '#93a0b4' : '#64748b' }}>
                {[title.trim(), company.trim()].filter(Boolean).join(' · ') || t('quickStart.previewRole')}
              </p>

              {chosen.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {chosen.map((c) => (
                    <span key={c.key} className="flex h-9 w-9 items-center justify-center rounded-full text-white shadow-sm" style={{ background: c.color }}>
                      <Icon name={c.icon} size={15} />
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
