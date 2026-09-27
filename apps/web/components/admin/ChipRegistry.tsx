'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/client';
import { Icon } from '@/components/Icon';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Select,
} from '@/design-system';

export interface Chip {
  id: string;
  uid: string;
  hardwareType: string;
  batchId: string | null;
  status: 'AVAILABLE' | 'CLAIMED' | 'BLOCKED';
  note: string | null;
  orgName: string | null;
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
}

type HardwareType = 'CARD' | 'STICKER' | 'KEYCHAIN' | 'WRISTBAND';

/** Why the browser cannot read a chip, when it cannot. */
type Blocker = 'none' | 'unsupported' | 'insecure';

function detectBlocker(): Blocker {
  if (typeof window === 'undefined') return 'none';
  if (!window.isSecureContext) return 'insecure';
  if (!('NDEFReader' in window)) return 'unsupported';
  return 'none';
}

/** One tap's outcome, kept so a whole box of chips can be worked through. */
interface ScanResult {
  uid: string;
  state: 'registered' | 'duplicate' | 'error';
  message?: string;
}

const STATUS_STYLE: Record<Chip['status'], string> = {
  AVAILABLE: 'text-emerald-500',
  CLAIMED: 'text-blue-500',
  BLOCKED: 'text-red-500',
};

/**
 * The platform's chip registry — the super-admin's own inventory of physical
 * hardware.
 *
 * Only a UID listed here can be bound by a workspace, so this screen is what
 * decides which physical chips work with the product at all. Registration is a
 * tap: the admin holds each chip to the phone and its serial is recorded.
 *
 * Reading is deliberately all this does to the chip — the customer's own editor
 * writes the profile URL when they claim it, so stock can be registered before
 * anyone knows which card it will carry.
 */
export default function ChipRegistry() {
  const { t } = useTranslation('admin');

  const [chips, setChips] = useState<Chip[]>([]);
  const [stats, setStats] = useState<ChipStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const [hardwareType, setHardwareType] = useState<HardwareType>('CARD');
  const [batchId, setBatchId] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const [blocker, setBlocker] = useState<Blocker>('none');
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // The tap handler must see the current type/batch without restarting the scan.
  const settings = useRef({ hardwareType, batchId });
  settings.current = { hardwareType, batchId };

  const load = useCallback(async () => {
    const query = new URLSearchParams();
    if (statusFilter !== 'ALL') query.set('status', statusFilter);
    if (search.trim()) query.set('search', search.trim());
    const [list, counts] = await Promise.all([
      authFetch<Chip[]>(`/admin/nfc-chips?${query.toString()}`),
      authFetch<ChipStats>('/admin/nfc-chips/stats'),
    ]);
    setChips(list);
    setStats(counts);
    setLoading(false);
  }, [statusFilter, search]);

  useEffect(() => {
    setBlocker(detectBlocker());
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    // Debounced so typing in the search box does not fire a request per letter.
    const id = setTimeout(() => {
      load().catch((e) => setNotice((e as Error).message));
    }, 250);
    return () => clearTimeout(id);
  }, [load]);

  /** Records one tapped chip, then leaves the reader running for the next one. */
  const registerTapped = useCallback(
    async (uid: string) => {
      try {
        const res = await authFetch<{ alreadyRegistered: boolean }>('/admin/nfc-chips', {
          method: 'POST',
          body: JSON.stringify({
            uid,
            hardwareType: settings.current.hardwareType,
            batchId: settings.current.batchId.trim() || undefined,
          }),
        });
        setResults((prev) => [
          { uid, state: res.alreadyRegistered ? 'duplicate' : 'registered' },
          ...prev,
        ]);
        if (!res.alreadyRegistered) load().catch(() => {});
      } catch (e) {
        setResults((prev) => [
          { uid, state: 'error', message: (e as Error).message },
          ...prev,
        ]);
      }
    },
    [load],
  );

  const startScanning = useCallback(async () => {
    setNotice('');
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    try {
      const reader = new NDEFReader();
      // No `once` listener here: the scan stays open so a stack of chips can be
      // registered one tap after another without pressing the button again.
      reader.addEventListener('reading', (event) => {
        void registerTapped(event.serialNumber);
      });
      reader.addEventListener('readingerror', () => {
        setNotice(t('chips.readError'));
      });
      await reader.scan({ signal: controller.signal });
      setScanning(true);
    } catch (e) {
      setNotice((e as Error).message);
      setScanning(false);
    }
  }, [registerTapped, t]);

  const stopScanning = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setScanning(false);
  }, []);

  const registerBulk = useCallback(async () => {
    const uids = bulkText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (uids.length === 0) return;

    setBusy(true);
    setNotice('');
    try {
      const res = await authFetch<{ requested: number; created: number; skipped: number }>(
        '/admin/nfc-chips/batch',
        {
          method: 'POST',
          body: JSON.stringify({
            uids,
            hardwareType,
            batchId: batchId.trim() || undefined,
          }),
        },
      );
      setBulkText('');
      setNotice(t('chips.bulkDone', { created: res.created, skipped: res.skipped }));
      await load();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [bulkText, hardwareType, batchId, load, t]);

  const setStatus = useCallback(
    async (chip: Chip, status: Chip['status']) => {
      setBusy(true);
      try {
        await authFetch(`/admin/nfc-chips/${chip.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        });
        await load();
      } catch (e) {
        setNotice((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const remove = useCallback(
    async (chip: Chip) => {
      if (!window.confirm(t('chips.confirmDelete', { uid: chip.uid }))) return;
      setBusy(true);
      try {
        await authFetch(`/admin/nfc-chips/${chip.id}`, { method: 'DELETE' });
        await load();
      } catch (e) {
        setNotice((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [load, t],
  );

  return (
    <div className="space-y-6">
      {/* Counts: how much stock exists, and how much of it is actually out. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ['total', stats?.total, 'text-ink'],
            ['available', stats?.available, 'text-emerald-500'],
            ['claimed', stats?.claimed, 'text-blue-500'],
            ['blocked', stats?.blocked, 'text-red-500'],
          ] as const
        ).map(([key, value, tone]) => (
          <div key={key} className="min-w-0 rounded-xl border border-line bg-surface p-4">
            <span className="block text-[10.5px] font-extrabold uppercase tracking-wider text-muted">
              {t(`chips.stats.${key}`)}
            </span>
            <span className={`mt-1 block text-[24px] font-extrabold leading-none ${tone}`}>
              {value ?? '—'}
            </span>
          </div>
        ))}
      </div>

      {notice && (
        <div className="rounded-xl border border-line bg-canvas/40 px-4 py-3 text-[12.5px] text-ink">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Tap to register */}
        <Card className="lg:col-span-1">
          <CardHeader className="border-b border-line px-6 py-4">
            <span className="text-[13.5px] font-extrabold text-ink">{t('chips.tapTitle')}</span>
          </CardHeader>
          <CardBody className="space-y-4 p-6">
            <p className="text-[12.5px] leading-relaxed text-muted">{t('chips.tapHint')}</p>

            <div>
              <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-muted">
                {t('nfc.hardwareType')}
              </label>
              <Select
                value={hardwareType}
                onChange={(e) => setHardwareType(e.target.value as HardwareType)}
                className="w-full"
              >
                <option value="CARD">{t('nfc.card')}</option>
                <option value="STICKER">{t('nfc.sticker')}</option>
                <option value="KEYCHAIN">{t('nfc.keychain')}</option>
                <option value="WRISTBAND">{t('nfc.wristband')}</option>
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-muted">
                {t('chips.batchLabel')}
              </label>
              <Input
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                placeholder={t('chips.batchPlaceholder')}
                className="w-full"
              />
            </div>

            {blocker !== 'none' ? (
              <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-[12.5px] leading-relaxed text-amber-600">
                {blocker === 'insecure' ? t('chips.insecure') : t('chips.unsupported')}
              </p>
            ) : scanning ? (
              <div className="space-y-3">
                <span className="flex items-center gap-2 text-[12.5px] font-bold text-accent">
                  <Icon name="loader" size={14} className="animate-spin" />
                  {t('chips.holdChip')}
                </span>
                <Button variant="outline" className="w-full" onClick={stopScanning}>
                  {t('chips.stop')}
                </Button>
              </div>
            ) : (
              <Button variant="primary" className="w-full" onClick={startScanning}>
                {t('chips.start')}
              </Button>
            )}

            {results.length > 0 && (
              <div className="max-h-52 space-y-1.5 overflow-y-auto border-t border-line pt-3">
                {results.map((r, i) => (
                  <div key={`${r.uid}-${i}`} className="flex items-start gap-2 text-[11.5px]">
                    <Icon
                      name={r.state === 'registered' ? 'check' : r.state === 'duplicate' ? 'tag' : 'x'}
                      size={13}
                      className={
                        r.state === 'registered'
                          ? 'mt-0.5 shrink-0 text-emerald-500'
                          : r.state === 'duplicate'
                            ? 'mt-0.5 shrink-0 text-muted'
                            : 'mt-0.5 shrink-0 text-red-500'
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span dir="ltr" className="font-mono text-ink">
                        {r.uid}
                      </span>
                      <span className="ms-2 text-muted">
                        {r.state === 'error' ? r.message : t(`chips.result.${r.state}`)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Bulk registration, for UID lists that come from the supplier */}
        <Card className="lg:col-span-2">
          <CardHeader className="border-b border-line px-6 py-4">
            <span className="text-[13.5px] font-extrabold text-ink">{t('chips.bulkTitle')}</span>
          </CardHeader>
          <CardBody className="space-y-4 p-6">
            <p className="text-[12.5px] leading-relaxed text-muted">{t('chips.bulkHint')}</p>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={6}
              dir="ltr"
              placeholder="04:DE:5F:AA:BB:CC:11&#10;04:DE:5F:AA:BB:CC:12"
              className="w-full rounded-xl border border-line bg-canvas p-3.5 font-mono text-[12.5px] focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <Button
              variant="primary"
              className="w-full sm:w-auto"
              onClick={registerBulk}
              disabled={busy || !bulkText.trim()}
            >
              {t('chips.bulkSubmit')}
            </Button>
          </CardBody>
        </Card>
      </div>

      {/* The registry itself */}
      <Card>
        <CardHeader className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-4">
          <span className="text-[13.5px] font-extrabold text-ink">{t('chips.listTitle')}</span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('chips.searchPlaceholder')}
              className="w-full sm:w-52"
            />
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-40"
            >
              <option value="ALL">{t('chips.filter.all')}</option>
              <option value="AVAILABLE">{t('chips.status.AVAILABLE')}</option>
              <option value="CLAIMED">{t('chips.status.CLAIMED')}</option>
              <option value="BLOCKED">{t('chips.status.BLOCKED')}</option>
            </Select>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {loading ? (
            <p className="p-6 text-[12.5px] text-muted">{t('common.loading')}</p>
          ) : chips.length === 0 ? (
            <p className="p-6 text-[12.5px] text-muted">{t('chips.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-start text-[12px]">
                <thead>
                  <tr className="border-b border-line bg-surface/50 text-[10px] font-extrabold uppercase tracking-wider text-muted">
                    <th className="p-3 text-start">UID</th>
                    <th className="p-3 text-start">{t('nfc.deviceModel')}</th>
                    <th className="p-3 text-start">{t('common.status')}</th>
                    <th className="p-3 text-start">{t('chips.workspace')}</th>
                    <th className="p-3 text-start">{t('chips.batchLabel')}</th>
                    <th className="p-3 text-start">{t('nfc.scans')}</th>
                    <th className="p-3 text-end">{t('users.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {chips.map((chip) => (
                    <tr key={chip.id} className="border-b border-line hover:bg-surface/30">
                      <td className="p-3 font-mono text-ink" dir="ltr">
                        {chip.uid}
                      </td>
                      <td className="p-3">
                        <Badge variant="neutral" className="text-[9px]">
                          {chip.hardwareType}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-bold ${STATUS_STYLE[chip.status]}`}
                        >
                          ● {t(`chips.status.${chip.status}`)}
                        </span>
                      </td>
                      <td className="p-3 text-muted">{chip.orgName ?? '—'}</td>
                      <td className="p-3 text-muted" dir="ltr">
                        {chip.batchId ?? '—'}
                      </td>
                      <td className="p-3 font-bold text-ink">{chip.activationCount}</td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-2">
                          {chip.status === 'BLOCKED' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-11 px-3 text-[11px] sm:min-h-0"
                              disabled={busy}
                              onClick={() => setStatus(chip, 'AVAILABLE')}
                            >
                              {t('chips.unblock')}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-11 px-3 text-[11px] sm:min-h-0"
                              disabled={busy}
                              onClick={() => setStatus(chip, 'BLOCKED')}
                            >
                              {t('chips.block')}
                            </Button>
                          )}
                          {/* A claimed chip has a customer's tag behind it, so
                              the server refuses the delete — don't offer it. */}
                          {!chip.orgName && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-11 px-3 text-[11px] text-red-500 sm:min-h-0"
                              disabled={busy}
                              onClick={() => remove(chip)}
                            >
                              {t('chips.delete')}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
