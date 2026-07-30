'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Card, Section, CardAction } from '@/lib/client';
import { Icon } from '@/components/Icon';
import { VMark } from '@/components/brand/VMark';
import { PaymentBrandLogo } from '@/components/brand/PaymentBrandLogo';
import { paymentBrand } from '@/lib/paymentBrands';
import { Constellation } from '@/components/profile/Constellation';
import { profileStrings, type Lang } from '@/lib/profileI18n';
import { resolveAction } from '@/lib/brandIcons';

function text(content: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = content[k];
    if (typeof v === 'string' && v) return v;
  }
  return '';
}

function shade(hex: string, amt: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const c = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${c(parseInt(m[1], 16) + amt)}${c(parseInt(m[2], 16) + amt)}${c(parseInt(m[3], 16) + amt)}`;
}

function contrastOf(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return '#ffffff';
  const lin = [1, 2, 3].map((i) => {
    const c = parseInt(m[i], 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return L > 0.6 ? '#141414' : '#ffffff';
}

/** Faithful mini-render of the live public profile (used in the editor). */
export interface PreviewPaymentLink {
  id: string;
  platform: string;
  displayName: string;
  description?: string | null;
  isActive?: boolean;
}





export default function CardPreview({
  card,
  sections,
  actions,
  paymentLinks = [],
}: {
  card: Card;
  sections: Section[];
  actions: CardAction[];
  paymentLinks?: PreviewPaymentLink[];
}) {
  const accent = (card.theme?.accent as string) ?? '#1d4ed8';
  const contrast = contrastOf(accent);
  const dark = (card.theme?.mode as string) === 'dark';
  const cover = (card.theme?.cover as string) || (dark ? 'constellation' : 'gradient');
  const round = (card.theme?.avatarShape as string) === 'square' ? 'rounded-[12px]' : 'rounded-full';
  
  const lang: Lang = (card.theme?.lang as string) === 'ar' ? 'ar' : 'en';
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const t = profileStrings(lang);

  const v = card.vcardData ?? {};
  const bio = sections.find((s) => s.type === 'BIO');
  // Same identity precedence as the published profile (vcardData is canonical).
  const name = (v.fullName as string) || (bio ? text(bio.content, 'title', 'headline') : '') || 'Your name';
  const title = (v.org as string) || (bio ? text(bio.content, 'subtitle') : '');
  const company = '';
  const about = bio ? text(bio.content, 'body', 'about') : '';
  const avatar = (v.avatar as string) || '';
  const coverImage = (v.coverImage as string) || '';

  // Interactive Save Button State
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'done'>('idle');

  // Interactive Engagement Form States
  const [engagementTab, setEngagementTab] = useState<'CONTACT' | 'MEETING' | 'QUOTE'>('CONTACT');
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', note: '' });
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [engagementDone, setEngagementDone] = useState<'CONTACT' | 'MEETING' | 'QUOTE' | null>(null);
  const [engagementBusy, setEngagementBusy] = useState(false);

  const TAB_META: { id: typeof engagementTab; icon: string }[] = [
    { id: 'CONTACT', icon: 'user' },
    { id: 'MEETING', icon: 'calendar' },
    { id: 'QUOTE', icon: 'quote' },
  ];

  const engagementLabel: Record<typeof engagementTab, string> = {
    CONTACT: t.connect,
    MEETING: t.meeting,
    QUOTE: t.quote,
  };

  const handleSave = () => {
    if (saveState !== 'idle') return;
    setSaveState('saving');
    setTimeout(() => {
      setSaveState('done');
      setTimeout(() => setSaveState('idle'), 2000);
    }, 800);
  };

  const handleEngagementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setEngagementBusy(true);
    setTimeout(() => {
      setEngagementBusy(false);
      setEngagementDone(engagementTab);
      setTimeout(() => {
        setEngagementDone(null);
        setForm({ name: '', email: '', phone: '', company: '', note: '' });
        setDate('');
        setTime('');
      }, 3000);
    }, 1000);
  };

  const engagementCta = engagementTab === 'MEETING' ? t.requestMeeting : engagementTab === 'QUOTE' ? t.requestQuote : t.shareDetails;

  // Resolve actions lists
  const active = actions.filter((a) => a.isActive);
  const resolved = active
    .map((a) => ({ a, r: resolveAction(a, card.slug) }))
    .filter((x): x is { a: CardAction; r: NonNullable<typeof x.r> } => x.r !== null);

  const quickActions = resolved.filter((x) => x.r.isQuickContact);
  const linkRows = resolved.filter((x) => !x.r.isQuickContact);

  return (
    <div
      dir={dir}
      className="overflow-hidden border text-[hsl(var(--v-fg))] transition-colors"
      style={{
        '--v-accent': accent,
        '--v-accent-contrast': contrast,
        '--v-bg': dark ? '240 10% 4%' : '240 14% 97%',
        '--v-surface': dark ? '240 10% 7%' : '0 0% 100%',
        '--v-border': dark ? '240 8% 13%' : '240 6% 90%',
        '--v-border-strong': dark ? '240 8% 20%' : '240 5% 82%',
        '--v-fg': dark ? '0 0% 98%' : '240 10% 4%',
        '--v-muted': dark ? '240 5% 65%' : '240 5% 42%',
        '--v-faint': dark ? '240 5% 45%' : '240 4% 65%',
        '--v-radius': '12px',
        '--v-radius-lg': '16px',
        background: 'hsl(var(--v-bg))',
        borderColor: 'hsl(var(--v-border))',
        color: 'hsl(var(--v-fg))',
      } as React.CSSProperties}
    >
      {/* Cover Background */}
      <div className="relative h-24 overflow-hidden select-none">
        {coverImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.25))' }} />
          </>
        ) : cover === 'constellation' ? (
          <div className="absolute inset-0" style={{ background: '#0b0b0e' }}>
            <Constellation className="absolute inset-0 h-full w-full" />
          </div>
        ) : cover === 'solid' ? (
          <div className="absolute inset-0" style={{ background: accent }} />
        ) : (
          <>
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${accent}, ${shade(accent, -46)})` }} />
            <div className="absolute inset-0 opacity-[0.14]" style={{ backgroundImage: 'linear-gradient(0deg, rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)', backgroundSize: '34px 34px' }} />
            <div className="pointer-events-none absolute -bottom-3 end-4 text-white/15"><VMark size={80} strokeWidth={1.25} /></div>
          </>
        )}
      </div>

      <div className="px-4 pb-6">
        {/* Avatar — centered */}
        <div className="flex flex-col items-center -mt-10 mb-3 select-none">
          <div
            className={`relative inline-flex h-16 w-16 items-center justify-center overflow-hidden text-2xl font-bold shadow-md ring-[3px] ring-[hsl(var(--v-surface))] ${round}`}
            style={{ background: accent, color: contrast }}
          >
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt={name} className="h-full w-full object-cover" />
            ) : (
              <span className="v-display">{name.charAt(0).toUpperCase()}</span>
            )}
          </div>
        </div>

        {/* Profile Details — centered */}
        <div className="text-center">
          <h1 className="v-display text-[17px] font-bold leading-tight">{name}</h1>
          {(title || company) && (
            <p className="mt-0.5 text-[11px] text-[hsl(var(--v-muted))]">
              {title}
              {title && company ? <span className="mx-1 opacity-40">/</span> : ''}
              {company && <span className="font-medium text-[hsl(var(--v-fg))]/70">{company}</span>}
            </p>
          )}
        </div>

        {/* Bio summary */}
        {about && (
          <p className="mt-2 text-[11.5px] leading-relaxed text-[hsl(var(--v-fg))]/90 line-clamp-3 text-center">
            {about}
          </p>
        )}

        {/* Quick Contact buttons (circles) */}
        {quickActions.length > 0 && (
          <div className="flex justify-center gap-2 mt-3.5 select-none">
            {quickActions.map(({ a, r }) => (
              <div
                key={a.id}
                className="flex h-9 w-9 items-center justify-center rounded-full border transition-transform active:scale-95 cursor-default"
                style={{ borderColor: 'hsl(var(--v-border))', color: r.brand.color, background: 'hsl(var(--v-surface))' }}
              >
                <Icon name={r.brand.icon} size={15} />
              </div>
            ))}
          </div>
        )}

        {/* Save Contact action */}
        <div className="mt-4">
          <motion.button
            onClick={handleSave}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="relative flex h-10 w-full items-center justify-center gap-1.5 overflow-hidden rounded-full text-[12px] font-semibold text-white shadow-sm select-none"
            style={{ background: 'hsl(var(--v-fg))' }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {saveState === 'done' ? (
                <motion.span
                  key="done"
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  className="flex items-center gap-1.5"
                >
                  <Icon name="check" size={15} />
                  {t.saved}
                </motion.span>
              ) : (
                <motion.span
                  key="idle"
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  className="flex items-center gap-1.5"
                >
                  <Icon name={saveState === 'saving' ? 'download' : 'user-plus'} size={15} />
                  {saveState === 'saving' ? t.saving : t.save}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        {/* Lead Capture form mockup */}
        <div className="overflow-hidden rounded-[var(--v-radius)] border border-[hsl(var(--v-border))] bg-[hsl(var(--v-surface))] text-[12px] mt-4">
          <div className="flex border-b border-[hsl(var(--v-border))]">
            {TAB_META.map((m) => {
              const active = engagementTab === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setEngagementTab(m.id);
                    setEngagementDone(null);
                  }}
                  className="relative flex flex-1 items-center justify-center gap-1 py-2 text-[10.5px] font-bold select-none"
                  style={{ color: active ? 'var(--v-accent)' : 'hsl(var(--v-muted))' }}
                >
                  <Icon name={m.icon} size={11} />
                  {engagementLabel[m.id]}
                  {active && (
                    <motion.span layoutId="tab-underline" className="absolute inset-x-2 -bottom-px h-0.5" style={{ background: 'var(--v-accent)' }} />
                  )}
                </button>
              );
            })}
          </div>

          <div className="p-3">
            <AnimatePresence mode="wait" initial={false}>
              {engagementDone ? (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="py-4 text-center"
                >
                  <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full text-[var(--v-accent-contrast)]" style={{ background: 'var(--v-accent)' }}>
                    <Icon name="check" size={16} />
                  </div>
                  <p className="text-[12px] font-semibold text-[hsl(var(--v-fg))]">
                    {engagementDone === 'MEETING' ? t.doneMeeting : engagementDone === 'QUOTE' ? t.doneQuote : t.doneContact}
                  </p>
                  <p className="mt-0.5 text-[10px] text-[hsl(var(--v-muted))]">{t.followup}</p>
                </motion.div>
              ) : (
                <motion.form
                  key="form"
                  onSubmit={handleEngagementSubmit}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-2 text-[11px]"
                >
                  <input
                    required
                    placeholder={t.fullName}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="h-8 w-full rounded-[var(--v-radius)] border border-[hsl(var(--v-border))] bg-[hsl(var(--v-bg))] px-2.5 text-[11px] text-[hsl(var(--v-fg))] outline-none placeholder:text-[hsl(var(--v-faint))] focus:border-[var(--v-accent)]"
                  />
                  <input
                    required
                    type="email"
                    placeholder={t.email}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="h-8 w-full rounded-[var(--v-radius)] border border-[hsl(var(--v-border))] bg-[hsl(var(--v-bg))] px-2.5 text-[11px] text-[hsl(var(--v-fg))] outline-none placeholder:text-[hsl(var(--v-faint))] focus:border-[var(--v-accent)]"
                  />

                  {engagementTab === 'MEETING' && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        required
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="h-8 w-full rounded-[var(--v-radius)] border border-[hsl(var(--v-border))] bg-[hsl(var(--v-bg))] px-2 text-[10px] text-[hsl(var(--v-fg))] outline-none focus:border-[var(--v-accent)]"
                      />
                      <select
                        required
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        className="h-8 w-full rounded-[var(--v-radius)] border border-[hsl(var(--v-border))] bg-[hsl(var(--v-bg))] px-2 text-[10px] text-[hsl(var(--v-fg))] outline-none focus:border-[var(--v-accent)]"
                      >
                        <option value="">{t.time}</option>
                        {['09:00', '11:00', '13:00', '15:00', '17:00'].map((slot) => (
                          <option key={slot} value={slot}>{slot}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {engagementTab === 'QUOTE' && (
                    <textarea
                      required
                      placeholder={t.quotePlaceholder}
                      value={form.note}
                      onChange={(e) => setForm({ ...form, note: e.target.value })}
                      className="h-12 w-full rounded-[var(--v-radius)] border border-[hsl(var(--v-border))] bg-[hsl(var(--v-bg))] p-2 text-[11px] text-[hsl(var(--v-fg))] outline-none placeholder:text-[hsl(var(--v-faint))] focus:border-[var(--v-accent)] resize-none"
                    />
                  )}

                  <button
                    type="submit"
                    disabled={engagementBusy}
                    className="flex h-8 w-full items-center justify-center rounded-[var(--v-radius)] text-[11px] font-semibold text-[var(--v-accent-contrast)] shadow-sm disabled:opacity-50 select-none"
                    style={{ background: 'var(--v-accent)' }}
                  >
                    {engagementBusy ? t.sending : engagementCta}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Link Icon Grid (social tiles) */}
        {linkRows.length > 0 && (
          <div className="mt-4 select-none">
            {/* Section divider — centered label */}
            <div className="mb-3 flex items-center gap-2">
              <span className="h-px flex-1 bg-[hsl(var(--v-border))]" />
              <span className="text-[9.5px] font-semibold text-[hsl(var(--v-muted))]">My Links</span>
              <span className="h-px flex-1 bg-[hsl(var(--v-border))]" />
            </div>
            <div className="grid grid-cols-3 gap-x-3 gap-y-4">
              {linkRows.map(({ a, r }) => (
                <div key={a.id} className="flex flex-col items-center gap-1.5 text-center cursor-default">
                  <span
                    className="flex h-[46px] w-[46px] items-center justify-center rounded-xl text-white shadow-sm"
                    style={{ background: r.brand.color }}
                  >
                    <Icon name={r.brand.icon} size={20} />
                  </span>
                  <span className="text-[10px] font-semibold text-[hsl(var(--v-fg))] leading-tight truncate max-w-full">
                    {r.brand.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payment links — external, link-sharing only (matches the public profile) */}
        {paymentLinks.filter((p) => p.isActive !== false).length > 0 && (
          <div className="mt-5 select-none">
            <div className="my-3.5 flex items-center gap-2">
              <span className="h-px flex-1 bg-[hsl(var(--v-border))]" />
              <span className="text-[9px] font-semibold text-[hsl(var(--v-muted))]">Payments</span>
              <span className="h-px flex-1 bg-[hsl(var(--v-border))]" />
            </div>
            <div className="space-y-1.5">
              {paymentLinks
                .filter((p) => p.isActive !== false)
                .map((p) => {
                  const brand = paymentBrand(p.platform);
                  return (
                    <div key={p.id} className="flex items-center gap-2.5 rounded-xl border border-[hsl(var(--v-border))] bg-[hsl(var(--v-surface))] p-2">
                      <PaymentBrandLogo platform={p.platform} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[10.5px] font-bold text-[hsl(var(--v-fg))]">{p.displayName}</span>
                        <span className="block truncate text-[8.5px] text-[hsl(var(--v-muted))]">{p.description || brand.label}</span>
                      </span>
                      <span className="text-[8.5px] font-semibold text-[hsl(var(--v-muted))]">Open →</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Custom Sections (e.g. text/blocks) */}
        {sections.filter((s) => s.type !== 'BIO').map((s) => {
          const sTitle = text(s.content, 'title') || s.type;
          return (
            <div key={s.id} className="mt-5 text-[11px] select-none">
              {/* Section Divider — centered label */}
              <div className="my-3.5 flex items-center gap-2">
                <span className="h-px flex-1 bg-[hsl(var(--v-border))]" />
                <span className="text-[9px] font-semibold text-[hsl(var(--v-muted))]">{sTitle}</span>
                <span className="h-px flex-1 bg-[hsl(var(--v-border))]" />
              </div>

              {/* VIDEO */}
              {s.type === 'VIDEO' && (() => {
                const raw = text(s.content, 'videoUrl');
                const ytMatch = raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
                const vimeoMatch = raw.match(/vimeo\.com\/(\d+)/);
                const embedUrl = ytMatch ? `https://www.youtube.com/embed/${ytMatch[1]}` : vimeoMatch ? `https://player.vimeo.com/video/${vimeoMatch[1]}` : null;
                return embedUrl ? (
                  <div className="rounded-lg overflow-hidden border border-[hsl(var(--v-border))] aspect-video">
                    <iframe src={embedUrl} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                  </div>
                ) : raw ? (
                  <p className="text-[9px] text-[hsl(var(--v-faint))]">Video URL configured</p>
                ) : null;
              })()}

              {/* PORTFOLIO */}
              {s.type === 'PORTFOLIO' && (() => {
                const images = Array.isArray(s.content.images) ? (s.content.images as string[]) : [];
                return images.length > 0 ? (
                  <div className={`grid gap-1 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    {images.slice(0, 4).map((imgUrl, idx) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={idx} src={imgUrl} alt="" className="w-full aspect-square rounded-md border border-[hsl(var(--v-border))] object-cover" />
                    ))}
                  </div>
                ) : null;
              })()}

              {/* BOOKING */}
              {s.type === 'BOOKING' && text(s.content, 'bookingUrl') && (
                <div className="flex h-7 items-center justify-center gap-1 rounded-md border border-[hsl(var(--v-border))] bg-[hsl(var(--v-surface))] text-[10px] font-semibold cursor-default">
                  📅 {text(s.content, 'buttonLabel') || 'Book a meeting'}
                </div>
              )}

              {/* SOCIAL / generic text fallback */}
              {s.type !== 'VIDEO' && s.type !== 'PORTFOLIO' && s.type !== 'BOOKING' && text(s.content, 'body') && (
                <p className="rounded-lg border border-[hsl(var(--v-border))] bg-[hsl(var(--v-surface))] p-3 leading-relaxed text-[hsl(var(--v-fg))]/90">
                  {text(s.content, 'body')}
                </p>
              )}
            </div>
          );
        })}

        {/* Brand Footer */}
        <footer className="mt-6 flex items-center justify-center gap-1 text-[9px] text-[hsl(var(--v-faint))] select-none">
          <span style={{ color: 'var(--v-accent)' }}><VMark size={10} strokeWidth={3} /></span>
          {t.poweredBy} <span className="font-semibold text-[hsl(var(--v-muted))]">Vertex Connect</span>
        </footer>
      </div>
    </div>
  );
}
