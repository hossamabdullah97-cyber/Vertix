'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch, apiMessageOf } from '@/lib/client';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import type { Lead } from '@/lib/crm';
import type { CardContact } from '@/lib/card-text';
import type { ReadProgress } from '@/lib/card-reader';
import { readCardPhoto, scanAvailable, type ReadBy } from '@/lib/read-card';
import { problemOf, useChecks, type Problem } from '@/lib/validate';
import { FieldError } from '@/components/ui/FieldError';

type Scanned = CardContact;
/** How the card was read: its QR code (exact), Claude on the server, or this phone. */


type Fields = { name: string; title: string; company: string; email: string; phone: string; website: string; address: string; note: string };
const EMPTY: Fields = { name: '', title: '', company: '', email: '', phone: '', website: '', address: '', note: '' };

/**
 * Add a lead yourself: photograph a paper business card and check what was
 * read, or type the details in. The card's QR code is read first; then its
 * text, by Claude when the server has it turned on, else on the phone
 * itself. Nothing is saved until you press Save, and the photo never is.
 */
export function AddLead({
  open,
  onClose,
  onAdded,
  initialFile,
  note,
  inPerson,
  quick,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (lead: Lead) => void;
  /** A photo taken before the sheet opened (the "Met someone" screen's camera), read at once. */
  initialFile?: File | null;
  /** Starts the notes, as in "Met at Cairo ICT". */
  note?: string;
  /** Taken down face to face: typed details count as met in person, not added later by hand. */
  inPerson?: boolean;
  /** Just the few fields worth typing standing up, without the card scanner. */
  quick?: boolean;
}) {
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

  const [aiChecked, setAiChecked] = useState(false);
  useEffect(() => {
    if (!open) return;
    void scanAvailable()
      .then(setAiReady)
      .finally(() => setAiChecked(true));
  }, [open]);

  // A photo handed in is read once whether the server can read cards is known.
  const handled = useRef<File | null>(null);
  useEffect(() => {
    if (open && aiChecked && initialFile && handled.current !== initialFile) {
      handled.current = initialFile;
      void scan(initialFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, aiChecked, initialFile]);
  useEffect(() => {
    if (open && note && !initialFile) setFields((f) => (f.note ? f : { ...f, note }));
  }, [open, note, initialFile]);

  function reset() {
    setPhoto((p) => {
      if (p) URL.revokeObjectURL(p);
      return null;
    });
    setScanned(null);
    setFields(note ? { ...EMPTY, note } : EMPTY);
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
      note: [note, c.nameAlt, ...c.emails.slice(1), ...c.phones.slice(1)].filter(Boolean).join('\n'),
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
      // The QR code, then Claude on the server when it is there, then this phone (lib/read-card.ts).
      const read = await readCardPhoto(file, { ai: aiReady, current, onProgress: setProgress });
      if (!read) return;
      if (!read.ok) {
        setError(t(read.error === 'notCard' ? 'add.errors.notCard' : 'add.errors.read'));
        return;
      }
      fill(read.contact, read.by);
    } finally {
      if (current()) {
        setReading(false);
        setProgress(null);
      }
    }
  }

  // Shown under the field as it is left, and on save; the API applies the same rules.
  const checks = useChecks<keyof Fields>({
    name: !fields.name.trim() && !fields.email.trim() && !fields.phone.trim() ? 'oneOf' : null,
    email: problemOf(fields.email, { kind: 'email' }),
  } as Record<keyof Fields, Problem | null>);
  const problemText = (key: keyof Fields) => {
    const p = checks.shown(key);
    return p === 'oneOf' ? t('add.errors.empty') : p === 'email' ? t('add.errors.email') : null;
  };

  async function save() {
    if (!checks.check()) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string> = { source: fromScan ? 'card_scan' : inPerson ? 'in_person' : 'manual' };
      for (const [k, v] of Object.entries(fields)) if (v.trim()) body[k] = v.trim();
      if (navigator.onLine === false) {
        // No signal: the outbox keeps it on this phone and sends it once
        // the connection is back (lib/outbox.ts). Nothing to wait for here.
        void authFetch<Lead>('/leads', { method: 'POST', body: JSON.stringify(body) }).catch(() => undefined);
        onAdded({
          id: `pending-${Date.now()}`,
          name: body.name ?? null,
          email: body.email ?? null,
          phone: body.phone ?? null,
          company: body.company ?? null,
          score: 0,
          value: 0,
          temperature: 'WARM',
          source: body.source!,
          stageId: null,
          createdAt: new Date().toISOString(),
          card: null,
        });
        close();
        return;
      }
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
        {...checks.bind(key, `add-lead-${key}-err`)}
      />
      <FieldError id={`add-lead-${key}-err`}>{problemText(key)}</FieldError>
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
    <Sheet open={open} onClose={close} closeLabel={t('drawer.close')} title={quick ? t('add.quickTitle') : t('add.title')} subtitle={quick ? undefined : t('add.subtitleScan')} footer={footer}>
      <div className={quick ? 'hidden' : 'mb-5'}>
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
        {quick ? (
          <>
            {field('phone', { type: 'tel', dir: 'ltr' })}
            {field('email', { type: 'email', dir: 'ltr' })}
            {field('company', { wide: true })}
          </>
        ) : (
          <>
            {field('title')}
            {field('company')}
            {field('email', { type: 'email', dir: 'ltr' })}
            {field('phone', { type: 'tel', dir: 'ltr' })}
            {field('website', { dir: 'ltr' })}
            {field('address')}
          </>
        )}
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs font-medium text-ink">{t('add.fields.note')}</span>
          <textarea className="v-field min-h-20" value={fields.note} onChange={(e) => setFields((f) => ({ ...f, note: e.target.value }))} />
        </label>
      </div>
    </Sheet>
  );
}
