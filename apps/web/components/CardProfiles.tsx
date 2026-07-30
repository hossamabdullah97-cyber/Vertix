'use client';

import { useEffect, useState } from 'react';
import { authFetch } from '@/lib/client';
import { Icon } from '@/components/Icon';
import PaymentLinksManager from '@/components/cards/PaymentLinksManager';
import { TEMPLATES } from '@/lib/templates';

interface ActionRow {
  id: string;
  type: string;
  order: number;
  isActive: boolean;
  config: Record<string, unknown>;
}
interface SectionRow {
  id: string;
  type: string;
  order: number;
  isVisible: boolean;
  content: Record<string, unknown>;
}
interface Variant {
  id: string;
  name: string;
  order: number;
  templateId: string;
  theme: Record<string, unknown> | null;
  vcardData: Record<string, unknown> | null;
  accessKey: string | null;
  passcode: string | null;
  scheduleStart: string | null;
  scheduleEnd: string | null;
  manualActive: boolean;
  actions: ActionRow[];
  sections: SectionRow[];
}
interface Conflict {
  type: string;
  variantIds: string[];
  message: string;
}

/** Curated link types with their single primary config field (mirrors lib/actions.ts). */
const LINK_TYPES: { type: string; label: string; field: string; placeholder: string }[] = [
  { type: 'CALL', label: 'Phone call', field: 'phone', placeholder: '+9665…' },
  { type: 'WHATSAPP', label: 'WhatsApp', field: 'phone', placeholder: '+9665…' },
  { type: 'EMAIL', label: 'Email', field: 'email', placeholder: 'name@company.com' },
  { type: 'WEBSITE', label: 'Website', field: 'url', placeholder: 'https://…' },
  { type: 'LINKEDIN', label: 'LinkedIn', field: 'url', placeholder: 'https://linkedin.com/in/…' },
  { type: 'BOOK_MEETING', label: 'Book meeting', field: 'url', placeholder: 'https://calendly.com/…' },
];
const linkMeta = (type: string) =>
  LINK_TYPES.find((l) => l.type === type) ?? { type, label: type, field: 'url', placeholder: 'https://…' };
const linkIcon: Record<string, string> = {
  CALL: 'phone', WHATSAPP: 'whatsapp', EMAIL: 'mail', WEBSITE: 'globe', LINKEDIN: 'linkedin', BOOK_MEETING: 'calendar',
};

/** Content section types with their primary editable field. */
const SECTION_TYPES: { type: string; label: string; field: string; placeholder: string; multiline?: boolean }[] = [
  { type: 'BIO', label: 'About / Bio', field: 'body', placeholder: 'Short bio shown on this profile…', multiline: true },
  { type: 'BOOKING', label: 'Booking button', field: 'bookingUrl', placeholder: 'https://calendly.com/…' },
  { type: 'VIDEO', label: 'Video', field: 'videoUrl', placeholder: 'YouTube / Vimeo URL' },
];
const sectionMeta = (type: string) =>
  SECTION_TYPES.find((s) => s.type === type) ?? { type, label: type, field: 'body', placeholder: '', multiline: true };
const sectionIcon: Record<string, string> = { BIO: 'user', BOOKING: 'calendar', VIDEO: 'youtube', SOCIAL: 'users', PORTFOLIO: 'grid' };

/** Is a public (non-keyed) variant live right now — manual occasion or schedule window. */
function isLiveNow(v: Variant): boolean {
  if (v.accessKey) return false;
  if (v.manualActive) return true;
  const now = Date.now();
  const start = v.scheduleStart ? new Date(v.scheduleStart).getTime() : null;
  const end = v.scheduleEnd ? new Date(v.scheduleEnd).getTime() : null;
  if (start == null && end == null) return false;
  return (start == null || start <= now) && (end == null || now <= end);
}
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export function CardProfiles({ cardId, slug }: { cardId: string; slug: string }) {
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [data, cf] = await Promise.all([
        authFetch<Variant[]>(`/cards/${cardId}/variants`),
        authFetch<Conflict[]>(`/cards/${cardId}/variants/conflicts`).catch(() => []),
      ]);
      setVariants(data);
      setConflicts(cf);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const baseLink = `${origin}/c/${slug}`;

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(''), 1800);
  }

  const setLocal = (id: string, patch: Partial<Variant>) =>
    setVariants((vs) => vs?.map((v) => (v.id === id ? { ...v, ...patch } : v)) ?? vs);

  const save = async (id: string, patch: Partial<Variant>) => {
    setLocal(id, patch);
    try {
      await authFetch(`/cards/${cardId}/variants/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      authFetch<Conflict[]>(`/cards/${cardId}/variants/conflicts`).then(setConflicts).catch(() => {});
      setError('');
    } catch (e) {
      setError((e as Error).message);
      load();
    }
  };

  const addVariant = async () => {
    setBusy(true);
    try {
      await authFetch(`/cards/${cardId}/variants`, {
        method: 'POST',
        body: JSON.stringify({ name: `Profile ${(variants?.length ?? 0) + 1}`, cloneDefault: true }),
      });
      await load();
      flash('Profile added — starts as a copy of your default');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeVariant = async (id: string) => {
    if (!window.confirm('Delete this profile? Its link and content will stop working.')) return;
    try {
      await authFetch(`/cards/${cardId}/variants/${id}`, { method: 'DELETE' });
      await load();
      flash('Profile deleted');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => flash('Link copied!'));

  return (
    <div className="space-y-6">
      <div className="v-hero p-6">
        <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="v-display text-[19px] font-extrabold tracking-tight text-white">Profiles on one link</h3>
            <p className="mt-1 max-w-xl text-[12.5px] font-medium text-white/80">
              Your card has one public link. Add profiles with different info, look, sections &amp; links — targeted by a
              private key, a passcode, a schedule, or a manual occasion. If none is active, your default profile shows.
            </p>
          </div>
          <button
            onClick={addVariant}
            disabled={busy}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-bold text-[#1d4ed8] shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            <Icon name="plus" size={15} /> Add profile
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-semibold text-red-500">
          <Icon name="x" size={15} /> {error}
        </div>
      )}

      {/* Real resolution conflicts (from the backend) */}
      {conflicts.length > 0 && (
        <div className="space-y-1.5 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
          <p className="flex items-center gap-2 text-[13px] font-bold text-amber-600">
            <Icon name="zap" size={15} /> Overlapping profiles
          </p>
          <ul className="ms-1 space-y-1 text-[12px] font-medium text-muted">
            {conflicts.map((c, i) => <li key={i}>• {c.message}</li>)}
          </ul>
        </div>
      )}

      {/* Default profile (the base card) */}
      <div className="v-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="v-icon-tile"><Icon name="user" size={16} /></span>
            <div>
              <p className="text-[14px] font-extrabold tracking-tight text-ink">Default profile</p>
              <p className="text-[11.5px] font-medium text-muted">Shown when no other profile is active. Edit it in the Content &amp; Design tabs.</p>
            </div>
          </div>
          <span className="v-badge v-badge-neutral shrink-0">base</span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-canvas/40 px-2.5 py-1.5 font-mono text-[11.5px] text-muted">{baseLink}</code>
          <button onClick={() => copy(baseLink)} className="v-btn v-btn-ghost !h-9 shrink-0 px-3 text-[12px] font-bold"><Icon name="copy" size={13} /> Copy</button>
        </div>
      </div>

      {variants === null ? (
        <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="v-skeleton h-40 rounded-2xl" />)}</div>
      ) : variants.length === 0 ? (
        <div className="v-card flex flex-col items-center gap-3 py-14 text-center">
          <span className="v-icon-tile"><Icon name="layers" size={18} /></span>
          <div>
            <p className="text-[15px] font-bold text-ink">No extra profiles yet</p>
            <p className="mt-1 max-w-sm text-[12.5px] text-muted">Add a profile to show a different version of your card to specific people, at a specific time, or for an occasion.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {variants.map((v) => (
            <VariantCard key={v.id} cardId={cardId} v={v} baseLink={baseLink} onSaveLocal={setLocal} onSave={save} onDelete={removeVariant} onCopy={copy} onChanged={load} />
          ))}
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-[60] mx-auto flex w-fit items-center gap-2 rounded-full bg-[#16161a] px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg">
          <Icon name="check" size={15} /> {toast}
        </div>
      )}
    </div>
  );
}

function VariantCard({
  cardId, v, baseLink, onSaveLocal, onSave, onDelete, onCopy, onChanged,
}: {
  cardId: string;
  v: Variant;
  baseLink: string;
  onSaveLocal: (id: string, patch: Partial<Variant>) => void;
  onSave: (id: string, patch: Partial<Variant>) => void | Promise<void>;
  onDelete: (id: string) => void;
  onCopy: (t: string) => void;
  onChanged: () => void | Promise<void>;
}) {
  const [showContent, setShowContent] = useState(false);
  const live = isLiveNow(v);
  const vcard = (v.vcardData ?? {}) as Record<string, string>;
  const shareLink = v.accessKey ? `${baseLink}?p=${encodeURIComponent(v.accessKey)}` : baseLink;
  const field = 'v-field !h-9 text-[13px]';
  const label = 'block text-[10.5px] font-bold uppercase tracking-wider text-muted mb-1';

  return (
    <div className="v-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="v-icon-tile !h-8 !w-8"><Icon name="columns" size={15} /></span>
          <input
            value={v.name}
            onChange={(e) => onSaveLocal(v.id, { name: e.target.value })}
            onBlur={(e) => onSave(v.id, { name: e.target.value.trim() || 'Profile' })}
            className="min-w-0 flex-1 bg-transparent text-[15px] font-extrabold tracking-tight text-ink outline-none"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {v.accessKey ? (
            <span className="v-badge v-badge-accent"><Icon name="lock" size={11} /> Private link</span>
          ) : live ? (
            <span className="v-badge v-badge-success"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active now</span>
          ) : (
            <span className="v-badge v-badge-neutral">Idle</span>
          )}
          <button onClick={() => onDelete(v.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-red-500/10 hover:text-red-500" title="Delete profile">
            <Icon name="trash" size={15} />
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3.5">
          <p className="v-section-label">Look &amp; info</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Display name</label>
              <input className={field} value={vcard.fullName ?? ''} onChange={(e) => onSaveLocal(v.id, { vcardData: { ...vcard, fullName: e.target.value } })} onBlur={(e) => onSave(v.id, { vcardData: { ...vcard, fullName: e.target.value } })} placeholder="Ahmed — VIP" />
            </div>
            <div>
              <label className={label}>Job title</label>
              <input className={field} value={vcard.org ?? ''} onChange={(e) => onSaveLocal(v.id, { vcardData: { ...vcard, org: e.target.value } })} onBlur={(e) => onSave(v.id, { vcardData: { ...vcard, org: e.target.value } })} placeholder="Founder & CEO" />
            </div>
          </div>
          <div>
            <label className={label}>Template</label>
            <select className={`${field} font-semibold`} value={v.templateId} onChange={(e) => onSave(v.id, { templateId: e.target.value })}>
              {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-3.5 lg:border-s lg:border-line lg:ps-5">
          <p className="v-section-label">Who sees it &amp; when</p>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-canvas/30 p-2.5">
            <span className="flex items-center gap-2 text-[12.5px] font-bold text-ink"><Icon name="sparkle" size={14} className="text-accent" /> Activate now (occasion)</span>
            <button role="switch" aria-checked={v.manualActive} onClick={() => onSave(v.id, { manualActive: !v.manualActive })} className="relative h-6 w-11 shrink-0 rounded-full transition-colors" style={{ background: v.manualActive ? 'var(--v-accent)' : 'hsl(var(--v-border-strong))' }}>
              <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ insetInlineStart: v.manualActive ? '22px' : '2px' }} />
            </button>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Schedule from</label>
              <input type="datetime-local" className={field} value={toLocalInput(v.scheduleStart)} onChange={(e) => onSave(v.id, { scheduleStart: fromLocalInput(e.target.value) })} />
            </div>
            <div>
              <label className={label}>Until</label>
              <input type="datetime-local" className={field} value={toLocalInput(v.scheduleEnd)} onChange={(e) => onSave(v.id, { scheduleEnd: fromLocalInput(e.target.value) })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Private key (?p=)</label>
              <input className={`${field} font-mono`} value={v.accessKey ?? ''} onChange={(e) => onSaveLocal(v.id, { accessKey: e.target.value })} onBlur={(e) => onSave(v.id, { accessKey: e.target.value.trim() || null })} placeholder="vip" />
            </div>
            <div>
              <label className={label}>Passcode (PIN)</label>
              <input className={`${field} font-mono`} value={v.passcode ?? ''} onChange={(e) => onSaveLocal(v.id, { passcode: e.target.value })} onBlur={(e) => onSave(v.id, { passcode: e.target.value.trim() || null })} placeholder="optional" />
            </div>
          </div>
        </div>
      </div>

      {/* Per-variant sections & links editor */}
      <div className="mt-4 border-t border-line pt-3.5">
        <button
          onClick={() => setShowContent((s) => !s)}
          className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-[12.5px] font-bold text-ink hover:bg-ink/[0.03]"
        >
          <span className="flex items-center gap-2">
            <Icon name={showContent ? 'chevron-down' : 'arrow'} size={13} className="text-muted" />
            Sections &amp; links for this profile
          </span>
          <span className="text-[11px] font-semibold text-muted">
            {v.actions.length} links · {v.sections.length} sections
          </span>
        </button>

        {showContent && (
          <div className="mt-3">
            <VariantContent cardId={cardId} v={v} onChanged={onChanged} />
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-line pt-3.5">
        <Icon name={v.accessKey ? 'lock' : 'globe'} size={14} className="shrink-0 text-muted" />
        <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-canvas/40 px-2.5 py-1.5 font-mono text-[11.5px] text-muted">{shareLink}{v.passcode ? '  · PIN required' : ''}</code>
        <button onClick={() => onCopy(shareLink)} className="v-btn v-btn-ghost !h-9 shrink-0 px-3 text-[12px] font-bold"><Icon name="copy" size={13} /> Copy</button>
      </div>
    </div>
  );
}

/** Real CRUD for a variant's own links (actions) and content sections. */
function VariantContent({ cardId, v, onChanged }: { cardId: string; v: Variant; onChanged: () => void | Promise<void> }) {
  const [addLinkType, setAddLinkType] = useState('WEBSITE');
  const [addSecType, setAddSecType] = useState('BIO');
  const [busy, setBusy] = useState(false);

  const req = async (path: string, method: string, body?: unknown) => {
    setBusy(true);
    try {
      await authFetch(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const addLink = () => {
    const m = linkMeta(addLinkType);
    req(`/cards/${cardId}/actions?variantId=${v.id}`, 'POST', { type: addLinkType, config: { [m.field]: '' }, isActive: true });
  };
  const patchLink = (a: ActionRow, config: Record<string, unknown>) =>
    req(`/cards/${cardId}/actions/${a.id}`, 'PATCH', { config });
  const toggleLink = (a: ActionRow) => req(`/cards/${cardId}/actions/${a.id}`, 'PATCH', { isActive: !a.isActive });
  const delLink = (a: ActionRow) => req(`/cards/${cardId}/actions/${a.id}`, 'DELETE');

  const addSection = () =>
    req(`/cards/${cardId}/sections?variantId=${v.id}`, 'POST', { type: addSecType, content: {}, isVisible: true });
  const patchSection = (s: SectionRow, content: Record<string, unknown>) =>
    req(`/cards/${cardId}/sections/${s.id}`, 'PATCH', { content });
  const toggleSection = (s: SectionRow) => req(`/cards/${cardId}/sections/${s.id}`, 'PATCH', { isVisible: !s.isVisible });
  const delSection = (s: SectionRow) => req(`/cards/${cardId}/sections/${s.id}`, 'DELETE');

  const smallField = 'v-field !h-8 text-[12.5px]';

  return (
    <div className="grid gap-5 rounded-xl border border-line bg-canvas/20 p-4 lg:grid-cols-2">
      {/* Links */}
      <div className="space-y-2.5">
        <p className="v-section-label">Quick links</p>
        {v.actions.length === 0 && <p className="text-[11.5px] text-faint">No links on this profile yet.</p>}
        {v.actions.map((a) => {
          const m = linkMeta(a.type);
          return (
            <div key={a.id} className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface border border-line text-muted" title={m.label}>
                <Icon name={linkIcon[a.type] ?? 'link'} size={14} />
              </span>
              <input
                className={`${smallField} flex-1`}
                defaultValue={(a.config[m.field] as string) ?? ''}
                placeholder={m.placeholder}
                onBlur={(e) => patchLink(a, { ...a.config, [m.field]: e.target.value })}
              />
              <button onClick={() => toggleLink(a)} title={a.isActive ? 'Active' : 'Hidden'} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${a.isActive ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/5' : 'border-line text-faint'}`}>
                <Icon name={a.isActive ? 'eye' : 'eye-off'} size={13} />
              </button>
              <button onClick={() => delLink(a)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-red-500/10 hover:text-red-500"><Icon name="trash" size={13} /></button>
            </div>
          );
        })}
        <div className="flex items-center gap-2 pt-1">
          <select value={addLinkType} onChange={(e) => setAddLinkType(e.target.value)} className={`${smallField} flex-1 font-semibold`}>
            {LINK_TYPES.map((l) => <option key={l.type} value={l.type}>{l.label}</option>)}
          </select>
          <button onClick={addLink} disabled={busy} className="v-btn !h-8 shrink-0 px-3 text-[12px] font-bold"><Icon name="plus" size={13} /> Add link</button>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-2.5 lg:border-s lg:border-line lg:ps-5">
        <p className="v-section-label">Content sections</p>
        {v.sections.length === 0 && <p className="text-[11.5px] text-faint">No sections on this profile yet.</p>}
        {v.sections.map((s) => {
          const m = sectionMeta(s.type);
          return (
            <div key={s.id} className="rounded-lg border border-line bg-surface p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[12px] font-bold text-ink">
                  <Icon name={sectionIcon[s.type] ?? 'file-text'} size={13} className="text-accent" /> {m.label}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleSection(s)} title={s.isVisible ? 'Visible' : 'Hidden'} className={`flex h-7 w-7 items-center justify-center rounded-md ${s.isVisible ? 'text-emerald-500' : 'text-faint'}`}>
                    <Icon name={s.isVisible ? 'eye' : 'eye-off'} size={13} />
                  </button>
                  <button onClick={() => delSection(s)} className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-red-500/10 hover:text-red-500"><Icon name="trash" size={13} /></button>
                </div>
              </div>
              {m.multiline ? (
                <textarea
                  className="v-field h-auto py-2 text-[12.5px]"
                  rows={2}
                  defaultValue={(s.content[m.field] as string) ?? ''}
                  placeholder={m.placeholder}
                  onBlur={(e) => patchSection(s, { ...s.content, [m.field]: e.target.value })}
                />
              ) : (
                <input
                  className={smallField}
                  defaultValue={(s.content[m.field] as string) ?? ''}
                  placeholder={m.placeholder}
                  onBlur={(e) => patchSection(s, { ...s.content, [m.field]: e.target.value })}
                />
              )}
            </div>
          );
        })}
        <div className="flex items-center gap-2 pt-1">
          <select value={addSecType} onChange={(e) => setAddSecType(e.target.value)} className={`${smallField} flex-1 font-semibold`}>
            {SECTION_TYPES.map((s) => <option key={s.type} value={s.type}>{s.label}</option>)}
          </select>
          <button onClick={addSection} disabled={busy} className="v-btn !h-8 shrink-0 px-3 text-[12px] font-bold"><Icon name="plus" size={13} /> Add section</button>
        </div>
      </div>

      {/* Payment links for this identity — external link-sharing only.
          Self-contained: it persists via its own API, so it needs no onChange
          (wiring the variant reload here would loop on every links change). */}
      <div className="lg:col-span-2">
        <PaymentLinksManager cardId={cardId} variantId={v.id} compact />
      </div>
    </div>
  );
}
