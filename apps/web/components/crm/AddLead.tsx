'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch, authPostFile } from '@/lib/client';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import type { Lead } from '@/lib/crm';

interface Scanned {
  name: string | null;
  nameAlt: string | null;
  title: string | null;
  company: string | null;
  emails: string[];
  phones: string[];
  website: string | null;
  address: string | null;
}

type Fields = { name: string; title: string; company: string; email: string; phone: string; website: string; address: string; note: string };
const EMPTY: Fields = { name: '', title: '', company: '', email: '', phone: '', website: '', address: '', note: '' };

/** Big phone photos are made small before they leave the phone: text stays sharp at 1600px. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

/**
 * Add a lead yourself: photograph a paper business card and check what was
 * read, or type the details in. Nothing is saved until you press Save.
 */
export function AddLead({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (lead: Lead) => void }) {
  const { t } = useTranslation('crm');
  const camera = useRef<HTMLInputElement>(null);
  // Only the latest photo's answer counts; a slower one for an older photo is dropped.
  const latest = useRef(0);
  const [canScan, setCanScan] = useState(false);
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
      .then((r) => setCanScan(r.available))
      .catch(() => setCanScan(false));
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
  }

  function close() {
    latest.current++;
    onClose();
    setTimeout(reset, 250);
  }

  async function scan(file: File | undefined) {
    if (!file) return;
    const id = ++latest.current;
    reset();
    setPhoto(URL.createObjectURL(file));
    setReading(true);
    try {
      const small = await shrink(file);
      const c = await authPostFile<Scanned>('/leads/scan', small, 'card.jpg');
      if (id !== latest.current) return;
      setScanned(c);
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
    } catch (e) {
      if (id !== latest.current) return;
      const status = (e as { status?: number }).status;
      setError(status === 422 ? t('add.errors.notCard') : status === 429 ? t('add.errors.tooMany') : t('add.errors.read'));
    } finally {
      if (id === latest.current) setReading(false);
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
      setError(/email/i.test((e as Error).message) ? t('add.errors.email') : t('add.errors.save'));
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof Fields, opts: { type?: string; dir?: 'ltr'; wide?: boolean } = {}) => (
    <label className={`block ${opts.wide ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1.5 block text-[12.5px] font-medium text-ink">{t(`add.fields.${key}`)}</span>
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
    <Sheet open={open} onClose={close} closeLabel={t('drawer.close')} title={t('add.title')} subtitle={canScan ? t('add.subtitleScan') : t('add.subtitle')} footer={footer}>
      {canScan && (
        <div className="mb-5">
          <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { void scan(e.target.files?.[0]); e.target.value = ''; }} />
          {photo ? (
            <div className="relative overflow-hidden rounded-xl ring-1 ring-inset ring-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt={t('add.photoAlt')} className={`max-h-52 w-full object-contain bg-elevated ${reading ? 'opacity-60' : ''}`} />
              {reading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="rounded-full bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink shadow-sm ring-1 ring-line">{t('add.reading')}</span>
                </div>
              )}
              {!reading && (
                <button type="button" onClick={() => camera.current?.click()} className="absolute bottom-2 end-2 rounded-full bg-surface px-3 py-1.5 text-[12px] font-medium text-ink shadow-sm ring-1 ring-line hover:bg-elevated">
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
                <span className="block text-[13.5px] font-medium text-ink">{t('add.scan')}</span>
                <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">{t('add.scanHint')}</span>
              </span>
            </button>
          )}
          {scanned && !reading && <p className="mt-2 text-[12.5px] text-muted">{t('add.check')}</p>}
        </div>
      )}

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-500/[0.07] px-3 py-2.5 text-[12.5px] leading-relaxed text-red-700 dark:text-red-300">
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
          <span className="mb-1.5 block text-[12.5px] font-medium text-ink">{t('add.fields.note')}</span>
          <textarea className="v-field min-h-20" value={fields.note} onChange={(e) => setFields((f) => ({ ...f, note: e.target.value }))} />
        </label>
      </div>
    </Sheet>
  );
}
