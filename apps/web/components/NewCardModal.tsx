'use client';

import { useEffect, useMemo, useRef, useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { authFetch, type Card } from '@/lib/client';
import { TEMPLATES, type Template } from '@/lib/templates';
import { Icon } from '@/components/Icon';

function slugify(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
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
  const L = [1, 2, 3].map((i) => {
    const c = parseInt(m[i], 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * L[0] + 0.7152 * L[1] + 0.0722 * L[2] > 0.6 ? '#141414' : '#ffffff';
}

const STEPS = ['Details', 'Style'] as const;

export default function NewCardModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [hasManuallyEditedSlug, setHasManuallyEditedSlug] = useState(false);
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  // Reset to a clean state when the modal closes, and focus name input when opened.
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => nameRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    } else {
      setStep(0);
      setFullName('');
      setTitle('');
      setCustomSlug('');
      setHasManuallyEditedSlug(false);
      setTemplateId(TEMPLATES[0].id);
      setError('');
      setBusy(false);
    }
  }, [open]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const tpl = useMemo(() => TEMPLATES.find((t) => t.id === templateId)!, [templateId]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFullName(val);
    if (!hasManuallyEditedSlug) {
      setCustomSlug(slugify(val));
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHasManuallyEditedSlug(true);
    setCustomSlug(slugify(e.target.value));
  };

  const grouped = useMemo(
    () => ({
      light: TEMPLATES.filter((t) => t.mode === 'light'),
      dark: TEMPLATES.filter((t) => t.mode === 'dark'),
    }),
    [],
  );

  async function create() {
    setError('');
    setBusy(true);
    try {
      const card = await authFetch<Card>('/cards', {
        method: 'POST',
        body: JSON.stringify({
          templateId,
          slug: hasManuallyEditedSlug ? (customSlug.trim() || undefined) : undefined,
          fullName: fullName.trim() || undefined,
          title: title.trim() || undefined,
          theme: { accent: tpl.accent, mode: tpl.mode, cover: tpl.cover, avatar: tpl.avatar },
        }),
      });
      onCreated(card.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center"
          style={{ background: 'rgba(6,6,10,0.6)', backdropFilter: 'blur(3px)', willChange: 'opacity' }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-card-title"
            initial={{ scale: 0.96, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: 16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="v-card my-8 grid w-full max-w-[740px] grid-cols-1 overflow-hidden p-0 sm:grid-cols-[1fr_250px] border border-line will-change-[transform,opacity]"
            style={{ boxShadow: 'var(--v-shadow-lg)' }}
          >
            {/* ---------------- Left: guided form ---------------- */}
            <div className="flex flex-col text-left">
              {/* Header + stepper */}
              <div className="border-b border-line px-6 pb-4 pt-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 id="new-card-title" className="v-display text-[18px] font-black text-ink">Create a digital card</h2>
                    <p className="text-[12.5px] text-muted font-medium">Two quick steps — customize card style and custom URL link path.</p>
                  </div>
                  <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-ink transition-colors" aria-label="Close">
                    <Icon name="x" size={16} />
                  </button>
                </div>

                {/* Stepper */}
                <div className="mt-4 flex items-center gap-2">
                  {STEPS.map((label, i) => (
                    <div key={label} className="flex flex-1 items-center gap-2">
                      <span
                        aria-current={step === i ? 'step' : undefined}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black transition-colors"
                        style={
                          i <= step
                            ? { background: 'var(--v-accent)', color: 'var(--v-accent-contrast, #fff)' }
                            : { background: 'hsl(var(--v-border))', color: 'hsl(var(--v-muted))' }
                        }
                      >
                        {i < step ? <Icon name="check" size={12} /> : i + 1}
                      </span>
                      <span className={`text-[12px] font-extrabold ${i <= step ? 'text-ink' : 'text-faint'}`}>{label}</span>
                      {i < STEPS.length - 1 && <span className="h-px flex-1 bg-line" />}
                    </div>
                  ))}
                </div>
              </div>

              {/* Step body */}
              <div className="min-h-[300px] flex-1 px-6 py-5">
                <AnimatePresence mode="wait" initial={false}>
                  {step === 0 ? (
                    <motion.form
                      key="details"
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.22 }}
                      onSubmit={(e) => { e.preventDefault(); setStep(1); }}
                      className="grid gap-4"
                    >
                      <label className="grid gap-1.5">
                        <span className="text-[12.5px] font-bold text-muted uppercase">Full name</span>
                        <input
                          ref={nameRef}
                          className="v-field font-semibold"
                          value={fullName}
                          onChange={handleNameChange}
                          placeholder="Sarah Chen"
                          required
                        />
                      </label>
                      <label className="grid gap-1.5">
                        <span className="text-[12.5px] font-bold text-muted uppercase">
                          Job title <span className="font-normal text-faint">(optional)</span>
                        </span>
                        <input
                          className="v-field font-semibold"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="Lead Product Designer"
                        />
                      </label>

                      <label className="grid gap-1.5">
                        <span className="text-[12.5px] font-bold text-muted uppercase">Custom URL Slug</span>
                        <div className="flex items-center">
                          <span className="bg-canvas border border-e-0 border-line rounded-s-xl px-3 py-2 text-xs text-muted select-none font-bold">/c/</span>
                          <input
                            className="v-field rounded-s-none flex-1 font-semibold"
                            value={customSlug}
                            onChange={handleSlugChange}
                            placeholder="auto-generated-slug"
                          />
                        </div>
                      </label>

                      <p className="text-[11px] text-faint font-medium leading-relaxed">
                        Customize your business card link URL. You can edit all details and add links, emails, and phone numbers in the card editor later.
                      </p>
                      <button type="submit" className="hidden" aria-hidden />
                    </motion.form>
                  ) : (
                    <motion.div
                      key="style"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ duration: 0.22 }}
                      className="grid gap-5"
                    >
                      <TemplateGroup label="Light Presets" items={grouped.light} selected={templateId} onSelect={setTemplateId} />
                      <TemplateGroup label="Dark Presets" items={grouped.dark} selected={templateId} onSelect={setTemplateId} />
                    </motion.div>
                  )}
                </AnimatePresence>

                {error && <p className="mt-3 text-[13px] text-red-500 font-bold">⚠️ {error}</p>}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between gap-2.5 border-t border-line px-6 py-4">
                <button
                  onClick={step === 0 ? onClose : () => setStep(0)}
                  className="v-btn v-btn-ghost text-xs font-bold"
                >
                  {step === 0 ? 'Cancel' : '← Back'}
                </button>
                {step === 0 ? (
                  <button
                    onClick={() => {
                      if (fullName.trim()) setStep(1);
                      else nameRef.current?.reportValidity();
                    }}
                    className="v-btn text-xs font-bold bg-accent text-white"
                  >
                    Continue <Icon name="arrow" size={14} className="rtl:rotate-180 ml-1" />
                  </button>
                ) : (
                  <button onClick={create} disabled={busy} className="v-btn text-xs font-bold bg-accent text-white">
                    {busy ? 'Creating…' : (<><Icon name="sparkle" size={14} className="mr-1" /> Create card</>)}
                  </button>
                )}
              </div>
            </div>

            {/* ---------------- Right: live preview ---------------- */}
            <div className="relative hidden flex-col items-center justify-center border-s border-line bg-canvas/20 p-6 sm:flex overflow-hidden w-[250px]">
              <span className="absolute start-5 top-5 text-[9px] font-black uppercase tracking-wider text-faint select-none">Live preview</span>
              
              {/* Phone Device Mockup Frame */}
              <div
                className="relative w-[190px] h-[340px] rounded-[38px] border-[6px] border-ink bg-surface shadow-2xl p-1.5 flex flex-col justify-between overflow-hidden scale-95 transition-all duration-300 select-none"
                style={{
                  boxShadow: `0 20px 40px -10px ${tpl.accent}30, var(--v-shadow-lg)`
                }}
              >
                {/* Speaker/Camera Notch */}
                <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-14 h-3 bg-ink rounded-full z-20 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-900 ml-auto mr-1" />
                </div>
                
                {/* Mockup screen content */}
                <div className="w-full h-full overflow-hidden rounded-[28px] bg-canvas/30">
                  <MiniPreview name={fullName} title={title} tpl={tpl} />
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const TemplateGroup = memo(function TemplateGroup({
  label,
  items,
  selected,
  onSelect,
}: {
  label: string;
  items: Template[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-faint">{label}</p>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {items.map((t) => {
          const isSelected = selected === t.id;
          const isDark = t.mode === 'dark';
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              aria-pressed={isSelected}
              title={t.name}
              className="group relative overflow-hidden rounded-[12px] border-2 text-left transition-all hover:scale-[1.03]"
              style={{ borderColor: isSelected ? 'var(--v-accent)' : 'hsl(var(--v-border))' }}
            >
              <div className="relative h-12" style={{ background: isDark ? '#0b0b0e' : t.accent }}>
                {isDark && <span className="absolute inset-0 opacity-70" style={{ background: `radial-gradient(60% 80% at 70% 30%, ${t.accent}66, transparent)` }} />}
                <span className="absolute bottom-1.5 start-2 h-4 w-4 rounded-full border-2 border-white/70 shadow-sm" style={{ background: t.accent }} />
                {isSelected && (
                  <span className="absolute end-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-white bg-accent shadow" style={{ background: 'var(--v-accent)' }}>
                    <Icon name="check" size={10} />
                  </span>
                )}
              </div>
              <div className="truncate bg-surface px-2 py-1 text-[10px] font-bold text-ink">{t.name}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
});

/** A faithful mini profile card that updates as the user types + picks a style. */
const MiniPreview = memo(function MiniPreview({ name, title, tpl }: { name: string; title: string; tpl: Template }) {
  const accent = tpl.accent;
  const contrast = contrastOf(accent);
  const dark = tpl.mode === 'dark';
  const cover = tpl.cover ?? (dark ? 'constellation' : 'gradient');
  const round = tpl.avatar === 'square' ? 'rounded-[10px]' : 'rounded-full';
  const displayName = name.trim() || 'Your Name';
  const displayTitle = title.trim() || 'Job Title';

  return (
    <motion.div
      key={tpl.id}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="w-full h-full flex flex-col overflow-hidden text-left"
      style={{
        background: dark ? '#0a0a0c' : '#ffffff',
        color: dark ? '#fafafa' : '#0a0a0a',
      }}
    >
      {/* cover */}
      <div className="relative h-20 shrink-0 select-none">
        {cover === 'constellation' ? (
          <div className="absolute inset-0 bg-[#070709]">
            <span className="absolute inset-0 opacity-45" style={{ background: `radial-gradient(80% 100% at 30% 10%, ${accent}33, transparent 70%)` }} />
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
          </div>
        ) : cover === 'solid' ? (
          <div className="absolute inset-0" style={{ background: accent }} />
        ) : (
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${accent}, ${shade(accent, -46)})` }} />
        )}
      </div>

      {/* Profile area */}
      <div className="px-3 pb-3 flex-1 flex flex-col justify-between -mt-8 relative z-10">
        <div className="space-y-2">
          {/* avatar */}
          <div className="relative z-10 inline-block">
            <div
              className={`flex h-11 w-11 items-center justify-center text-[15px] font-black shadow-md border-2 border-transparent ${round}`}
              style={{ 
                background: accent, 
                color: contrast, 
                boxShadow: `0 0 0 3px ${dark ? '#0a0a0c' : '#ffffff'}` 
              }}
            >
              {(name.trim()[0] || '?').toUpperCase()}
            </div>
          </div>

          {/* details */}
          <div className="space-y-0.5 min-w-0">
            <h4 className="v-display truncate text-[12.5px] font-black tracking-tight leading-tight" style={{ opacity: name.trim() ? 1 : 0.5 }}>
              {displayName}
            </h4>
            <p className="truncate text-[9.5px] font-semibold leading-none text-muted" style={{ opacity: title.trim() ? 1 : 0.4 }}>
              {displayTitle}
            </p>
          </div>

          {/* status chip */}
          <div className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-bold border border-line" style={{ color: dark ? '#a1a1aa' : '#71717a' }}>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Available
          </div>

          {/* Mock Contact Links */}
          <div className="grid grid-cols-4 gap-1.5 pt-1 text-muted select-none pointer-events-none">
            {['mail', 'phone', 'users', 'inbox'].map((icon) => (
              <div
                key={icon}
                className="flex h-6 items-center justify-center rounded-lg border border-line bg-canvas/30 text-muted"
              >
                <Icon name={icon} size={10} />
              </div>
            ))}
          </div>
        </div>

        {/* save button */}
        <div className="mt-2 shrink-0 flex h-7 items-center justify-center gap-1 rounded-lg text-[9.5px] font-bold shadow-sm select-none" style={{ background: accent, color: contrast }}>
          <Icon name="user-plus" size={11} /> Save Contact
        </div>
      </div>
    </motion.div>
  );
});
