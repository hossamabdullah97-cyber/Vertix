'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';
import { authFetch, getActiveOrgId, getToken, type Me } from '@/lib/client';
import AppShell from '@/components/AppShell';
import type { Asset } from '@/components/organization/AssetTemplates';

// One section renders at a time; each loads only when opened.
const Fallback = () => <div className="v-skeleton h-64 w-full rounded-xl" />;
const WorkspaceSettings = dynamic(() => import('@/components/organization/WorkspaceSettings').then((m) => m.WorkspaceSettings), { loading: Fallback });
const BrandCenter = dynamic(() => import('@/components/organization/BrandCenter').then((m) => m.BrandCenter), { loading: Fallback });
const AssetTemplates = dynamic(() => import('@/components/organization/AssetTemplates').then((m) => m.AssetTemplates), { loading: Fallback });

type Section = 'general' | 'brand' | 'assets';
const SECTIONS: Section[] = ['general', 'brand', 'assets'];

interface Org {
  id: string;
  name: string;
  slug: string;
  plan: string;
  branding: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
}

/**
 * The workspace's own settings: its name and defaults, its brand, and its
 * shared files. People and teams live on the Team page; plans on Billing.
 */
export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const { t } = useTranslation('teams');
  const [section, setSection] = useState<Section>('general');
  const [org, setOrg] = useState<Org | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [personal, setPersonal] = useState(false);

  const load = useCallback(async () => {
    const [o, m] = await Promise.all([authFetch<Org>('/orgs/current'), authFetch<Me>('/auth/me')]);
    setOrg(o);
    setMe(m);
    authFetch<Asset[]>('/orgs/assets').then(setAssets).catch(() => setAssets([]));
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    const s = new URLSearchParams(window.location.search).get('section') as Section | null;
    if (s && SECTIONS.includes(s)) setSection(s);
    if (!getActiveOrgId()) {
      setPersonal(true);
      return;
    }
    load().catch((e) => setError((e as Error).message));
  }, [router, load]);

  function choose(next: Section) {
    setSection(next);
    const url = new URL(window.location.href);
    url.search = next === 'general' ? '' : `?section=${next}`;
    window.history.replaceState(null, '', url);
  }

  async function save(input: Record<string, unknown>, done: string) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await authFetch('/orgs/current', { method: 'PATCH', body: JSON.stringify(input) });
      await load();
      setNotice(done);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const canManage = me?.role === 'OWNER' || me?.role === 'ADMIN';

  if (personal) {
    return (
      <AppShell title={t('workspace.title')}>
        <div className="mx-auto max-w-[520px] rounded-xl px-6 py-10 text-center ring-1 ring-inset ring-line">
          <p className="text-[13.5px] leading-relaxed text-muted">{t('workspace.personal')}</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={t('workspace.title')}>
      <nav role="tablist" aria-label={t('workspace.title')} className="no-scrollbar -mx-5 flex gap-5 overflow-x-auto border-b border-line px-5 md:-mx-8 md:px-8">
        {SECTIONS.map((s) => {
          const active = section === s;
          return (
            <button
              key={s}
              role="tab"
              aria-selected={active}
              onClick={() => choose(s)}
              className={`relative flex min-h-11 shrink-0 items-center text-[13.5px] font-medium transition-colors sm:min-h-10 ${active ? 'text-ink' : 'text-muted hover:text-ink'}`}
            >
              {t(`workspace.sections.${s}`)}
              {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ink" />}
            </button>
          );
        })}
      </nav>

      {error && (
        <div role="alert" className="mt-4 rounded-lg bg-red-500/[0.06] px-4 py-3 text-[13px] text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="mt-4 rounded-lg bg-emerald-500/[0.06] px-4 py-3 text-[13px] text-emerald-800 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-300">
          {notice}
        </div>
      )}

      <div className="mt-5">
        {section === 'general' && <WorkspaceSettings org={org} saving={saving} onSave={(input) => save(input, t('workspace.saved'))} />}
        {section === 'brand' && <BrandCenter org={org} saving={saving} onSave={(input) => save(input, t('workspace.brandSaved'))} />}
        {section === 'assets' && (
          <AssetTemplates
            assets={assets}
            canManage={canManage}
            onCreate={async (input) => {
              try {
                const created = await authFetch<Asset>('/orgs/assets', { method: 'POST', body: JSON.stringify(input) });
                setAssets((a) => [created, ...a]);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
            onDelete={(id) => {
              const prev = assets;
              setAssets((a) => a.filter((x) => x.id !== id));
              authFetch(`/orgs/assets/${id}`, { method: 'DELETE' }).catch((e) => {
                setAssets(prev);
                setError((e as Error).message);
              });
            }}
          />
        )}
      </div>
    </AppShell>
  );
}
