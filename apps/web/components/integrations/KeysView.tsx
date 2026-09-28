'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/client';
import { API_URL } from '@/lib/api';
import { formatDate, formatRelativeTime } from '@/lib/format';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Empty, Field, Intro, ListSkeleton, Notice, SecretDialog, iso } from './shared';

interface ApiKey {
  id: string;
  name: string;
  keyHint: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revoked: boolean;
  createdBy: string | null;
  createdAt: string;
}

type Level = 'none' | 'read' | 'write';
const ORDER = ['cards', 'crm', 'analytics', 'nfc', 'qr', 'integration'];
const EXPIRY = [0, 30, 90, 365];

/** "cards:read" and "cards:write" as one row per resource, with the levels it offers. */
function resourcesOf(scopes: string[]): { key: string; levels: Level[] }[] {
  const map = new Map<string, Set<string>>();
  for (const s of scopes) {
    const [res, lvl] = s.split(':');
    if (!map.has(res)) map.set(res, new Set());
    map.get(res)!.add(lvl);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99))
    .map(([key, lv]) => ({ key, levels: ['none', ...(lv.has('read') ? ['read'] : []), ...(lv.has('write') ? ['write'] : [])] as Level[] }));
}

/** A key's scopes as a level per resource: write implies read. */
function levelsOf(scopes: string[]): Record<string, Level> {
  const out: Record<string, Level> = {};
  for (const s of scopes) {
    const [res, lvl] = s.split(':');
    if (lvl === 'write') out[res] = 'write';
    else if (lvl === 'read' && out[res] !== 'write') out[res] = 'read';
  }
  return out;
}

export function KeysView() {
  const { t } = useTranslation('integrations');
  const { locale } = useLocale();
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [scopes, setScopes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState('');
  const [confirm, setConfirm] = useState<{ kind: 'rotate' | 'revoke' | 'delete'; k: ApiKey } | null>(null);

  const load = useCallback(() => {
    authFetch<ApiKey[]>('/api-keys').then(setKeys).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => {
    load();
    authFetch<{ scopes: string[] }>('/api-keys/scopes').then((r) => setScopes(r.scopes)).catch(() => {});
  }, [load]);

  const access = (k: ApiKey) =>
    Object.entries(levelsOf(k.scopes))
      .sort(([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b))
      .map(([res, lvl]) => `${t(`keys.resources.${res}`, { defaultValue: res })}: ${t(`keys.levels.${lvl}`)}`)
      .join(' · ');
  const expired = (k: ApiKey) => !!k.expiresAt && new Date(k.expiresAt).getTime() < Date.now();

  const confirmCopy = {
    rotate: { title: 'keys.rotateTitle', body: 'keys.rotateBody', label: 'keys.rotate', busy: 'keys.rotating' },
    revoke: { title: 'keys.revokeTitle', body: 'keys.revokeBody', label: 'keys.revoke', busy: 'keys.revoking' },
    delete: { title: 'keys.deleteTitle', body: 'keys.deleteBody', label: 'keys.delete', busy: 'keys.deleting' },
  } as const;
  const c = confirm ? confirmCopy[confirm.kind] : null;

  return (
    <div>
      <Intro
        text={t('keys.intro')}
        action={
          keys && keys.length > 0 ? (
            <button onClick={() => setCreating(true)} className="v-btn">
              <Icon name="plus" size={14} /> {t('keys.new')}
            </button>
          ) : undefined
        }
      />
      {error && <Notice tone="danger" icon="x" onDismiss={() => setError('')}>{error}</Notice>}

      {!keys ? (
        <ListSkeleton rows={2} />
      ) : keys.length === 0 ? (
        <Empty
          icon="lock"
          title={t('keys.emptyTitle')}
          body={t('keys.emptyBody')}
          action={
            <button onClick={() => setCreating(true)} className="v-btn">
              <Icon name="plus" size={14} /> {t('keys.new')}
            </button>
          }
        />
      ) : (
        <div className="v-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="v-table">
              <thead>
                <tr>
                  <th>{t('keys.columns.name')}</th>
                  <th className="hidden md:table-cell">{t('keys.columns.key')}</th>
                  <th className="hidden lg:table-cell">{t('keys.columns.access')}</th>
                  <th className="hidden whitespace-nowrap sm:table-cell">{t('keys.columns.lastUsed')}</th>
                  <th className="w-12">
                    <span className="sr-only">{t('more')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const dead = k.revoked || expired(k);
                  return (
                    <tr key={k.id}>
                      <td className="w-full max-w-0">
                        <span className="flex items-center gap-2">
                          <span className={`truncate font-medium ${dead ? 'text-muted' : 'text-ink'}`}>{k.name}</span>
                          {k.revoked ? (
                            <span className="v-badge v-badge-neutral shrink-0">{t('keys.status.revoked')}</span>
                          ) : expired(k) ? (
                            <span className="v-badge v-badge-warning shrink-0">{t('keys.status.expired')}</span>
                          ) : null}
                        </span>
                        <span className="block truncate text-[12px] text-faint">
                          {k.createdBy ? t('keys.createdBy', { name: iso(k.createdBy), date: iso(formatDate(k.createdAt, locale)) }) : formatDate(k.createdAt, locale)}
                          {k.expiresAt && !k.revoked && !expired(k) && ` · ${t('keys.expires', { date: iso(formatDate(k.expiresAt, locale)) })}`}
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-muted lg:hidden">{access(k)}</span>
                      </td>
                      <td className="hidden whitespace-nowrap md:table-cell">
                        <span dir="ltr" className="font-mono text-[12.5px] text-muted">
                          {k.keyHint}
                        </span>
                      </td>
                      <td className="hidden min-w-[240px] max-w-[340px] lg:table-cell">
                        <span className="line-clamp-2 text-[12.5px] text-muted" title={access(k)}>
                          {access(k)}
                        </span>
                      </td>
                      <td className="hidden whitespace-nowrap text-[12.5px] text-muted sm:table-cell">{k.lastUsedAt ? formatRelativeTime(k.lastUsedAt, locale) : t('never')}</td>
                      <td>
                        <ActionMenu
                          label={t('more')}
                          items={
                            dead
                              ? [{ key: 'delete', label: t('keys.delete'), icon: 'trash', danger: true, onSelect: () => setConfirm({ kind: 'delete', k }) }]
                              : [
                                  { key: 'rotate', label: t('keys.rotate'), icon: 'refresh', onSelect: () => setConfirm({ kind: 'rotate', k }) },
                                  { key: 'revoke', label: t('keys.revoke'), icon: 'x', danger: true, separated: true, onSelect: () => setConfirm({ kind: 'revoke', k }) },
                                ]
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Usage />

      <NewKeySheet
        open={creating}
        scopes={scopes}
        onClose={() => setCreating(false)}
        onCreated={(key) => {
          setCreating(false);
          setSecret(key);
          load();
        }}
      />

      <SecretDialog open={!!secret} title={t('secretDialog.keyTitle')} value={secret} onDone={() => setSecret('')}>
        <p className="text-[12.5px] text-muted">{t('keys.use.body')}</p>
        <pre dir="ltr" className="mt-2 overflow-x-auto rounded-lg bg-elevated px-3 py-2.5 text-start font-mono text-[12px] text-ink ring-1 ring-inset ring-line">{`Authorization: Bearer ${secret.slice(0, 10)}…`}</pre>
      </SecretDialog>

      <ConfirmDialog
        open={!!confirm}
        title={c ? t(c.title, { name: confirm!.k.name }) : ''}
        body={c ? t(c.body) : ''}
        confirmLabel={c ? t(c.label) : ''}
        busyLabel={c ? t(c.busy) : ''}
        cancelLabel={t('cancel')}
        danger={confirm?.kind !== 'rotate'}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const { kind, k } = confirm!;
          if (kind === 'rotate') {
            const r = await authFetch<{ key: string }>(`/api-keys/${k.id}/rotate`, { method: 'POST' });
            setSecret(r.key);
          } else if (kind === 'revoke') {
            await authFetch(`/api-keys/${k.id}/revoke`, { method: 'POST' });
          } else {
            await authFetch(`/api-keys/${k.id}`, { method: 'DELETE' });
          }
          setConfirm(null);
          load();
        }}
      />
    </div>
  );
}

function Usage() {
  const { t } = useTranslation('integrations');
  const example = `curl ${API_URL}/cards \\\n  -H "Authorization: Bearer <your key>"`;
  return (
    <details className="group mt-6 rounded-xl ring-1 ring-inset ring-line">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] font-medium text-ink sm:px-5 [&::-webkit-details-marker]:hidden">
        <Icon name="file-text" size={14} className="text-faint" />
        {t('keys.use.title')}
        <Icon name="chevron-down" size={14} className="ms-auto text-faint transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-line px-4 py-4 sm:px-5">
        <p className="text-[13px] text-muted">{t('keys.use.body')}</p>
        <pre dir="ltr" className="mt-3 overflow-x-auto rounded-lg bg-elevated px-3.5 py-3 text-start font-mono text-[12px] leading-relaxed text-ink ring-1 ring-inset ring-line">
          {example}
        </pre>
      </div>
    </details>
  );
}

function NewKeySheet({ open, scopes, onClose, onCreated }: { open: boolean; scopes: string[]; onClose: () => void; onCreated: (key: string) => void }) {
  const { t } = useTranslation('integrations');
  const [name, setName] = useState('');
  const [levels, setLevels] = useState<Record<string, Level>>({});
  const [days, setDays] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const resources = useMemo(() => resourcesOf(scopes), [scopes]);

  useEffect(() => {
    if (!open) return;
    setName('');
    setLevels({});
    setDays(0);
    setErr('');
    setBusy(false);
  }, [open]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const chosen = Object.entries(levels).flatMap(([res, lvl]) => (lvl === 'write' ? [`${res}:read`, `${res}:write`] : lvl === 'read' ? [`${res}:read`] : []));
    if (!name.trim()) return setErr(t('keys.form.needName'));
    if (!chosen.length) return setErr(t('keys.form.needAccess'));
    setBusy(true);
    try {
      const r = await authFetch<{ key: string }>('/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), scopes: chosen.filter((s) => scopes.includes(s)), expiresAt: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null }),
      });
      onCreated(r.key);
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={t('close')}
      title={t('keys.new')}
      footer={
        <div className="flex items-center justify-end gap-2">
          {err && <p className="me-auto text-[12.5px] text-red-600 dark:text-red-400">{err}</p>}
          <button type="button" onClick={onClose} className="v-btn v-btn-ghost">
            {t('cancel')}
          </button>
          <button type="submit" form="key-form" disabled={busy} className="v-btn disabled:opacity-60">
            {busy ? t('saving') : t('keys.new')}
          </button>
        </div>
      }
    >
      <form id="key-form" onSubmit={save} className="space-y-5">
        <Field label={t('keys.form.name')} htmlFor="key-name">
          <input id="key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('keys.form.namePlaceholder')} maxLength={120} className="v-field w-full" />
        </Field>

        <div>
          <p className="mb-2 text-[12.5px] font-medium text-ink">{t('keys.form.access')}</p>
          <div className="divide-y divide-line rounded-lg ring-1 ring-inset ring-line">
            {resources.map((r) => {
              const value = levels[r.key] ?? 'none';
              return (
                <div key={r.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <span className="text-[13px] text-ink">{t(`keys.resources.${r.key}`, { defaultValue: r.key })}</span>
                  <div role="radiogroup" aria-label={t(`keys.resources.${r.key}`, { defaultValue: r.key })} className="inline-flex rounded-lg bg-elevated p-0.5 ring-1 ring-inset ring-line">
                    {r.levels.map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        role="radio"
                        aria-checked={value === lvl}
                        onClick={() => setLevels((v) => ({ ...v, [r.key]: lvl }))}
                        className={`h-9 rounded-md px-2.5 text-[12.5px] font-medium sm:h-7 ${value === lvl ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'}`}
                      >
                        {t(`keys.levels.${lvl}`)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Field label={t('keys.form.expires')} htmlFor="key-expiry">
          <select id="key-expiry" value={days} onChange={(e) => setDays(Number(e.target.value))} className="v-field w-full">
            {EXPIRY.map((d) => (
              <option key={d} value={d}>
                {d === 0 ? t('keys.form.never') : d === 365 ? t('keys.form.year') : t('keys.form.days', { count: d })}
              </option>
            ))}
          </select>
        </Field>
      </form>
    </Sheet>
  );
}

