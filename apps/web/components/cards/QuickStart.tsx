'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { authFetch, type Card as CardType } from '@/lib/client';
import { Icon } from '@/components/Icon';
import { ImageUpload } from '@/components/ImageUpload';

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

/** A deliberately short list — the full 19 live in the Templates tab. */
const LOOKS = [
  { id: 'swiss-blue',   accent: '#2563eb', mode: 'light' as const },
  { id: 'swiss-green',  accent: '#15803d', mode: 'light' as const },
  { id: 'swiss-violet', accent: '#7c3aed', mode: 'light' as const },
  { id: 'noir-blue',    accent: '#60a5fa', mode: 'dark'  as const },
  { id: 'noir-amber',   accent: '#fbbf24', mode: 'dark'  as const },
  { id: 'carbon',       accent: '#ffffff', mode: 'dark'  as const },
];

const STEPS = ['identity', 'channels', 'look'] as const;

/**
 * A three-step path to a usable card. It writes through the same endpoints the
 * studio uses and commits once at the end, so stepping back never leaves the
 * card half-saved.
 */
export default function QuickStart({
  cardId,
  card,
  onDone,
  onSkip,
}: {
  cardId: string;
  card: CardType;
  /** Called after a successful commit; the parent reloads and shows the studio. */
  onDone: () => void;
  /** Leave the guided path without saving anything. */
  onSkip: () => void;
}) {
  const { t } = useTranslation('cardEditor');
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const existing = (card.vcardData as Record<string, string>) ?? {};
  const [fullName, setFullName] = useState(existing.fullName ?? '');
  const [org, setOrg] = useState(existing.org ?? '');
  const [avatar, setAvatar] = useState(existing.avatar ?? '');
  const [values, setValues] = useState<Partial<Record<ChannelKey, string>>>({});
  const [look, setLook] = useState(LOOKS[0]);

  const chosen = useMemo(
    () => CHANNELS.filter((c) => (values[c.key] ?? '').trim().length > 0),
    [values],
  );

  const canContinue = step === 0 ? fullName.trim().length > 0 : true;

  async function commit() {
    setSaving(true);
    setError('');
    try {
      await authFetch(`/cards/${cardId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          templateId: look.id,
          theme: { accent: look.accent, mode: look.mode, cover: 'gradient', lang: 'en' },
          vcardData: { ...existing, fullName: fullName.trim(), org: org.trim(), avatar },
        }),
      });

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
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  const initial = (fullName.trim()[0] ?? '؟').toUpperCase();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Progress */}
      <div className="mb-8 flex items-center gap-3">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-3">
            <div className="flex-1">
              <div
                className={`h-1 rounded-full transition-colors duration-300 ${
                  i <= step ? 'bg-accent' : 'bg-line'
                }`}
              />
              <p className={`mt-2 text-[11px] font-bold ${i === step ? 'text-ink' : 'text-faint'}`}>
                {t(`quickStart.steps.${s}`)}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* ---------- panel ---------- */}
        <div>
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {step === 0 && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-[22px] font-extrabold tracking-tight text-ink">{t('quickStart.identity.title')}</h2>
                    <p className="mt-1 text-[14px] text-muted">{t('quickStart.identity.subtitle')}</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11.5px] font-bold uppercase tracking-wider text-muted">
                      {t('profile.fullName')}
                    </label>
                    <input
                      autoFocus
                      className="v-field font-semibold"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={t('profile.fullNamePlaceholder')}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11.5px] font-bold uppercase tracking-wider text-muted">
                      {t('profile.jobTitle')}
                    </label>
                    <input
                      className="v-field"
                      value={org}
                      onChange={(e) => setOrg(e.target.value)}
                      placeholder={t('profile.jobTitlePlaceholder')}
                    />
                  </div>

                  <div className="rounded-xl border border-line bg-canvas/30 p-4">
                    <ImageUpload label={t('profile.avatarLabel')} shape="circle" value={avatar} onChange={setAvatar} />
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-[22px] font-extrabold tracking-tight text-ink">{t('quickStart.channels.title')}</h2>
                    <p className="mt-1 text-[14px] text-muted">{t('quickStart.channels.subtitle')}</p>
                  </div>

                  <div className="space-y-2.5">
                    {CHANNELS.map((c) => {
                      const value = values[c.key] ?? '';
                      const on = value.trim().length > 0;
                      return (
                        <div
                          key={c.key}
                          className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                            on ? 'border-accent/40 bg-accent-soft/30' : 'border-line bg-surface'
                          }`}
                        >
                          <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                            style={{ background: c.color }}
                          >
                            <Icon name={c.icon} size={16} />
                          </span>
                          <label className="w-24 shrink-0 text-[13px] font-bold text-ink">
                            {t(`quickStart.channels.${c.key}`)}
                          </label>
                          <input
                            dir={c.dir}
                            className="v-field !h-9 flex-1 text-[13px]"
                            value={value}
                            onChange={(e) => setValues((v) => ({ ...v, [c.key]: e.target.value }))}
                            placeholder={t(`quickStart.channels.${c.key}Placeholder`)}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-[12.5px] text-faint">{t('quickStart.channels.hint')}</p>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-[22px] font-extrabold tracking-tight text-ink">{t('quickStart.look.title')}</h2>
                    <p className="mt-1 text-[14px] text-muted">{t('quickStart.look.subtitle')}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                    {LOOKS.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => setLook(l)}
                        aria-pressed={look.id === l.id}
                        className={`aspect-[3/4] rounded-xl border-2 transition-all ${
                          look.id === l.id ? 'border-accent scale-105 shadow-md' : 'border-line hover:border-line-strong'
                        }`}
                        style={{ background: l.mode === 'dark' ? '#0f1115' : '#ffffff' }}
                      >
                        <span
                          className="mx-auto block h-8 rounded-t-lg"
                          style={{ background: l.accent, opacity: l.mode === 'dark' ? 0.8 : 1 }}
                        />
                        <span
                          className="mx-auto mt-2 block h-6 w-6 rounded-full border-2"
                          style={{ background: l.accent, borderColor: l.mode === 'dark' ? '#0f1115' : '#fff' }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {error && <p className="mt-4 text-[13px] font-semibold text-red-500">{error}</p>}

          {/* Navigation */}
          <div className="mt-8 flex items-center gap-3 border-t border-line pt-5">
            {step > 0 && (
              <button onClick={() => setStep(step - 1)} className="v-btn v-btn-ghost !h-10 px-5 text-[13.5px] font-bold">
                {t('quickStart.back')}
              </button>
            )}

            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canContinue}
                className="v-btn !h-10 px-6 text-[13.5px] font-bold disabled:opacity-40"
              >
                {t('quickStart.next')}
              </button>
            ) : (
              <button
                onClick={commit}
                disabled={saving}
                className="v-btn !h-10 px-6 text-[13.5px] font-bold disabled:opacity-50"
              >
                {saving ? t('quickStart.saving') : t('quickStart.finish')}
              </button>
            )}

            <button
              onClick={onSkip}
              className="ms-auto text-[12.5px] font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              {t('quickStart.skip')}
            </button>
          </div>
        </div>

        {/* ---------- live mini preview ---------- */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-faint">
            {t('quickStart.preview')}
          </p>
          <div
            className="overflow-hidden rounded-[22px] border border-line shadow-lg"
            style={{ background: look.mode === 'dark' ? '#0f1115' : '#ffffff' }}
          >
            <div className="h-20" style={{ background: `linear-gradient(135deg, ${look.accent}, ${look.accent}bb)` }} />
            <div className="px-5 pb-6 text-center">
              <div
                className="mx-auto -mt-9 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-4 text-[22px] font-extrabold text-white"
                style={{ background: look.accent, borderColor: look.mode === 'dark' ? '#0f1115' : '#fff' }}
              >
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  initial
                )}
              </div>

              <h3
                className="mt-3 text-[16px] font-extrabold"
                style={{ color: look.mode === 'dark' ? '#f4f6fa' : '#0f172a' }}
              >
                {fullName.trim() || t('quickStart.previewName')}
              </h3>
              <p className="text-[12.5px]" style={{ color: look.mode === 'dark' ? '#93a0b4' : '#64748b' }}>
                {org.trim() || t('quickStart.previewRole')}
              </p>

              {chosen.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {chosen.map((c) => (
                    <span
                      key={c.key}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-white shadow-sm"
                      style={{ background: c.color }}
                    >
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
