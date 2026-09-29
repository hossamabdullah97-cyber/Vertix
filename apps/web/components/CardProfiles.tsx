'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

/** Link types a profile can add, with the one config field each edits (mirrors lib/actions.ts). */
const LINK_TYPES: { type: string; icon: string; field: string; placeholder: string }[] = [
  { type: 'CALL', icon: 'phone', field: 'phone', placeholder: '+20 1…' },
  { type: 'WHATSAPP', icon: 'whatsapp', field: 'phone', placeholder: '+20 1…' },
  { type: 'EMAIL', icon: 'mail', field: 'email', placeholder: 'name@company.com' },
  { type: 'WEBSITE', icon: 'globe', field: 'url', placeholder: 'https://…' },
  { type: 'LINKEDIN', icon: 'linkedin', field: 'url', placeholder: 'https://linkedin.com/in/…' },
  { type: 'BOOK_MEETING', icon: 'calendar', field: 'url', placeholder: 'https://calendly.com/…' },
];
const linkMeta = (type: string) => LINK_TYPES.find((l) => l.type === type) ?? { type, icon: 'link', field: 'url', placeholder: 'https://…' };

/** Section types a profile can add, with their main editable field. */
const SECTION_TYPES: { type: string; icon: string; field: string; multiline?: boolean }[] = [
  { type: 'BIO', icon: 'user', field: 'body', multiline: true },
  { type: 'BOOKING', icon: 'calendar', field: 'bookingUrl' },
  { type: 'VIDEO', icon: 'youtube', field: 'videoUrl' },
];
const sectionMeta = (type: string) => SECTION_TYPES.find((s) => s.type === type) ?? { type, icon: 'file-text', field: 'body', multiline: true };

/** Is a public (non-keyed) variant live right now: switched on, or inside its schedule. */
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

function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-[18px] w-[30px] shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent before:absolute before:-inset-3 before:content-[''] sm:before:hidden ${
        on ? 'bg-accent' : ''
      }`}
      style={on ? undefined : { background: 'hsl(var(--v-border-strong))' }}
    >
      <span
        className={`pointer-events-none absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-[inset-inline-start] ${
          on ? 'start-[14px]' : 'start-[2px]'
        }`}
      />
    </button>
  );
}

function LinkRow({ href, onCopy, label, note }: { href: string; onCopy: () => void; label: string; note?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg bg-elevated px-3 ring-1 ring-inset ring-line">
        <span dir="ltr" className="min-w-0 flex-1 truncate font-mono text-[12px] text-muted rtl:text-right">
          {href}
        </span>
        {note && <span className="shrink-0 text-[11.5px] text-faint">{note}</span>}
      </div>
      <button onClick={onCopy} className="v-btn v-btn-ghost shrink-0 !h-11 sm:!h-9">
        <Icon name="copy" size={13} /> {label}
      </button>
    </div>
  );
}

export function CardProfiles({ cardId, slug }: { cardId: string; slug: string }) {
  const { t } = useTranslation('cardEditor');
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
        body: JSON.stringify({ name: t('variants.newName', { n: (variants?.length ?? 0) + 1 }), cloneDefault: true }),
      });
      await load();
      flash(t('variants.added'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeVariant = async (id: string) => {
    if (!window.confirm(t('variants.deleteConfirm'))) return;
    try {
      await authFetch(`/cards/${cardId}/variants/${id}`, { method: 'DELETE' });
      await load();
      flash(t('variants.deleted'));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => flash(t('variants.copied')));

  // The API explains conflicts in English; rebuild them from their parts so they read in the UI language.
  const nameOf = (id: string) => variants?.find((v) => v.id === id)?.name ?? '';
  const conflictText = (c: Conflict) => {
    if (c.type === 'multiple-active') return t('variants.conflictMultiple', { count: c.variantIds.length, name: nameOf(c.variantIds[0]) });
    if (c.type === 'schedule-overlap') return t('variants.conflictOverlap', { a: nameOf(c.variantIds[0]), b: nameOf(c.variantIds[1]) });
    return c.message;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold tracking-[-0.012em] text-ink rtl:tracking-normal">{t('variants.title')}</h2>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted">{t('variants.subtitle')}</p>
        </div>
        <button onClick={addVariant} disabled={busy} className="v-btn v-btn-ghost shrink-0">
          <Icon name={busy ? 'loader' : 'plus'} size={14} className={busy ? 'animate-spin' : undefined} /> {t('variants.add')}
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-red-500/[0.06] px-3 py-2.5 text-[13px] text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-400">
          {error}
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="rounded-lg bg-amber-500/[0.06] px-3.5 py-3 ring-1 ring-inset ring-amber-500/25">
          <p className="text-[13px] font-medium text-amber-800 dark:text-amber-300">{t('variants.conflictsTitle')}</p>
          <ul className="mt-1 list-disc space-y-0.5 ps-5 text-[12.5px] text-muted">
            {conflicts.map((c, i) => (
              <li key={i}>{conflictText(c)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* The default profile is the card itself. */}
      <div className="rounded-xl p-4 ring-1 ring-inset ring-line">
        <div className="flex items-start gap-3">
          <span className="v-icon-tile">
            <Icon name="user" size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[14px] font-medium text-ink">
              {t('variants.default.title')}
              <span className="v-badge v-badge-neutral">{t('variants.default.badge')}</span>
            </p>
            <p className="mt-0.5 text-[12.5px] text-muted">{t('variants.default.hint')}</p>
          </div>
        </div>
        <div className="mt-3">
          <LinkRow href={baseLink} onCopy={() => copy(baseLink)} label={t('variants.copy')} />
        </div>
      </div>

      {variants === null ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="v-skeleton h-40 rounded-xl" />
          ))}
        </div>
      ) : variants.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
          <p className="text-[14px] font-medium text-ink">{t('variants.emptyTitle')}</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{t('variants.emptyBody')}</p>
          <button onClick={addVariant} disabled={busy} className="v-btn v-btn-ghost mt-4">
            <Icon name="plus" size={14} /> {t('variants.add')}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {variants.map((v) => (
            <VariantCard key={v.id} cardId={cardId} v={v} baseLink={baseLink} onSaveLocal={setLocal} onSave={save} onDelete={removeVariant} onCopy={copy} onChanged={load} />
          ))}
        </div>
      )}

      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-6 z-[60] mx-auto flex w-fit items-center gap-2 rounded-lg bg-ink px-3.5 py-2 text-[13px] text-surface shadow-lg">
          <Icon name="check" size={14} /> {toast}
        </div>
      )}
    </div>
  );
}

function VariantCard({
  cardId,
  v,
  baseLink,
  onSaveLocal,
  onSave,
  onDelete,
  onCopy,
  onChanged,
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
  const { t } = useTranslation('cardEditor');
  const [showContent, setShowContent] = useState(false);
  const live = isLiveNow(v);
  const vcard = (v.vcardData ?? {}) as Record<string, string>;
  const shareLink = v.accessKey ? `${baseLink}?p=${encodeURIComponent(v.accessKey)}` : baseLink;
  const label = 'mb-1.5 flex items-baseline gap-1.5 text-[12.5px] text-muted';

  return (
    <div className="rounded-xl ring-1 ring-inset ring-line">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <input
          value={v.name}
          aria-label={t('variants.nameLabel')}
          onChange={(e) => onSaveLocal(v.id, { name: e.target.value })}
          onBlur={(e) => onSave(v.id, { name: e.target.value.trim() || t('variants.fallbackName') })}
          className="-ms-1.5 min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1 text-[14px] font-medium text-ink outline-none hover:bg-elevated focus:bg-elevated"
        />
        {v.accessKey ? (
          <span className="v-badge v-badge-neutral shrink-0">
            <Icon name="lock" size={11} /> {t('variants.status.private')}
          </span>
        ) : live ? (
          <span className="v-badge v-badge-success shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {t('variants.status.live')}
          </span>
        ) : (
          <span className="v-badge v-badge-neutral shrink-0">{t('variants.status.idle')}</span>
        )}
        <button
          onClick={() => onDelete(v.id)}
          aria-label={t('variants.deleteProfile')}
          title={t('variants.deleteProfile')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-red-500/10 hover:text-red-600 sm:h-8 sm:w-8"
        >
          <Icon name="trash" size={14} />
        </button>
      </div>

      <div className="grid gap-5 p-4 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="text-[12.5px] font-medium text-ink">{t('variants.look')}</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={label}>{t('variants.displayName')}</span>
              <input
                className="v-field"
                value={vcard.fullName ?? ''}
                onChange={(e) => onSaveLocal(v.id, { vcardData: { ...vcard, fullName: e.target.value } })}
                onBlur={(e) => onSave(v.id, { vcardData: { ...vcard, fullName: e.target.value } })}
                placeholder={t('variants.displayNamePlaceholder')}
              />
            </label>
            <label className="block">
              <span className={label}>{t('variants.jobTitle')}</span>
              <input
                className="v-field"
                value={vcard.title ?? vcard.org ?? ''}
                onChange={(e) => onSaveLocal(v.id, { vcardData: { ...vcard, title: e.target.value } })}
                onBlur={(e) => onSave(v.id, { vcardData: { ...vcard, title: e.target.value } })}
                placeholder={t('variants.jobTitlePlaceholder')}
              />
            </label>
          </div>
          <label className="block">
            <span className={label}>{t('variants.template')}</span>
            <select className="v-field" value={v.templateId} onChange={(e) => onSave(v.id, { templateId: e.target.value })}>
              {TEMPLATES.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-3 lg:border-s lg:border-line lg:ps-5">
          <p className="text-[12.5px] font-medium text-ink">{t('variants.audience')}</p>
          <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 ring-1 ring-inset ring-line">
            <span className="min-w-0">
              <span className="block text-[13px] text-ink">{t('variants.manual')}</span>
              <span className="block text-[12px] text-faint">{t('variants.manualHint')}</span>
            </span>
            <Switch on={v.manualActive} onChange={() => onSave(v.id, { manualActive: !v.manualActive })} label={t('variants.manual')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={label}>{t('variants.from')}</span>
              <input
                type="datetime-local"
                dir="ltr"
                className="v-field tabular !text-[12.5px] rtl:text-right"
                value={toLocalInput(v.scheduleStart)}
                onChange={(e) => onSave(v.id, { scheduleStart: fromLocalInput(e.target.value) })}
              />
            </label>
            <label className="block">
              <span className={label}>{t('variants.until')}</span>
              <input
                type="datetime-local"
                dir="ltr"
                className="v-field tabular !text-[12.5px] rtl:text-right"
                value={toLocalInput(v.scheduleEnd)}
                onChange={(e) => onSave(v.id, { scheduleEnd: fromLocalInput(e.target.value) })}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={label}>
                {t('variants.key')} <span className="text-[12px] text-faint">· ?p=</span>
              </span>
              <input
                dir="ltr"
                className="v-field font-mono !text-[12.5px] rtl:text-right"
                value={v.accessKey ?? ''}
                onChange={(e) => onSaveLocal(v.id, { accessKey: e.target.value })}
                onBlur={(e) => onSave(v.id, { accessKey: e.target.value.trim() || null })}
                placeholder="vip"
              />
            </label>
            <label className="block">
              <span className={label}>{t('variants.passcode')}</span>
              <input
                dir="ltr"
                className="v-field font-mono !text-[12.5px] rtl:text-right"
                value={v.passcode ?? ''}
                onChange={(e) => onSaveLocal(v.id, { passcode: e.target.value })}
                onBlur={(e) => onSave(v.id, { passcode: e.target.value.trim() || null })}
                placeholder={t('variants.optional')}
              />
            </label>
          </div>
        </div>
      </div>

      {/* This profile's own links and sections */}
      <div className="border-t border-line">
        <button
          onClick={() => setShowContent((s) => !s)}
          aria-expanded={showContent}
          className="flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-start text-[13px] text-ink hover:bg-elevated"
        >
          <Icon name="chevron-down" size={14} className={`shrink-0 text-faint transition-transform ${showContent ? '' : '-rotate-90 rtl:rotate-90'}`} />
          <span className="flex-1">{t('variants.contentToggle')}</span>
          <span className="tabular text-[12px] text-faint">{t('variants.contentCount', { links: v.actions.length, sections: v.sections.length })}</span>
        </button>
        {showContent && (
          <div className="px-4 pb-4">
            <VariantContent cardId={cardId} v={v} onChanged={onChanged} />
          </div>
        )}
      </div>

      <div className="border-t border-line px-4 py-3">
        <LinkRow href={shareLink} onCopy={() => onCopy(shareLink)} label={t('variants.copy')} note={v.passcode ? t('variants.pinRequired') : undefined} />
      </div>
    </div>
  );
}

/** Create, edit and delete a profile's own links (actions) and content sections. */
function VariantContent({ cardId, v, onChanged }: { cardId: string; v: Variant; onChanged: () => void | Promise<void> }) {
  const { t } = useTranslation('cardEditor');
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
  const patchLink = (a: ActionRow, config: Record<string, unknown>) => req(`/cards/${cardId}/actions/${a.id}`, 'PATCH', { config });
  const toggleLink = (a: ActionRow) => req(`/cards/${cardId}/actions/${a.id}`, 'PATCH', { isActive: !a.isActive });
  const delLink = (a: ActionRow) => req(`/cards/${cardId}/actions/${a.id}`, 'DELETE');

  const addSection = () => req(`/cards/${cardId}/sections?variantId=${v.id}`, 'POST', { type: addSecType, content: {}, isVisible: true });
  const patchSection = (s: SectionRow, content: Record<string, unknown>) => req(`/cards/${cardId}/sections/${s.id}`, 'PATCH', { content });
  const toggleSection = (s: SectionRow) => req(`/cards/${cardId}/sections/${s.id}`, 'PATCH', { isVisible: !s.isVisible });
  const delSection = (s: SectionRow) => req(`/cards/${cardId}/sections/${s.id}`, 'DELETE');

  const linkLabel = (type: string) => t(`variants.links.types.${type}`, type);
  const sectionLabel = (type: string) => t(`variants.sections.types.${type}`, type);
  const iconBtn = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition-colors sm:h-8 sm:w-8';

  return (
    <div className="grid gap-5 rounded-lg bg-elevated/60 p-3.5 ring-1 ring-inset ring-line lg:grid-cols-2">
      <div className="space-y-2">
        <p className="text-[12.5px] font-medium text-ink">{t('variants.links.title')}</p>
        {v.actions.length === 0 && <p className="text-[12.5px] text-faint">{t('variants.links.empty')}</p>}
        {v.actions.map((a) => {
          const m = linkMeta(a.type);
          return (
            <div key={a.id} className="flex items-center gap-1.5">
              <span className="v-icon-tile !h-9 !w-9" title={linkLabel(a.type)}>
                <Icon name={m.icon} size={14} />
              </span>
              <input
                dir="ltr"
                aria-label={linkLabel(a.type)}
                className="v-field min-w-0 flex-1 !text-[12.5px] rtl:text-right"
                defaultValue={(a.config[m.field] as string) ?? ''}
                placeholder={m.placeholder}
                onBlur={(e) => patchLink(a, { ...a.config, [m.field]: e.target.value })}
              />
              <button
                onClick={() => toggleLink(a)}
                aria-pressed={!a.isActive}
                aria-label={a.isActive ? t('variants.links.active') : t('variants.links.hidden')}
                title={a.isActive ? t('variants.links.active') : t('variants.links.hidden')}
                className={`${iconBtn} ${a.isActive ? 'text-muted hover:bg-surface hover:text-ink' : 'text-faint hover:bg-surface'}`}
              >
                <Icon name={a.isActive ? 'eye' : 'eye-off'} size={14} />
              </button>
              <button
                onClick={() => delLink(a)}
                aria-label={t('variants.links.delete')}
                title={t('variants.links.delete')}
                className={`${iconBtn} text-faint hover:bg-red-500/10 hover:text-red-600`}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          );
        })}
        <div className="flex items-center gap-1.5 pt-1">
          <select value={addLinkType} onChange={(e) => setAddLinkType(e.target.value)} aria-label={t('variants.links.add')} className="v-field min-w-0 flex-1">
            {LINK_TYPES.map((l) => (
              <option key={l.type} value={l.type}>
                {linkLabel(l.type)}
              </option>
            ))}
          </select>
          <button onClick={addLink} disabled={busy} className="v-btn v-btn-ghost shrink-0 !h-11 sm:!h-9">
            <Icon name="plus" size={13} /> {t('variants.links.add')}
          </button>
        </div>
      </div>

      <div className="space-y-2 lg:border-s lg:border-line lg:ps-5">
        <p className="text-[12.5px] font-medium text-ink">{t('variants.sections.title')}</p>
        {v.sections.length === 0 && <p className="text-[12.5px] text-faint">{t('variants.sections.empty')}</p>}
        {v.sections.map((s) => {
          const m = sectionMeta(s.type);
          const placeholder = t(`variants.sections.placeholders.${s.type}`, '');
          const url = m.field !== 'body';
          return (
            <div key={s.id} className="rounded-lg bg-surface p-2.5 ring-1 ring-inset ring-line">
              <div className="mb-1.5 flex items-center gap-1">
                <Icon name={m.icon} size={13} className="shrink-0 text-faint" />
                <span className="flex-1 text-[12.5px] font-medium text-ink">{sectionLabel(s.type)}</span>
                <button
                  onClick={() => toggleSection(s)}
                  aria-pressed={!s.isVisible}
                  aria-label={s.isVisible ? t('variants.sections.visible') : t('variants.sections.hidden')}
                  title={s.isVisible ? t('variants.sections.visible') : t('variants.sections.hidden')}
                  className={`${iconBtn} !h-11 !w-11 sm:!h-7 sm:!w-7 ${s.isVisible ? 'text-muted hover:bg-elevated hover:text-ink' : 'text-faint hover:bg-elevated'}`}
                >
                  <Icon name={s.isVisible ? 'eye' : 'eye-off'} size={13} />
                </button>
                <button
                  onClick={() => delSection(s)}
                  aria-label={t('variants.sections.delete')}
                  title={t('variants.sections.delete')}
                  className={`${iconBtn} !h-11 !w-11 text-faint hover:bg-red-500/10 hover:text-red-600 sm:!h-7 sm:!w-7`}
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
              {m.multiline ? (
                <textarea
                  className="v-field !h-auto py-2 !text-[12.5px]"
                  rows={2}
                  aria-label={sectionLabel(s.type)}
                  defaultValue={(s.content[m.field] as string) ?? ''}
                  placeholder={placeholder}
                  onBlur={(e) => patchSection(s, { ...s.content, [m.field]: e.target.value })}
                />
              ) : (
                <input
                  dir={url ? 'ltr' : undefined}
                  aria-label={sectionLabel(s.type)}
                  className={`v-field !text-[12.5px] ${url ? 'rtl:text-right' : ''}`}
                  defaultValue={(s.content[m.field] as string) ?? ''}
                  placeholder={placeholder}
                  onBlur={(e) => patchSection(s, { ...s.content, [m.field]: e.target.value })}
                />
              )}
            </div>
          );
        })}
        <div className="flex items-center gap-1.5 pt-1">
          <select value={addSecType} onChange={(e) => setAddSecType(e.target.value)} aria-label={t('variants.sections.add')} className="v-field min-w-0 flex-1">
            {SECTION_TYPES.map((s) => (
              <option key={s.type} value={s.type}>
                {sectionLabel(s.type)}
              </option>
            ))}
          </select>
          <button onClick={addSection} disabled={busy} className="v-btn v-btn-ghost shrink-0 !h-11 sm:!h-9">
            <Icon name="plus" size={13} /> {t('variants.sections.add')}
          </button>
        </div>
      </div>

      {/* Payment links for this profile, sharing external links only.
          Self-contained: it saves through its own API, so it needs no onChange
          (reloading the profile here would loop on every change). */}
      <div className="lg:col-span-2">
        <PaymentLinksManager cardId={cardId} variantId={v.id} compact />
      </div>
    </div>
  );
}
