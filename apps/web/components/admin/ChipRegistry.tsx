'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/client';
import { formatNumber } from '@/lib/format';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useNfcScanner } from '@/components/nfc/useNfcScanner';
import { Field, Notice, Pills, SearchField, type AdminOrg } from './shared';

export interface Chip {
  id: string;
  uid: string;
  hardwareType: string;
  batchId: string | null;
  status: 'AVAILABLE' | 'CLAIMED' | 'BLOCKED';
  note: string | null;
  orgName: string | null;
  /** The workspace this chip was sold to — only it may claim the chip. */
  allocatedToOrgId: string | null;
  allocatedToOrgName: string | null;
  claimedAt: string | null;
  createdAt: string;
  assigned: boolean;
  activationCount: number;
  lastScanAt: string | null;
}

interface ChipStats {
  total: number;
  available: number;
  claimed: number;
  blocked: number;
  /** Open stock: no buyer recorded, so any workspace knowing the UID can claim it. */
  unallocated: number;
}

type Status = 'ALL' | Chip['status'];
const TYPES = ['CARD', 'STICKER', 'KEYCHAIN', 'WRISTBAND'] as const;
const DOT: Record<Chip['status'], string> = { AVAILABLE: 'bg-emerald-500', CLAIMED: 'bg-accent', BLOCKED: 'bg-red-500' };

/** One tap's outcome, kept so a whole box of chips can be worked through. */
interface ScanResult {
  uid: string;
  state: 'registered' | 'duplicate' | 'error';
  message?: string;
}

/** A colon-separated serial that may break only between its groups. */
function Serial({ uid }: { uid: string }) {
  return (
    <>
      {uid.split(':').map((part, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <>
              :<wbr />
            </>
          )}
          {part}
        </Fragment>
      ))}
    </>
  );
}

/**
 * The platform's chip registry: the hardware this business issued. Only a UID
 * listed here can be added by a workspace, so this is what decides which
 * physical chips work with the product at all.
 */
export default function ChipRegistry({ orgs }: { orgs: AdminOrg[] }) {
  const { t } = useTranslation('admin');
  const { locale } = useLocale();
  const [chips, setChips] = useState<Chip[] | null>(null);
  const [stats, setStats] = useState<ChipStats | null>(null);
  const [status, setStatus] = useState<Status>('ALL');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState<Chip | null>(null);

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (status !== 'ALL') q.set('status', status);
    if (search.trim()) q.set('search', search.trim());
    const [list, counts] = await Promise.all([authFetch<Chip[]>(`/admin/nfc-chips?${q}`), authFetch<ChipStats>('/admin/nfc-chips/stats')]);
    setChips(list);
    setStats(counts);
  }, [status, search]);

  useEffect(() => {
    // Debounced so typing does not fire a request per letter.
    const id = setTimeout(() => load().catch((e) => setNotice({ tone: 'danger', text: (e as Error).message })), 250);
    return () => clearTimeout(id);
  }, [load]);

  async function setChipStatus(chip: Chip, next: Chip['status']) {
    try {
      await authFetch(`/admin/nfc-chips/${chip.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      await load();
    } catch (e) {
      setNotice({ tone: 'danger', text: (e as Error).message });
    }
  }

  const n = (v: number) => formatNumber(v, locale);
  const counts: [keyof ChipStats, string][] = [
    ['total', ''],
    ['available', ''],
    ['claimed', ''],
    ['blocked', ''],
    // Open stock is a standing risk, not a neutral figure: any workspace that
    // learns one of these UIDs can claim it.
    ['unallocated', 'text-amber-600 dark:text-amber-400'],
  ];

  return (
    <div className="max-w-[1180px]">
      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line ring-1 ring-line sm:grid-cols-3 lg:grid-cols-5">
        {counts.map(([key, tone]) => (
          <div key={key} className="bg-surface px-5 py-4">
            <dt className="text-xs text-muted">{t(`chips.stats.${key}`)}</dt>
            <dd className={`tabular mt-1 text-3xl font-semibold leading-none tracking-[-0.01em] ${tone && stats?.[key] ? tone : 'text-ink'}`}>{stats ? n(stats[key]) : '—'}</dd>
          </div>
        ))}
      </dl>

      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchField value={search} onChange={setSearch} placeholder={t('chips.searchPlaceholder')} className="lg:w-64" />
        <Pills
          label={t('chips.filter.all')}
          value={status}
          onChange={setStatus}
          options={[{ key: 'ALL' as Status, label: t('chips.filter.all') }, ...(['AVAILABLE', 'CLAIMED', 'BLOCKED'] as const).map((s) => ({ key: s as Status, label: t(`chips.status.${s}`) }))]}
        />
        <div className="flex gap-2 lg:ms-auto">
          <button onClick={() => setAssigning(true)} className="v-btn v-btn-ghost">
            {t('chips.assign')}
          </button>
          <button onClick={() => setAdding(true)} className="v-btn">
            <Icon name="plus" size={14} /> {t('chips.add')}
          </button>
        </div>
      </div>

      {!chips ? (
        <div className="v-skeleton h-72 rounded-xl" />
      ) : chips.length === 0 ? (
        <p className="rounded-xl py-14 text-center text-sm text-muted ring-1 ring-inset ring-line">{search || status !== 'ALL' ? t('chips.noMatch') : t('chips.empty')}</p>
      ) : (
        <div className="v-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="v-table">
              <thead>
                <tr>
                  <th>{t('chips.uid')}</th>
                  <th>{t('chips.statusCol')}</th>
                  <th className="hidden md:table-cell">{t('chips.soldTo')}</th>
                  <th className="hidden lg:table-cell">{t('chips.claimedBy')}</th>
                  <th className="hidden xl:table-cell">{t('chips.batchLabel')}</th>
                  <th className="hidden !text-end sm:table-cell">{t('chips.taps')}</th>
                  <th className="w-12">
                    <span className="sr-only">{t('chips.more')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {chips.map((c) => (
                  <tr key={c.id}>
                    <td className="w-full max-w-0">
                      <span dir="ltr" className="block font-mono text-xs text-ink rtl:text-right">
                        <Serial uid={c.uid} />
                      </span>
                      <span className="block text-xs text-faint">{t(`nfc:hardwareType.${c.hardwareType.toLowerCase()}`, { defaultValue: c.hardwareType })}</span>
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="flex items-center gap-2 text-sm text-ink">
                        <span className={`h-2 w-2 rounded-full ${DOT[c.status]}`} />
                        {t(`chips.status.${c.status}`)}
                      </span>
                    </td>
                    <td className="hidden max-w-[200px] md:table-cell">
                      {c.allocatedToOrgName ? (
                        <span className="block truncate text-sm text-muted">{c.allocatedToOrgName}</span>
                      ) : (
                        <span className="text-sm text-amber-700 dark:text-amber-400">{t('chips.openStock')}</span>
                      )}
                    </td>
                    <td className="hidden max-w-[200px] lg:table-cell">
                      <span className={`block truncate text-sm ${c.orgName ? 'text-muted' : 'text-faint'}`}>{c.orgName ?? t('chips.notInUse')}</span>
                    </td>
                    <td className="hidden xl:table-cell">
                      <span dir="ltr" className="whitespace-nowrap font-mono text-xs text-muted">
                        {c.batchId ?? '—'}
                      </span>
                    </td>
                    <td className="tabular hidden !text-end sm:table-cell">{n(c.activationCount)}</td>
                    <td>
                      <ActionMenu
                        label={t('chips.more')}
                        items={[
                          c.status === 'BLOCKED'
                            ? { key: 'unblock', label: t('chips.unblock'), icon: 'check', onSelect: () => setChipStatus(c, 'AVAILABLE') }
                            : { key: 'block', label: t('chips.block'), icon: 'lock', onSelect: () => setChipStatus(c, 'BLOCKED') },
                          ...(c.status !== 'CLAIMED' ? [{ key: 'delete', label: t('chips.delete'), icon: 'trash', danger: true, separated: true, onSelect: () => setRemoving(c) }] : []),
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AddChips
        open={adding}
        orgs={orgs}
        onClose={() => setAdding(false)}
        onAdded={() => load().catch(() => {})}
      />
      <AssignBatch
        open={assigning}
        orgs={orgs}
        onClose={() => setAssigning(false)}
        onDone={(text) => {
          setAssigning(false);
          setNotice({ tone: 'success', text });
          load().catch(() => {});
        }}
      />
      <ConfirmDialog
        open={!!removing}
        title={t('chips.deleteTitle', { uid: removing?.uid ?? '' })}
        body={t('chips.deleteBody')}
        confirmLabel={t('chips.delete')}
        busyLabel={t('chips.deleting')}
        cancelLabel={t('cancel')}
        danger
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          await authFetch(`/admin/nfc-chips/${removing!.id}`, { method: 'DELETE' });
          setRemoving(null);
          await load();
        }}
      />
    </div>
  );
}

/** What a batch is and who bought it, shared by both ways of adding chips. */
function StockFields({
  orgs,
  type,
  setType,
  batch,
  setBatch,
  buyer,
  setBuyer,
}: {
  orgs: AdminOrg[];
  type: string;
  setType: (v: string) => void;
  batch: string;
  setBatch: (v: string) => void;
  buyer: string;
  setBuyer: (v: string) => void;
}) {
  const { t } = useTranslation('admin');
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('chips.type')} htmlFor="chip-type">
        <select id="chip-type" value={type} onChange={(e) => setType(e.target.value)} className="v-field w-full">
          {TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {t(`nfc:hardwareType.${ty.toLowerCase()}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('chips.batchLabel')} htmlFor="chip-batch">
        <input id="chip-batch" dir="ltr" value={batch} onChange={(e) => setBatch(e.target.value)} placeholder={t('chips.batchPlaceholder')} className="v-field w-full font-mono text-sm rtl:text-right" />
      </Field>
      <div className="sm:col-span-2">
        <Field label={t('chips.soldTo')} htmlFor="chip-buyer" hint={t('chips.soldToHint')}>
          <select id="chip-buyer" value={buyer} onChange={(e) => setBuyer(e.target.value)} className="v-field w-full">
            <option value="">{t('chips.openStock')}</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}

function AddChips({ open, orgs, onClose, onAdded }: { open: boolean; orgs: AdminOrg[]; onClose: () => void; onAdded: () => void }) {
  const { t } = useTranslation('admin');
  const [how, setHow] = useState<'tap' | 'list'>('tap');
  const [type, setType] = useState('CARD');
  const [batch, setBatch] = useState('');
  const [buyer, setBuyer] = useState('');
  const [list, setList] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [results, setResults] = useState<ScanResult[]>([]);

  // The tap handler must see the current type, batch and buyer without the
  // scan restarting between taps.
  const settings = useRef({ type, batch, buyer });
  settings.current = { type, batch, buyer };

  const registerTapped = useCallback(
    async (uid: string) => {
      try {
        const res = await authFetch<{ alreadyRegistered: boolean }>('/admin/nfc-chips', {
          method: 'POST',
          body: JSON.stringify({ uid, hardwareType: settings.current.type, batchId: settings.current.batch.trim() || undefined, allocatedToOrgId: settings.current.buyer || null }),
        });
        setResults((prev) => [{ uid, state: res.alreadyRegistered ? 'duplicate' : 'registered' }, ...prev]);
        if (!res.alreadyRegistered) onAdded();
      } catch (e) {
        setResults((prev) => [{ uid, state: 'error', message: (e as Error).message }, ...prev]);
      }
    },
    [onAdded],
  );

  const scanner = useNfcScanner((serial) => void registerTapped(serial));

  useEffect(() => {
    if (!open) {
      scanner.stop();
      return;
    }
    setMsg(null);
    setResults([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (scanner.error === 'read') setMsg({ tone: 'danger', text: t('chips.readError') });
    else if (scanner.error) setMsg({ tone: 'danger', text: scanner.error });
  }, [scanner.error, t]);

  async function registerList() {
    const uids = list.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!uids.length) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await authFetch<{ created: number; skipped: number }>('/admin/nfc-chips/batch', {
        method: 'POST',
        body: JSON.stringify({ uids, hardwareType: type, batchId: batch.trim() || undefined, allocatedToOrgId: buyer || null }),
      });
      setList('');
      setMsg({ tone: 'success', text: t('chips.bulkDone', { created: res.created, skipped: res.skipped }) });
      onAdded();
    } catch (e) {
      setMsg({ tone: 'danger', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} closeLabel={t('close')} title={t('chips.add')}>
      <div className="space-y-5">
        <StockFields orgs={orgs} type={type} setType={setType} batch={batch} setBatch={setBatch} buyer={buyer} setBuyer={setBuyer} />

        <div role="radiogroup" className="grid grid-cols-2 rounded-lg bg-elevated p-0.5 ring-1 ring-inset ring-line">
          {(['tap', 'list'] as const).map((h) => (
            <button
              key={h}
              type="button"
              role="radio"
              aria-checked={how === h}
              onClick={() => setHow(h)}
              className={`h-9 rounded-md text-sm font-medium sm:h-8 ${how === h ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'}`}
            >
              {h === 'tap' ? t('chips.byTapping') : t('chips.byList')}
            </button>
          ))}
        </div>

        {msg && (
          <Notice tone={msg.tone} onDismiss={() => setMsg(null)}>
            {msg.text}
          </Notice>
        )}

        {how === 'tap' ? (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-muted">{t('chips.tapHint')}</p>
            {scanner.blocker !== 'none' ? (
              <p className="rounded-lg bg-amber-500/[0.07] px-4 py-3 text-sm leading-relaxed text-amber-800 ring-1 ring-inset ring-amber-500/20 dark:text-amber-300">
                {scanner.blocker === 'insecure' ? t('chips.insecure') : t('chips.unsupported')}
              </p>
            ) : scanner.scanning ? (
              <div className="flex items-center justify-between gap-3 rounded-lg px-4 py-3 ring-1 ring-inset ring-accent/40">
                <span className="flex items-center gap-2 text-sm font-medium text-accent">
                  <Icon name="loader" size={15} className="animate-spin" /> {t('chips.holdChip')}
                </span>
                <button onClick={scanner.stop} className="v-btn v-btn-ghost">
                  {t('chips.stop')}
                </button>
              </div>
            ) : (
              <button onClick={scanner.start} className="v-btn w-full">
                {t('chips.start')}
              </button>
            )}
            {results.length > 0 && (
              <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-lg ring-1 ring-inset ring-line">
                {results.map((r, i) => (
                  <li key={`${r.uid}-${i}`} className="flex items-center gap-2.5 px-3 py-2 text-xs">
                    <Icon
                      name={r.state === 'registered' ? 'check' : r.state === 'duplicate' ? 'tag' : 'x'}
                      size={14}
                      className={r.state === 'registered' ? 'text-emerald-600' : r.state === 'duplicate' ? 'text-muted' : 'text-red-600'}
                    />
                    <span dir="ltr" className="min-w-0 flex-1 truncate font-mono text-ink rtl:text-right">
                      {r.uid}
                    </span>
                    <span className="shrink-0 text-muted">{r.state === 'error' ? r.message : t(`chips.result.${r.state}`)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-muted">{t('chips.bulkHint')}</p>
            <textarea
              value={list}
              onChange={(e) => setList(e.target.value)}
              rows={8}
              dir="ltr"
              spellCheck={false}
              placeholder={'04:DE:5F:AA:BB:CC:11\n04:DE:5F:AA:BB:CC:12'}
              aria-label={t('chips.byList')}
              className="v-field w-full py-3 font-mono text-xs"
            />
            <button onClick={registerList} disabled={busy || !list.trim()} className="v-btn w-full disabled:opacity-50">
              {busy ? t('saving') : t('chips.bulkSubmit')}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function AssignBatch({ open, orgs, onClose, onDone }: { open: boolean; orgs: AdminOrg[]; onClose: () => void; onDone: (text: string) => void }) {
  const { t } = useTranslation('admin');
  const [batch, setBatch] = useState('');
  const [buyer, setBuyer] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setBatch('');
    setBuyer('');
    setErr('');
    setBusy(false);
  }, [open]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!batch.trim()) return;
    setBusy(true);
    setErr('');
    try {
      const res = await authFetch<{ allocated: number }>('/admin/nfc-chips/allocate', { method: 'POST', body: JSON.stringify({ batchId: batch.trim(), orgId: buyer || null }) });
      onDone(t('chips.allocateDone', { count: res.allocated }));
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
      title={t('chips.allocateTitle')}
      footer={
        <div className="flex items-center justify-end gap-2">
          {err && <p className="me-auto text-xs text-red-600 dark:text-red-400">{err}</p>}
          <button type="button" onClick={onClose} className="v-btn v-btn-ghost">
            {t('cancel')}
          </button>
          <button type="submit" form="assign-batch" disabled={busy || !batch.trim()} className="v-btn disabled:opacity-50">
            {busy ? t('saving') : t('chips.allocateSubmit')}
          </button>
        </div>
      }
    >
      <form id="assign-batch" onSubmit={save} className="space-y-5">
        <p className="text-sm leading-relaxed text-muted">{t('chips.allocateHint')}</p>
        <Field label={t('chips.batchLabel')} htmlFor="assign-batch-id">
          <input id="assign-batch-id" dir="ltr" value={batch} onChange={(e) => setBatch(e.target.value)} placeholder={t('chips.batchPlaceholder')} className="v-field w-full font-mono text-sm rtl:text-right" />
        </Field>
        <Field label={t('chips.soldTo')} htmlFor="assign-buyer" hint={t('chips.soldToHint')}>
          <select id="assign-buyer" value={buyer} onChange={(e) => setBuyer(e.target.value)} className="v-field w-full">
            <option value="">{t('chips.openStock')}</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
      </form>
    </Sheet>
  );
}
