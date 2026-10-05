'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/client';
import { Icon } from '@/components/Icon';
import { Field, Notice, SheetSection, Toggle, iso } from './shared';

/** Email-marketing tools connected with a key (AudienceService in the API): leads go to one of their lists. */
export const AUDIENCE_APPS = new Set(['brevo', 'activecampaign', 'klaviyo']);

/** Where each tool shows the key, for the steps. */
const KEY_PAGE: Record<string, string> = {
  brevo: 'https://app.brevo.com/settings/keys/api',
  activecampaign: 'https://www.activecampaign.com/login',
  klaviyo: 'https://www.klaviyo.com/settings/account/api-keys',
};

interface List {
  id: string;
  name: string;
}
interface Settings {
  connected: boolean;
  status: string;
  listId: string | null;
  listName: string | null;
  autoSync: boolean;
  sent: { synced: number; failed: number; skipped: number };
}

function ListPicker({ lists, value, onChange, name }: { lists: List[]; value: string; onChange: (id: string) => void; name: string }) {
  const { t } = useTranslation('integrations');
  if (!lists.length) return <Notice icon="info">{t('apps.audience.noLists')}</Notice>;
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium text-ink">{t('apps.audience.list')}</legend>
      <div className="max-h-64 space-y-1.5 overflow-y-auto">
        {lists.map((l) => (
          <label key={l.id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ring-1 ring-inset ${value === l.id ? 'ring-accent' : 'ring-line'}`}>
            <input type="radio" name={name} value={l.id} checked={value === l.id} onChange={() => onChange(l.id)} className="accent-[hsl(var(--v-accent))]" />
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{l.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Connecting: the key (and ActiveCampaign's URL), then the list. */
export function AudienceSetup({ appKey, appName, onConnected }: { appKey: string; appName: string; onConnected: () => void }) {
  const { t } = useTranslation('integrations');
  const [apiKey, setApiKey] = useState('');
  const [accountUrl, setAccountUrl] = useState('');
  const [account, setAccount] = useState<string | null>(null);
  const [lists, setLists] = useState<List[]>([]);
  const [listId, setListId] = useState('');
  const [autoSync, setAutoSync] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const ac = appKey === 'activecampaign';
  const creds = () => ({ apiKey: apiKey.trim(), ...(ac ? { accountUrl: accountUrl.trim() } : {}) });

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy('check');
    try {
      const r = await authFetch<{ account: string; lists: List[] }>(`/integrations/${appKey}/audience/check`, { method: 'POST', body: JSON.stringify(creds()) });
      setAccount(r.account);
      setLists(r.lists);
      setListId((id) => (r.lists.some((l) => l.id === id) ? id : r.lists[0]?.id ?? ''));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy('connect');
    try {
      await authFetch(`/integrations/${appKey}/audience`, { method: 'PUT', body: JSON.stringify({ ...creds(), listId, autoSync }) });
      onConnected();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  return (
    <SheetSection title={t('apps.audience.setUp', { name: appName })}>
      <div className="space-y-5">
        {error && <Notice tone="danger" icon="x">{error}</Notice>}
        <p className="text-sm leading-relaxed text-ink">{t(`apps.audience.where.${appKey}`)}</p>
        <a href={KEY_PAGE[appKey]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
          {t('apps.audience.openKeys', { name: appName })} <Icon name="external-link" size={13} />
        </a>
        <form onSubmit={check} className="space-y-3">
          {ac && (
            <Field label={t('apps.audience.accountUrl')} htmlFor="aud-url">
              <input id="aud-url" dir="ltr" type="url" autoComplete="off" spellCheck={false} value={accountUrl} onChange={(e) => setAccountUrl(e.target.value)} placeholder="https://youraccount.api-us1.com" className="v-field w-full font-mono text-sm" />
            </Field>
          )}
          <Field label={t('apps.audience.key')} htmlFor="aud-key" hint={t('apps.audience.keyHint')}>
            <input id="aud-key" dir="ltr" type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="v-field w-full font-mono text-sm" />
          </Field>
          <button type="submit" disabled={!apiKey.trim() || (ac && !accountUrl.trim()) || !!busy} className="v-btn v-btn-ghost disabled:opacity-60">
            {busy === 'check' ? t('apps.audience.checking') : account ? t('apps.audience.recheck') : t('apps.audience.check')}
          </button>
        </form>

        {account !== null && (
          <form onSubmit={connect} className="space-y-5">
            <p className="flex items-center gap-2 text-sm text-ink">
              <Icon name="check" size={14} className="text-emerald-600" /> {t('apps.audience.account', { account: iso(account) })}
            </p>
            <ListPicker lists={lists} value={listId} onChange={setListId} name="aud-list" />
            {lists.length > 0 && (
              <>
                <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 ring-1 ring-inset ring-line">
                  <span className="text-sm text-ink">{t('apps.audience.autoSync')}</span>
                  <Toggle on={autoSync} onChange={() => setAutoSync(!autoSync)} label={t('apps.audience.autoSync')} />
                </div>
                <p className="text-xs leading-relaxed text-faint">{t('apps.audience.consent')}</p>
                <button type="submit" disabled={!listId || !!busy} className="v-btn w-full disabled:opacity-60 sm:w-auto">
                  {busy === 'connect' ? t('apps.audience.connecting') : t('apps.audience.connect')}
                </button>
              </>
            )}
          </form>
        )}
      </div>
    </SheetSection>
  );
}

/** A connected tool: the list, adding new leads, adding recent ones, and how it went. */
export function AudienceSettings({ appKey, canManage, onChanged }: { appKey: string; canManage: boolean; onChanged: () => void }) {
  const { t } = useTranslation('integrations');
  const [s, setS] = useState<Settings | null>(null);
  const [lists, setLists] = useState<List[] | null>(null);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    authFetch<Settings>(`/integrations/${appKey}/audience`).then(setS).catch((e) => setNote({ tone: 'danger', text: (e as Error).message }));
  }, [appKey]);

  async function save(change: { listId?: string; autoSync?: boolean }) {
    setNote(null);
    setBusy('save');
    try {
      setS(await authFetch<Settings>(`/integrations/${appKey}/audience`, { method: 'PATCH', body: JSON.stringify(change) }));
    } catch (e) {
      setNote({ tone: 'danger', text: (e as Error).message });
    } finally {
      setBusy('');
    }
  }

  async function showLists() {
    setBusy('lists');
    setNote(null);
    try {
      setLists(await authFetch<List[]>(`/integrations/${appKey}/audience/lists`));
    } catch (e) {
      setNote({ tone: 'danger', text: (e as Error).message });
    } finally {
      setBusy('');
    }
  }

  async function syncRecent() {
    setBusy('sync');
    setNote(null);
    try {
      const r = await authFetch<{ synced: number; failed: number; skipped: number }>(`/integrations/${appKey}/audience/sync`, { method: 'POST' });
      setNote({ tone: r.failed ? 'danger' : 'success', text: t('apps.audience.synced', { synced: r.synced, skipped: r.skipped, failed: r.failed }) });
      setS(await authFetch<Settings>(`/integrations/${appKey}/audience`));
      onChanged();
    } catch (e) {
      setNote({ tone: 'danger', text: (e as Error).message });
    } finally {
      setBusy('');
    }
  }

  if (!s) return <div className="v-skeleton h-40 rounded-lg" />;
  return (
    <SheetSection title={t('apps.audience.settings')}>
      <div className="space-y-5">
        {note && (
          <Notice tone={note.tone} icon={note.tone === 'success' ? 'check' : 'x'} onDismiss={() => setNote(null)}>
            {note.text}
          </Notice>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-ink">{t('apps.audience.addsTo', { list: iso(s.listName ?? '—') })}</span>
          {canManage && lists === null && (
            <button onClick={showLists} disabled={!!busy} className="text-sm font-medium text-accent hover:underline disabled:opacity-60">
              {busy === 'lists' ? t('apps.audience.checking') : t('apps.audience.change')}
            </button>
          )}
        </div>
        {lists !== null && (
          <ListPicker
            lists={lists}
            value={s.listId ?? ''}
            name="aud-list-change"
            onChange={(listId) => {
              void save({ listId });
              setLists(null);
            }}
          />
        )}
        <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 ring-1 ring-inset ring-line">
          <span className="text-sm text-ink">{t('apps.audience.autoSync')}</span>
          <Toggle on={s.autoSync} disabled={!canManage || !!busy} onChange={() => void save({ autoSync: !s.autoSync })} label={t('apps.audience.autoSync')} />
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center">
          {(['synced', 'skipped', 'failed'] as const).map((k) => (
            <div key={k} className="rounded-lg bg-elevated px-2 py-2.5 ring-1 ring-inset ring-line">
              <dt className="text-xs text-muted">{t(`apps.audience.counts.${k}`)}</dt>
              <dd className="tabular mt-0.5 text-base font-semibold text-ink">{s.sent[k]}</dd>
            </div>
          ))}
        </dl>
        {s.sent.skipped > 0 && <p className="text-xs leading-relaxed text-faint">{t('apps.audience.skippedWhy')}</p>}
        {canManage && (
          <button onClick={syncRecent} disabled={!!busy} className="v-btn v-btn-ghost disabled:opacity-60">
            <Icon name="refresh" size={14} /> {busy === 'sync' ? t('apps.audience.syncing') : t('apps.audience.syncRecent')}
          </button>
        )}
      </div>
    </SheetSection>
  );
}
