'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { authFetch, getActiveOrgId, getToken, uploadImage, type Me } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatDate, formatNumber } from '@/lib/format';
import { readableOn, shade } from '@/lib/color';
import AppShell from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { OrgMark, ORG_UPDATED } from '@/components/OrgMark';
import { ImageUpload } from '@/components/ImageUpload';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

type Section = 'general' | 'brand' | 'files';
const SECTIONS: Section[] = ['general', 'brand', 'files'];
const SWATCHES = ['#2563eb', '#1d4ed8', '#0ea5e9', '#0d9488', '#16a34a', '#ca8a04', '#ea580c', '#dc2626', '#db2777', '#7c3aed', '#475569', '#0a0a0a'];

interface Org {
  id: string;
  name: string;
  slug: string;
  plan: string;
  branding: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
}

interface Asset {
  id: string;
  name: string;
  url: string;
  mimeType: string | null;
  size: number;
  createdAt: string;
  uploader: { name: string | null; email: string } | null;
}

/**
 * The workspace's own settings, and only ones the product acts on: its name,
 * the defaults new cards start from, its brand mark, and its shared files.
 * People live on the Team page and plans on Billing.
 */
export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const { t } = useTranslation('organizations');
  const [section, setSection] = useState<Section>('general');
  const [org, setOrg] = useState<Org | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [personal, setPersonal] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }

  const load = useCallback(async () => {
    const [o, m] = await Promise.all([authFetch<Org>('/orgs/current'), authFetch<Me>('/auth/me')]);
    setOrg(o);
    setMe(m);
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

  /** PATCH /orgs/current; settings and branding are merged so no other key is lost. */
  const save = useCallback(
    async (patch: { name?: string; settings?: Record<string, unknown>; branding?: Record<string, unknown> }, done: string) => {
      if (!org) return;
      setError('');
      const body: Record<string, unknown> = {};
      if (patch.name !== undefined) body.name = patch.name;
      if (patch.settings) body.settings = { ...(org.settings ?? {}), ...patch.settings };
      if (patch.branding) body.branding = { ...(org.branding ?? {}), ...patch.branding };
      try {
        const updated = await authFetch<Org>('/orgs/current', { method: 'PATCH', body: JSON.stringify(body) });
        setOrg(updated);
        window.dispatchEvent(new Event(ORG_UPDATED));
        flash(done);
      } catch (e) {
        setError((e as Error).message);
        throw e;
      }
    },
    [org],
  );

  const canEdit = me?.role === 'OWNER' || me?.role === 'ADMIN';
  const canManageFiles = canEdit || me?.role === 'MANAGER';

  if (personal) {
    return (
      <AppShell title={t('title')}>
        <div className="mx-auto max-w-[520px] rounded-xl px-6 py-10 text-center ring-1 ring-inset ring-line">
          <p className="text-[13.5px] leading-relaxed text-muted">{t('personal')}</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={t('title')}>
      <nav role="tablist" aria-label={t('title')} className="no-scrollbar -mx-5 flex gap-5 overflow-x-auto border-b border-line px-5 md:-mx-8 md:px-8">
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
              {t(`sections.${s}`)}
              {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ink" />}
            </button>
          );
        })}
      </nav>

      {!canEdit && me && section !== 'files' && <p className="mt-4 rounded-lg bg-elevated px-4 py-3 text-[13px] text-muted ring-1 ring-inset ring-line">{t('readOnly')}</p>}

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-3 rounded-lg bg-red-500/[0.06] px-4 py-3 text-[13px] text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-300">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} aria-label={t('dismiss')} className="-m-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-red-500/10">
            <Icon name="x" size={13} />
          </button>
        </div>
      )}

      <div className="mt-6 max-w-[880px]">
        {!org ? (
          <div className="space-y-4">
            <div className="v-skeleton h-40 w-full rounded-xl" />
            <div className="v-skeleton h-32 w-full rounded-xl" />
          </div>
        ) : section === 'general' ? (
          <General org={org} canEdit={canEdit} onSave={save} />
        ) : section === 'brand' ? (
          <Brand org={org} canEdit={canEdit} onSave={save} />
        ) : (
          <Files canManage={canManageFiles} onDone={flash} onError={setError} />
        )}
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            role="status"
            className="fixed inset-x-0 bottom-6 z-[110] mx-auto flex w-fit items-center gap-2 rounded-lg bg-[#17171a] px-3.5 py-2.5 text-[13px] font-medium text-white shadow-lg"
          >
            <Icon name="check" size={14} /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}

type SaveFn = (patch: { name?: string; settings?: Record<string, unknown>; branding?: Record<string, unknown> }, done: string) => Promise<void>;

/** A settings block: a heading and hint on one side, the controls on the other. */
function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 border-b border-line py-5 last:border-b-0 md:grid-cols-[240px_minmax(0,1fr)] md:gap-8">
      <div>
        <h2 className="text-[14px] font-medium text-ink">{title}</h2>
        {hint && <p className="mt-1 text-[12.5px] leading-relaxed text-faint">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function General({ org, canEdit, onSave }: { org: Org; canEdit: boolean; onSave: SaveFn }) {
  const { t } = useTranslation('organizations');
  const [name, setName] = useState(org.name);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const language = org.settings?.language === 'ar' ? 'ar' : 'en';

  useEffect(() => setName(org.name), [org.name]);

  const dirty = name.trim() !== '' && name.trim() !== org.name;

  return (
    <div className="v-card px-5">
      <Row title={t('general.name')} hint={t('general.nameHint')}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!dirty) return;
            setBusy(true);
            await onSave({ name: name.trim() }, t('toasts.saved')).catch(() => {});
            setBusy(false);
          }}
          className="flex flex-wrap gap-2"
        >
          <input className="v-field min-w-0 flex-1" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} maxLength={120} required />
          {canEdit && (
            <button disabled={!dirty || busy} className="v-btn shrink-0 disabled:opacity-50">
              {busy ? t('saving') : t('save')}
            </button>
          )}
        </form>
      </Row>

      <Row title={t('general.language')} hint={t('general.languageHint')}>
        <div role="radiogroup" aria-label={t('general.language')} className="inline-flex rounded-lg bg-elevated p-0.5 ring-1 ring-inset ring-line">
          {(['en', 'ar'] as const).map((l) => (
            <button
              key={l}
              role="radio"
              aria-checked={language === l}
              disabled={!canEdit}
              onClick={() => language !== l && onSave({ settings: { language: l } }, t('toasts.saved')).catch(() => {})}
              className={`h-11 rounded-md px-4 text-[13px] font-medium transition-colors disabled:cursor-not-allowed sm:h-8 ${
                language === l ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'
              }`}
            >
              {l === 'en' ? 'English' : 'العربية'}
            </button>
          ))}
        </div>
      </Row>

      <Row title={t('general.plan')} hint={t('general.planHint')}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="v-badge v-badge-neutral">{t(`plans.${org.plan}`, org.plan)}</span>
          <Link href="/billing" className="text-[13px] font-medium text-accent hover:underline">
            {t('general.billing')}
          </Link>
        </div>
      </Row>

      <Row title={t('general.id')} hint={t('general.idHint')}>
        <div className="flex items-center gap-2">
          <span dir="ltr" className="flex h-9 min-w-0 flex-1 items-center truncate rounded-lg bg-elevated px-3 font-mono text-[12.5px] text-muted ring-1 ring-inset ring-line rtl:text-right">
            {org.id}
          </span>
          <button
            onClick={() =>
              navigator.clipboard
                ?.writeText(org.id)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
                .catch(() => {})
            }
            className="v-btn v-btn-ghost shrink-0 !h-11 sm:!h-9"
          >
            <Icon name={copied ? 'check' : 'copy'} size={13} /> {copied ? t('copied') : t('copy')}
          </button>
        </div>
      </Row>
    </div>
  );
}

function Brand({ org, canEdit, onSave }: { org: Org; canEdit: boolean; onSave: SaveFn }) {
  const { t } = useTranslation('organizations');
  const initialAccent = typeof org.branding?.accent === 'string' ? (org.branding.accent as string) : '#2563eb';
  const initialLogo = typeof org.branding?.logo === 'string' ? (org.branding.logo as string) : '';
  const [accent, setAccent] = useState(initialAccent);
  const [logo, setLogo] = useState(initialLogo);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAccent(initialAccent);
    setLogo(initialLogo);
  }, [initialAccent, initialLogo]);

  const valid = /^#[0-9a-f]{6}$/i.test(accent);
  const dirty = accent.toLowerCase() !== initialAccent.toLowerCase() || logo !== initialLogo;
  const preview = { ...(org.branding ?? {}), accent: valid ? accent : initialAccent, logo };

  return (
    <div className="space-y-4">
      <div className="v-card px-5">
        <Row title={t('brand.logo')} hint={t('brand.logoHint')}>
          {canEdit ? (
            <ImageUpload value={logo} onChange={setLogo} shape="circle" />
          ) : (
            <OrgMark name={org.name} branding={org.branding} size={56} />
          )}
        </Row>

        <Row title={t('brand.colour')} hint={t('brand.colourHint')}>
          <div className="flex flex-wrap items-center gap-2">
            {SWATCHES.map((c) => {
              const selected = accent.toLowerCase() === c;
              return (
                <button
                  key={c}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setAccent(c)}
                  aria-label={c}
                  aria-pressed={selected}
                  className="flex h-11 w-11 items-center justify-center rounded-full disabled:cursor-not-allowed sm:h-8 sm:w-8"
                  style={{ boxShadow: selected ? `0 0 0 2px hsl(var(--v-surface)), 0 0 0 4px ${c}` : undefined }}
                >
                  <span className="h-8 w-8 rounded-full ring-1 ring-inset ring-black/10 sm:h-7 sm:w-7" style={{ background: c }} />
                </button>
              );
            })}
            <label className="flex h-11 items-center gap-2 rounded-full px-2.5 ring-1 ring-inset ring-line sm:h-8">
              <input type="color" value={valid ? accent : '#2563eb'} onChange={(e) => setAccent(e.target.value)} disabled={!canEdit} className="h-5 w-5 cursor-pointer rounded-full border-0 bg-transparent p-0" aria-label={t('brand.custom')} />
              <input
                dir="ltr"
                value={accent}
                onChange={(e) => setAccent(e.target.value.trim())}
                disabled={!canEdit}
                className="w-[72px] bg-transparent font-mono text-[12.5px] text-ink outline-none"
                aria-label={t('brand.hex')}
              />
            </label>
          </div>
          {!valid && <p className="mt-2 text-[12.5px] text-red-600 dark:text-red-400">{t('brand.invalid')}</p>}
        </Row>

        {canEdit && (
          <div className="flex justify-end gap-2 py-4">
            {dirty && (
              <button
                onClick={() => {
                  setAccent(initialAccent);
                  setLogo(initialLogo);
                }}
                className="v-btn v-btn-ghost"
              >
                {t('discard')}
              </button>
            )}
            <button
              disabled={!dirty || !valid || busy}
              onClick={async () => {
                setBusy(true);
                await onSave({ branding: { accent, logo: logo || null } }, t('toasts.brandSaved')).catch(() => {});
                setBusy(false);
              }}
              className="v-btn disabled:opacity-50"
            >
              {busy ? t('saving') : t('save')}
            </button>
          </div>
        )}
      </div>

      {/* Where the brand shows up, drawn from what is being edited. */}
      <div className="v-card p-5">
        <h2 className="text-[14px] font-medium text-ink">{t('brand.previewTitle')}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-[12px] text-faint">{t('brand.inSwitcher')}</p>
            <div className="flex items-center gap-2.5 rounded-lg bg-surface px-2 py-1.5 shadow-sm ring-1 ring-line">
              <OrgMark name={org.name} branding={preview} size={22} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{org.name}</span>
              <Icon name="chevron-down" size={14} className="text-faint" />
            </div>
          </div>
          <div>
            <p className="mb-2 text-[12px] text-faint">{t('brand.inNewCards')}</p>
            <div className="overflow-hidden rounded-lg ring-1 ring-inset ring-line" aria-hidden>
              <div className="h-10" style={{ background: `linear-gradient(135deg, ${preview.accent}, ${shade(preview.accent as string, -46)})` }} />
              <div className="flex items-center gap-3 bg-surface px-3 pb-3">
                <span
                  className="-mt-4 flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold ring-2 ring-surface"
                  style={{ background: preview.accent as string, color: readableOn(preview.accent as string) }}
                >
                  A
                </span>
                <span className="mt-1 h-2 w-24 rounded bg-line" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatSize(bytes: number, locale: Parameters<typeof formatNumber>[1]) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${formatNumber(Math.max(1, Math.round(bytes / 1024)), locale)} KB`;
  return `${formatNumber(Math.round((bytes / (1024 * 1024)) * 10) / 10, locale)} MB`;
}

/** Images the whole workspace can reuse: logos, backgrounds, product shots. */
function Files({ canManage, onDone, onError }: { canManage: boolean; onDone: (m: string) => void; onError: (m: string) => void }) {
  const { t } = useTranslation('organizations');
  const { locale } = useLocale();
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    authFetch<Asset[]>('/orgs/assets')
      .then(setAssets)
      .catch((e) => {
        setAssets([]);
        onError((e as Error).message);
      });
  }, [onError]);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onError(t('files.onlyImages'));
      return;
    }
    setUploading(true);
    try {
      const url = await uploadImage(file);
      const created = await authFetch<Asset>('/orgs/assets', { method: 'POST', body: JSON.stringify({ name: file.name, url, mimeType: file.type, size: file.size }) });
      setAssets((a) => [created, ...(a ?? [])]);
      onDone(t('toasts.uploaded'));
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const copy = (a: Asset) =>
    navigator.clipboard
      ?.writeText(a.url)
      .then(() => onDone(t('toasts.linkCopied')))
      .catch(() => {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-lg text-[13px] leading-relaxed text-muted">{t('files.intro')}</p>
        {canManage && (
          <>
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="v-btn shrink-0 disabled:opacity-60">
              <Icon name={uploading ? 'loader' : 'upload'} size={14} className={uploading ? 'animate-spin' : undefined} />
              {uploading ? t('files.uploading') : t('files.upload')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                upload(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </>
        )}
      </div>

      {assets === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="v-skeleton aspect-[4/3] rounded-xl" />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
          <p className="text-[14px] font-medium text-ink">{t('files.emptyTitle')}</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{t('files.emptyBody')}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {assets.map((a) => (
            <li key={a.id} className="overflow-hidden rounded-xl bg-surface ring-1 ring-inset ring-line">
              <a href={a.url} target="_blank" rel="noreferrer" className="block aspect-[4/3] overflow-hidden bg-elevated">
                {(a.mimeType ?? '').startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center text-faint">
                    <Icon name="file-text" size={24} />
                  </span>
                )}
              </a>
              <div className="flex items-start gap-1 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink" title={a.name}>
                    {a.name}
                  </p>
                  <p className="truncate text-[12px] text-faint">
                    {formatSize(a.size, locale)} · {formatDate(a.createdAt, locale, { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <ActionMenu
                  label={t('more')}
                  items={[
                    { key: 'copy', label: t('files.copyLink'), icon: 'copy', onSelect: () => copy(a) },
                    { key: 'open', label: t('files.open'), icon: 'external-link', externalHref: a.url },
                    ...(canManage ? [{ key: 'delete', label: t('files.delete'), icon: 'trash', danger: true, separated: true, onSelect: () => setDeleting(a) }] : []),
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={t('files.deleteTitle')}
        body={
          <>
            <span className="text-ink">{deleting?.name}</span>
            <p className="mt-1.5">{t('files.deleteBody')}</p>
          </>
        }
        confirmLabel={t('files.delete')}
        busyLabel={t('files.deleting')}
        cancelLabel={t('cancel')}
        danger
        onConfirm={async () => {
          if (!deleting) return;
          await authFetch(`/orgs/assets/${deleting.id}`, { method: 'DELETE' });
          setAssets((list) => (list ?? []).filter((x) => x.id !== deleting.id));
          setDeleting(null);
          onDone(t('toasts.deleted'));
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
