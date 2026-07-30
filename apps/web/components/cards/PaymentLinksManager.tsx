'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PAYMENT_PLATFORMS, type PaymentPlatformKey } from '@vertex/shared';
import { authFetch } from '@/lib/client';
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
    if (!displayName.trim()) return 'Display name is required.';
    if (!url.trim()) return 'Payment link is required.';
    if (!HTTPS_LIKE.test(url.trim())) return 'Enter a valid link starting with https://';
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
      setError('Could not save the payment link. Please try again.');
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
    }
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

  return (
    <div
      id={compact ? undefined : 'studio-payments'}
      className={
        compact
          ? 'rounded-xl border border-line bg-canvas/20 p-4 space-y-4'
          : 'bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-6 scroll-mt-24'
      }
    >
      <div className={`flex items-center justify-between gap-3 ${compact ? '' : 'border-b border-line pb-3.5'}`}>
        <div className="flex items-center gap-3">
          {compact ? (
            <p className="v-section-label">Payment links</p>
          ) : (
            <>
              <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-emerald-500/10 text-emerald-500">
                <Icon name="link" size={16} />
              </span>
              <div>
                <h3 className="text-[14px] font-extrabold text-ink tracking-tight">Payment Links</h3>
                <p className="text-xs text-muted">
                  Share your external payment links (InstaPay, wallets, or a custom URL). Vertex Connect only opens the link — it
                  never processes payments.
                </p>
              </div>
            </>
          )}
        </div>
        {links.length > 0 && (
          <span className="shrink-0 text-[11px] font-bold text-muted whitespace-nowrap">
            {activeCount}/{links.length} active
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-[11px] text-muted text-center py-4">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-3">
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
                  className={`rounded-2xl border bg-canvas/20 transition-all ${
                    link.isActive ? 'border-line hover:border-line-strong' : 'border-dashed border-line/60 opacity-70'
                  }`}
                >
                  <div className="flex items-center gap-3 p-3.5">
                    <span className="cursor-grab text-muted/60 active:cursor-grabbing" title="Drag to reorder">
                      <Icon name="dots" size={15} />
                    </span>
                    <PaymentBrandLogo platform={link.platform} size={36} />
                    <button className="min-w-0 flex-1 text-left" onClick={() => setExpanded(open ? null : link.id)}>
                      <span className="block truncate text-[13px] font-bold text-ink">{link.displayName}</span>
                      <span className="block truncate text-[11px] text-muted">{meta.label}</span>
                    </button>

                    <button
                      onClick={() => patch(link.id, { isActive: !link.isActive })}
                      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                        link.isActive ? 'bg-emerald-500' : 'bg-line-strong'
                      }`}
                      title={link.isActive ? 'Active — visible publicly' : 'Inactive — hidden'}
                      aria-pressed={link.isActive}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                          link.isActive ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>

                    <button
                      onClick={() => setExpanded(open ? null : link.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-ink"
                      title="Edit"
                    >
                      <Icon name="settings" size={14} />
                    </button>
                    <button
                      onClick={() => remove(link.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-red-500/10 hover:text-red-500"
                      title="Delete"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>

                  {open && (
                    <div className="space-y-3 border-t border-line px-3.5 pb-4 pt-3.5">
                      <Field label="Payment Method">
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
                      <Field label="Display Name">
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
                      <Field label="Payment Link URL">
                        <input
                          className="v-field"
                          defaultValue={link.url}
                          placeholder="https://ipn.eg/S/username"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v === link.url) return;
                            if (!HTTPS_LIKE.test(v)) {
                              e.target.value = link.url;
                              setError('Enter a valid link starting with https://');
                              return;
                            }
                            setError('');
                            patch(link.id, { url: v });
                          }}
                        />
                      </Field>
                      <Field label="Description (optional)">
                        <input
                          className="v-field"
                          defaultValue={link.description ?? ''}
                          maxLength={160}
                          placeholder="e.g. Fastest — instant transfer"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (link.description ?? '')) patch(link.id, { description: v || undefined });
                          }}
                        />
                      </Field>
                    </div>
                  )}
                </div>
              );
            })}

            {links.length === 0 && !adding && (
              <p className="text-[11px] text-muted text-center py-3 bg-canvas/10 rounded-xl border border-dashed border-line/60">
                No payment links yet. Add one to let visitors pay you through your own external accounts.
              </p>
            )}
          </div>

          {adding ? (
            <div className="space-y-3 rounded-2xl border border-line bg-canvas/20 p-4">
              <Field label="Payment Method">
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
              <Field label="Display Name">
                <input
                  className="v-field"
                  value={draft.displayName}
                  maxLength={60}
                  onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
                  placeholder="InstaPay"
                />
              </Field>
              <Field label="Payment Link URL">
                <input
                  className="v-field"
                  value={draft.url}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  placeholder="https://ipn.eg/S/username"
                />
              </Field>
              <Field label="Description (optional)">
                <input
                  className="v-field"
                  value={draft.description}
                  maxLength={160}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="e.g. Fastest — instant transfer"
                />
              </Field>
              {error && <p className="text-[11px] font-semibold text-red-500">{error}</p>}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={addLink}
                  disabled={busy}
                  className="v-btn-primary h-9 px-4 text-[12px] disabled:opacity-60"
                >
                  {busy ? 'Saving…' : 'Add payment link'}
                </button>
                <button
                  onClick={() => {
                    setAdding(false);
                    setError('');
                    setDraft(blankDraft());
                  }}
                  className="h-9 px-4 text-[12px] font-semibold text-muted hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {error && !adding && <p className="text-[11px] font-semibold text-red-500">{error}</p>}
              <button
                onClick={() => {
                  setAdding(true);
                  setError('');
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line py-3 text-[12px] font-bold text-muted transition-colors hover:border-line-strong hover:text-ink"
              >
                <Icon name="plus" size={15} /> Add payment link
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold text-muted uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}
