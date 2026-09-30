'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch, authPostFile, apiMessageOf } from '@/lib/client';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import type { Lead } from '@/lib/crm';
import { contactFromQr, contactFromText, mergeContacts, type CardContact } from '@/lib/card-text';
import { canvasJpeg, photoCanvas, readQr, readText, type ReadProgress } from '@/lib/card-reader';

type Scanned = CardContact;
/** How the card was read: its QR code (exact), Claude on the server, or this phone. */
type ReadBy = 'qr' | 'ai' | 'device' | 'deviceArabic';

const found = (c: CardContact | null) => !!c && !!(c.name || c.company || c.emails.length || c.phones.length);

type Fields = { name: string; title: string; company: string; email: string; phone: string; website: string; address: string; note: string };
const EMPTY: Fields = { name: '', title: '', company: '', email: '', phone: '', website: '', address: '', note: '' };

/**
 * Add a lead yourself: photograph a paper business card and check what was
 * read, or type the details in. The card's QR code is read first; then its
 * text, by Claude when the server has it turned on, else on the phone
 * itself. Nothing is saved until you press Save, and the photo never is.
 */
export function AddLead({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (lead: Lead) => void }) {
  const { t } = useTranslation('crm');
  const camera = useRef<HTMLInputElement>(null);
  // Only the latest photo's answer counts; a slower one for an older photo is dropped.
  const latest = useRef(0);
  const [aiReady, setAiReady] = useState(false);
  const [readBy, setReadBy] = useState<ReadBy | null>(null);
  const [progress, setProgress] = useState<ReadProgress | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [scanned, setScanned] = useState<Scanned | null>(null);
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [fromScan, setFromScan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    authFetch<{ available: boolean }>('/leads/scan')
      .then((r) => setAiReady(r.available))
      .catch(() => setAiReady(false));
  }, [open]);

  function reset() {
    setPhoto((p) => {
      if (p) URL.revokeObjectURL(p);
      return null;
    });
    setScanned(null);
    setFields(EMPTY);
    setFromScan(false);
    setError(null);
    setReading(false);
    setReadBy(null);
    setProgress(null);
  }

  function close() {
    latest.current++;
    onClose();
    setTimeout(reset, 250);
  }

  function fill(c: CardContact, by: ReadBy) {
    setScanned(c);
    setReadBy(by);
    setFromScan(true);
    setFields({
      name: c.name ?? '',
      title: c.title ?? '',
      company: c.company ?? '',
      email: c.emails[0] ?? '',
      phone: c.phones[0] ?? '',
      website: c.website ?? '',
      address: c.address ?? '',
      // What had no field of its own is kept, so nothing on the card is lost.
      note: [c.nameAlt, ...c.emails.slice(1), ...c.phones.slice(1)].filter(Boolean).join('\n'),
    });
  }

  async function scan(file: File | undefined) {
    if (!file) return;
    const id = ++latest.current;
    const current = () => id === latest.current;
    reset();
    setPhoto(URL.createObjectURL(file));
    setReading(true);
    try {
      const canvas = await photoCanvas(file);

      // 1. A QR code with a vCard is exact: nothing to guess.
      const qrText = await readQr(canvas).catch(() => null);
      const qr = qrText ? contactFromQr(qrText) : null;
      if (!current()) return;
      if (qr && (qr.name || qr.emails.length || qr.phones.length)) return fill(qr, 'qr');

      // 2. Claude, when the server has it: best at names and Arabic.
      if (aiReady) {
        try {
          const c = await authPostFile<Scanned>('/leads/scan', await canvasJpeg(canvas), 'card.jpg');
          if (!current()) return;
          return fill(qr ? mergeContacts(c, qr) : c, 'ai');
        } catch (e) {
          if (!current()) return;
          if ((e as { status?: number }).status === 422) {
            setError(t('add.errors.notCard'));
            return;
          }
          // Down or over its limit: read it here instead.
        }
      }

      // 3. On this phone.
      const lines = await readText(canvas, (p) => current() && setProgress(p));
      if (!current()) return;
      const c = qr ? mergeContacts(contactFromText(lines), qr) : contactFromText(lines);
      if (!found(c)) {
        setError(t('add.errors.notCard'));
        return;
      }
      // Tesseract reads Arabic, and Arabic digits above all, much less well than English.
      fill(c, lines.some((l) => /[\u0600-\u06FF]/.test(l.text)) ? 'deviceArabic' : 'device');
    } catch {
      if (current()) setError(t('add.errors.read'));
    } finally {
      if (current()) {
        setReading(false);
        setProgress(null);
      }
    }
  }

  async function save() {
    if (!fields.name.trim() && !fields.email.trim() && !fields.phone.trim()) {
      setError(t('add.errors.empty'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string> = { source: fromScan ? 'card_scan' : 'manual' };
      for (const [k, v] of Object.entries(fields)) if (v.trim()) body[k] = v.trim();
      const lead = await authFetch<Lead>('/leads', { method: 'POST', body: JSON.stringify(body) });
      onAdded(lead);
      close();
    } catch (e) {
      setError(/email/i.test(apiMessageOf(e)) ? t('add.errors.email') : t('add.errors.save'));
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof Fields, opts: { type?: string; dir?: 'ltr'; wide?: boolean } = {}) => (
    <label className={`block ${opts.wide ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1.5 block text-xs font-medium text-ink">{t(`add.fields.${key}`)}</span>
      <input
        type={opts.type ?? 'text'}
        dir={opts.dir}
        className="v-field"
        value={fields[key]}
        onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
      />
    </label>
  );

  const footer = (
    <div className="flex items-center gap-2">
      <button type="button" className="v-btn v-btn-ghost" onClick={close} disabled={saving}>
        {t('add.cancel')}
      </button>
      <button type="button" className="v-btn v-btn-primary ms-auto" onClick={save} disabled={saving || reading}>
        {saving ? t('add.saving') : t('add.save')}
      </button>
    </div>
  );

  return (
    <Sheet open={open} onClose={close} closeLabel={t('drawer.close')} title={t('add.title')} subtitle={t('add.subtitleScan')} footer={footer}>
      <div className="mb-5">
        <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { void scan(e.target.files?.[0]); e.target.value = ''; }} />
        {photo ? (
          <div className="relative overflow-hidden rounded-xl ring-1 ring-inset ring-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt={t('add.photoAlt')} className={`max-h-52 w-full object-contain bg-elevated ${reading ? 'opacity-60' : ''}`} />
            {reading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-sm ring-1 ring-line">
                  {progress?.phase === 'loading'
                    ? t('add.preparing')
                    : progress
                      ? t('add.readingPct', { pct: Math.round(progress.progress * 100) })
                      : t('add.reading')}
                </span>
              </div>
            )}
            {!reading && (
              <button type="button" onClick={() => camera.current?.click()} className="absolute bottom-2 end-2 rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-sm ring-1 ring-line hover:bg-elevated">
                {t('add.retake')}
              </button>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => camera.current?.click()} className="flex w-full items-center gap-3 rounded-xl p-4 text-start ring-1 ring-inset ring-line transition-colors hover:bg-elevated">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Icon name="camera" size={18} />
            </span>
            <span>
              <span className="block text-sm font-medium text-ink">{t('add.scan')}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">{t('add.scanHint')}</span>
            </span>
          </button>
        )}
        {scanned && !reading && readBy && (
          <p className={`mt-2 text-xs leading-relaxed ${readBy === 'deviceArabic' ? 'rounded-lg bg-amber-500/[0.08] px-3 py-2 text-amber-800 dark:text-amber-300' : 'text-muted'}`}>
            {t(`add.readBy.${readBy}`)}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-500/[0.07] px-3 py-2.5 text-xs leading-relaxed text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {field('name', { wide: true })}
        {field('title')}
        {field('company')}
        {field('email', { type: 'email', dir: 'ltr' })}
        {field('phone', { type: 'tel', dir: 'ltr' })}
        {field('website', { dir: 'ltr' })}
        {field('address')}
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs font-medium text-ink">{t('add.fields.note')}</span>
          <textarea className="v-field min-h-20" value={fields.note} onChange={(e) => setFields((f) => ({ ...f, note: e.target.value }))} />
        </label>
      </div>
    </Sheet>
  );
}
