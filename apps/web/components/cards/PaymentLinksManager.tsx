'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PAYMENT_PLATFORMS, type PaymentPlatformKey } from '@vertex/shared';
import { authFetch } from '@/lib/client';
import { offerUndo } from '@/lib/undo';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { PaymentBrandLogo } from '@/components/brand/PaymentBrandLogo';

/**
 * Card Builder manager for external payment links (link-sharing only).
 *
 * Vertex Connect never processes a payment: it stores only the owner-provided
 * external URL plus display metadata, and opens that URL for visitors. No
 * gateway, no checkout, no credentials, no transactions.
 *
 * Each row belongs to the card's default profile (variantId omitted) or to a
 * specific Smart Identity variant — the same architecture used by links, so a
 * single public URL shows different payment links per resolved identity.
 */

export interface PaymentLinkRow {
  id: string;
  platform: PaymentPlatformKey;
  displayName: string;
  url: string;
  description: string | null;
  order: number;
  isActive: boolean;
}

const PLATFORM_META: Record<string, { label: string; color: string; icon: string }> =
  Object.fromEntries(PAYMENT_PLATFORMS.map((p) => [p.key, { label: p.label, color: p.color, icon: p.icon }]));

const HTTPS_LIKE = /^https?:\/\/[^\s/$.?#][^\s]*$/i;

function blankDraft(): { platform: PaymentPlatformKey; displayName: string; url: string; description: string } {
  return { platform: 'instapay', displayName: PAYMENT_PLATFORMS[0].label, url: '', description: '' };
}

export default function PaymentLinksManager({
  cardId,
  variantId,
  onChange,
  compact = false,
}: {
  cardId: string;
  /** Omit for the card's default profile; set to edit a Smart Identity variant. */
  variantId?: string;
  /** Notifies the parent (e.g. Live Preview) whenever the link set changes. */
  onChange?: (links: PaymentLinkRow[]) => void;
  /** Lighter chrome for embedding inside the Smart Identity variant editor. */
  compact?: boolean;
}) {
  const { t } = useTranslation('paymentLinks');
  const [links, setLinks] = useState<PaymentLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(blankDraft());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dragId = useRef<string | null>(null);

  const qs = variantId ? `?variantId=${encodeURIComponent(variantId)}` : '';
  const base = `/cards/${cardId}/payment-links`;

  // Notify the parent (e.g. Live Preview) AFTER render, never during it —
  // calling a parent setter mid-render triggers React's "Cannot update a
  // component while rendering a different component" error. A ref keeps the
  // latest callback without making it an effect dependency (which could loop).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current?.(links);
  }, [links]);

  const sync = useCallback((next: PaymentLinkRow[]) => {
    setLinks([...next].sort((a, b) => a.order - b.order));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    authFetch<PaymentLinkRow[]>(`${base}${qs}`)
      .then((rows) => {
        if (alive) sync(rows ?? []);
      })
      .catch(() => {
        if (alive) sync([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, variantId]);

  function validate(url: string, displayName: string): string {
    if (!displayName.trim()) return t('errors.nameRequired');
    if (!url.trim()) return t('errors.urlRequired');
    if (!HTTPS_LIKE.test(url.trim())) return t('errors.invalidUrl');
    return '';
  }

  async function addLink() {
    const msg = validate(draft.url, draft.displayName);
    if (msg) {
      setError(msg);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await authFetch<PaymentLinkRow>(`${base}${qs}`, {
        method: 'POST',
        body: JSON.stringify({
          platform: draft.platform,
          displayName: draft.displayName.trim(),
          url: draft.url.trim(),
          description: draft.description.trim() || undefined,
        }),
      });
      sync([...links, created]);
      setDraft(blankDraft());
      setAdding(false);
    } catch {
      setError(t('errors.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Partial<Pick<PaymentLinkRow, 'platform' | 'displayName' | 'url' | 'description' | 'isActive'>>) {
    // Optimistic — the preview updates instantly; roll back on failure.
    const prev = links;
    sync(links.map((l) => (l.id === id ? { ...l, ...body } as PaymentLinkRow : l)));
    try {
      await authFetch(`${base}/${id}${qs}`, { method: 'PATCH', body: JSON.stringify(body) });
    } catch {
      sync(prev);
    }
  }

  async function remove(id: string) {
    const prev = links;
    sync(links.filter((l) => l.id !== id));
    try {
      await authFetch(`${base}/${id}${qs}`, { method: 'DELETE' });
    } catch {
      sync(prev);
      return;
    }
    const gone = prev.find((l) => l.id === id);
    offerUndo(t('removed'), async () => {
      await authFetch(`${base}/${id}/restore`, { method: 'POST' });
      if (gone) setLinks((cur) => (cur.some((l) => l.id === id) ? cur : [...cur, gone].sort((a, b) => a.order - b.order)));
    });
  }

  async function persistOrder(next: PaymentLinkRow[]) {
    const reindexed = next.map((l, i) => ({ ...l, order: i }));
    sync(reindexed);
    try {
      await authFetch(`${base}/reorder${qs}`, {
        method: 'PATCH',
        body: JSON.stringify({ ids: reindexed.map((l) => l.id) }),
      });
    } catch {
      /* order already applied locally; server rejected — leave as is */
    }
  }

  function onDrop(targetId: string) {
    const from = dragId.current;
    dragId.current = null;
    if (!from || from === targetId) return;
    const arr = [...links];
    const fi = arr.findIndex((l) => l.id === from);
    const ti = arr.findIndex((l) => l.id === targetId);
    if (fi < 0 || ti < 0) return;
    const [moved] = arr.splice(fi, 1);
    arr.splice(ti, 0, moved);
    persistOrder(arr);
  }

  const activeCount = links.filter((l) => l.isActive).length;

  const addButton = (
    <button
      onClick={() => {
        setAdding(true);
        setError('');
      }}
      className="v-btn v-btn-ghost"
    >
      <Icon name="plus" size={14} /> {t('addLink')}
    </button>
  );

  return (
    <div id={compact ? undefined : 'studio-payments'} className={compact ? 'space-y-3' : 'scroll-mt-16 space-y-4'}>
      <div className="flex items-start justify-between gap-3">
        {compact ? (
          <p className="text-xs font-medium text-ink">{t('titleCompact')}</p>
        ) : (
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-[-0.012em] text-ink rtl:tracking-normal">{t('title')}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">{t('subtitle')}</p>
          </div>
        )}
        {links.length > 0 && (
          <span className="tabular shrink-0 whitespace-nowrap pt-1 text-xs text-faint">
            {t('activeCount', { active: activeCount, total: links.length })}
          </span>
        )}
      </div>

      {loading ? (
        <div className="v-skeleton h-14 rounded-xl" aria-label={t('loading')} />
      ) : (
        <div className="space-y-3">
          {links.length > 0 && (
            <div className="divide-y divide-line overflow-hidden rounded-xl bg-surface ring-1 ring-inset ring-line">
              {links.map((link) => {
                const meta = PLATFORM_META[link.platform] ?? PLATFORM_META.custom;
                const open = expanded === link.id;
                return (
                  <div
                    key={link.id}
                    draggable
                    onDragStart={() => (dragId.current = link.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(link.id)}
                    className={`group ${open ? 'bg-elevated' : ''}`}
                  >
                    <div className="flex min-h-14 items-center gap-3 px-3 py-2.5">
                      <span className="hidden shrink-0 cursor-grab text-faint active:cursor-grabbing sm:inline" title={t('actions.reorder')} aria-hidden>
                        <Icon name="dots" size={14} className="rotate-90" />
                      </span>
                      <PaymentBrandLogo platform={link.platform} size={32} />
                      <button
                        className="min-w-0 flex-1 text-start"
                        onClick={() => setExpanded(open ? null : link.id)}
                        aria-expanded={open}
                      >
                        <span className={`block truncate text-sm font-medium ${link.isActive ? 'text-ink' : 'text-faint'}`}>{link.displayName}</span>
                        <span className="block truncate text-xs text-faint">{meta.label}</span>
                      </button>

                      <button
                        onClick={() => remove(link.id)}
                        className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 sm:flex"
                        title={t('actions.delete')}
                        aria-label={t('actions.delete')}
                      >
                        <Icon name="trash" size={14} />
                      </button>

                      <button
                        onClick={() => patch(link.id, { isActive: !link.isActive })}
                        role="switch"
                        aria-checked={link.isActive}
                        aria-label={link.isActive ? t('actions.active') : t('actions.inactive')}
                        title={link.isActive ? t('actions.active') : t('actions.inactive')}
                        className={`relative inline-flex h-[18px] w-[30px] shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent before:absolute before:-inset-x-3 before:-inset-y-[13px] before:content-[''] sm:before:hidden ${
                          link.isActive ? 'bg-accent' : ''
                        }`}
                        style={link.isActive ? undefined : { background: 'hsl(var(--v-border-strong))' }}
                      >
                        <span
                          className={`pointer-events-none absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-[inset-inline-start] ${
                            link.isActive ? 'start-[14px]' : 'start-[2px]'
                          }`}
                        />
                      </button>

                      <button
                        onClick={() => setExpanded(open ? null : link.id)}
                        className="flex h-11 w-8 shrink-0 items-center justify-center text-faint hover:text-ink sm:h-8"
                        title={t('actions.edit')}
                        aria-label={t('actions.edit')}
                        aria-expanded={open}
                      >
                        <Icon name="chevron-down" size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    {open && (
                      <div className="grid gap-3 px-3 pb-3.5 sm:grid-cols-2 sm:ps-[70px]">
                        <Field label={t('fields.method')}>
                          <select
                            className="v-field"
                            value={link.platform}
                            onChange={(e) => patch(link.id, { platform: e.target.value as PaymentPlatformKey })}
                          >
                            {PAYMENT_PLATFORMS.map((p) => (
                              <option key={p.key} value={p.key}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label={t('fields.displayName')}>
                          <input
                            className="v-field"
                            defaultValue={link.displayName}
                            maxLength={60}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v && v !== link.displayName) patch(link.id, { displayName: v });
                            }}
                          />
                        </Field>
                        <Field label={t('fields.url')}>
                          <input
                            dir="ltr"
                            className="v-field font-mono !text-xs rtl:text-right"
                            defaultValue={link.url}
                            placeholder={t('placeholders.url')}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v === link.url) return;
                              if (!HTTPS_LIKE.test(v)) {
                                e.target.value = link.url;
                                setError(t('errors.invalidUrl'));
                                return;
                              }
                              setError('');
                              patch(link.id, { url: v });
                            }}
                          />
                        </Field>
                        <Field label={t('fields.description')}>
                          <input
                            className="v-field"
                            defaultValue={link.description ?? ''}
                            maxLength={160}
                            placeholder={t('placeholders.description')}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v !== (link.description ?? '')) patch(link.id, { description: v || undefined });
                            }}
                          />
                        </Field>
                        <div className="border-t border-line pt-3 sm:hidden">
                          <button onClick={() => remove(link.id)} className="v-btn v-btn-ghost !h-11 w-full !text-red-600">
                            <Icon name="trash" size={14} /> {t('actions.delete')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {error && !adding && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          {adding ? (
            <div className="grid gap-3 rounded-xl p-4 ring-1 ring-inset ring-line sm:grid-cols-2">
              <Field label={t('fields.method')}>
                <select
                  className="v-field"
                  value={draft.platform}
                  onChange={(e) => {
                    const platform = e.target.value as PaymentPlatformKey;
                    const label = PLATFORM_META[platform]?.label ?? draft.displayName;
                    // Prefill the display name with the platform label unless edited.
                    const wasDefault = !draft.displayName || Object.values(PLATFORM_META).some((m) => m.label === draft.displayName);
                    setDraft({ ...draft, platform, displayName: wasDefault ? label : draft.displayName });
                  }}
                >
                  {PAYMENT_PLATFORMS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('fields.displayName')}>
                <input
                  className="v-field"
                  value={draft.displayName}
                  maxLength={60}
                  onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
                  placeholder={t('placeholders.displayName')}
                />
              </Field>
              <Field label={t('fields.url')}>
                <input
                  dir="ltr"
                  className="v-field font-mono !text-xs rtl:text-right"
                  value={draft.url}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  placeholder={t('placeholders.url')}
                />
              </Field>
              <Field label={t('fields.description')}>
                <input
                  className="v-field"
                  value={draft.description}
                  maxLength={160}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder={t('placeholders.description')}
                />
              </Field>
              {error && <p className="text-xs text-red-600 dark:text-red-400 sm:col-span-2">{error}</p>}
              <div className="flex items-center gap-2 sm:col-span-2">
                <button onClick={addLink} disabled={busy} className="v-btn disabled:opacity-60">
                  {busy ? t('saving') : t('addLink')}
                </button>
                <button
                  onClick={() => {
                    setAdding(false);
                    setError('');
                    setDraft(blankDraft());
                  }}
                  className="v-btn v-btn-ghost"
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          ) : links.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted">{t('emptyState')}</p>
              <div className="shrink-0">{addButton}</div>
            </div>
          ) : (
            addButton
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}
