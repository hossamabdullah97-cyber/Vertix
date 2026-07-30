'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_URL } from '@/lib/api';
import { Icon } from '@/components/Icon';
import CalendarPicker from './CalendarPicker';
import { profileStrings, type Lang } from '@/lib/profileI18n';

type Intent = 'CONTACT' | 'MEETING' | 'QUOTE';

const TAB_META: { id: Intent; icon: string }[] = [
  { id: 'CONTACT', icon: 'user' },
  { id: 'MEETING', icon: 'calendar' },
  { id: 'QUOTE', icon: 'quote' },
];

const TIME_SLOTS = ['09:00', '11:00', '13:00', '15:00', '17:00'];

export default function EngagementPanel({ slug, lang = 'en' }: { slug: string; lang?: Lang }) {
  const t = profileStrings(lang);
  const tabLabel: Record<Intent, string> = { CONTACT: t.connect, MEETING: t.meeting, QUOTE: t.quote };

  const [tab, setTab] = useState<Intent>('CONTACT');
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', note: '' });
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Intent | null>(null);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const meetingAt = tab === 'MEETING' && date && time ? `${date}T${time}:00` : undefined;
      const visitorId =
        typeof window !== 'undefined' ? localStorage.getItem('vertex_visitor') ?? undefined : undefined;
      const res = await fetch(`${API_URL}/leads/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, intent: tab, ...form, meetingAt, visitorId }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          Array.isArray(data?.errors) && data.errors.length ? data.errors[0].message : data.message || 'Could not submit',
        );
      setDone(tab);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const cta = tab === 'MEETING' ? t.requestMeeting : tab === 'QUOTE' ? t.requestQuote : t.shareDetails;

  return (
    <div className="overflow-hidden rounded-[var(--v-radius)] border border-[hsl(var(--v-border))] bg-[hsl(var(--v-surface))]">
      <div className="flex border-b border-[hsl(var(--v-border))]">
        {TAB_META.map((m) => {
          const active = tab === m.id;
          return (
            <button
              key={m.id}
              onClick={() => {
                setTab(m.id);
                setDone(null);
                setError('');
              }}
              className="relative flex flex-1 items-center justify-center gap-1.5 py-3 text-[13px] font-semibold"
              style={{ color: active ? 'var(--v-accent)' : 'hsl(var(--v-muted))' }}
            >
              <Icon name={m.icon} size={16} />
              {tabLabel[m.id]}
              {active && (
                <motion.span layoutId="tab-underline" className="absolute inset-x-3 -bottom-px h-0.5" style={{ background: 'var(--v-accent)' }} />
              )}
            </button>
          );
        })}
      </div>

      <div className="p-4">
        <AnimatePresence mode="wait" initial={false}>
          {done ? (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="py-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-[var(--v-accent-contrast)]" style={{ background: 'var(--v-accent)' }}>
                <Icon name="check" size={24} />
              </div>
              <p className="text-[15px] font-semibold text-[hsl(var(--v-fg))]">
                {done === 'MEETING' ? t.doneMeeting : done === 'QUOTE' ? t.doneQuote : t.doneContact}
              </p>
              <p className="mt-1 text-[13px] text-[hsl(var(--v-muted))]">{t.followup}</p>
            </motion.div>
          ) : (
            <motion.form key={tab} onSubmit={submit} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} className="grid gap-2.5">
              <Field placeholder={t.fullName} value={form.name} onChange={(v) => set('name', v)} required />
              <div className="grid grid-cols-2 gap-2.5">
                <Field placeholder={t.email} type="email" value={form.email} onChange={(v) => set('email', v)} />
                <Field placeholder={t.phone} type="tel" value={form.phone} onChange={(v) => set('phone', v)} />
              </div>
              <Field placeholder={t.company} value={form.company} onChange={(v) => set('company', v)} />

              {tab === 'MEETING' && (
                <div className="grid gap-2 pt-1">
                  <p className="text-[12px] font-semibold text-[hsl(var(--v-muted))]">{t.pickDay}</p>
                  <CalendarPicker value={date} onChange={setDate} accent="var(--v-accent)" />
                  <p className="pt-1 text-[12px] font-semibold text-[hsl(var(--v-muted))]">{t.time}</p>
                  <div className="flex flex-wrap gap-2">
                    {TIME_SLOTS.map((slot) => {
                      const active = time === slot;
                      return (
                        <button
                          type="button"
                          key={slot}
                          onClick={() => setTime(slot)}
                          className="flex items-center gap-1.5 rounded-[var(--v-radius)] border px-3 py-2 text-[13px] font-medium"
                          style={{
                            borderColor: active ? 'var(--v-accent)' : 'hsl(var(--v-border))',
                            background: active ? 'var(--v-accent)' : 'transparent',
                            color: active ? 'var(--v-accent-contrast)' : 'hsl(var(--v-fg))',
                          }}
                        >
                          <Icon name="clock" size={14} />
                          {slot}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {(tab === 'QUOTE' || tab === 'MEETING') && (
                <textarea
                  placeholder={tab === 'QUOTE' ? t.quotePlaceholder : t.noteOptional}
                  value={form.note}
                  onChange={(e) => set('note', e.target.value)}
                  rows={2}
                  className="w-full rounded-[var(--v-radius)] border border-[hsl(var(--v-border))] bg-[hsl(var(--v-bg))] px-3.5 py-2.5 text-[14px] text-[hsl(var(--v-fg))] outline-none placeholder:text-[hsl(var(--v-faint))] focus:border-[var(--v-accent)]"
                />
              )}

              {error && <p className="text-[12px] text-red-500">{error}</p>}

              <motion.button type="submit" disabled={busy} whileTap={{ scale: 0.98 }} className="mt-1 h-12 rounded-[var(--v-radius)] text-[14px] font-semibold text-[var(--v-accent-contrast)] disabled:opacity-60" style={{ background: 'var(--v-accent)' }}>
                {busy ? t.sending : cta}
              </motion.button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Field({
  placeholder,
  value,
  onChange,
  type = 'text',
  required,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 w-full rounded-[var(--v-radius)] border border-[hsl(var(--v-border))] bg-[hsl(var(--v-bg))] px-3.5 text-[14px] text-[hsl(var(--v-fg))] outline-none placeholder:text-[hsl(var(--v-faint))] focus:border-[var(--v-accent)]"
    />
  );
}
