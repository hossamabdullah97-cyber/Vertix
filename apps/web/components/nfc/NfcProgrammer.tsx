'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch, type NfcTag } from '@/lib/client';
import { API_URL } from '@/lib/api';
import { Icon } from '@/components/Icon';

type Phase = 'idle' | 'waiting' | 'writing' | 'linking' | 'done' | 'error';

/** Why the browser cannot program a tag, when it cannot. */
type Blocker = 'none' | 'unsupported' | 'insecure';

function detectBlocker(): Blocker {
  if (typeof window === 'undefined') return 'none';
  // Web NFC needs a secure context; localhost counts as one.
  if (!window.isSecureContext) return 'insecure';
  if (!('NDEFReader' in window)) return 'unsupported';
  return 'none';
}

/**
 * Programs a physical NFC tag from the browser in one gesture: the tag's own
 * serial number becomes its gateway URL, that URL is written to the chip, and
 * the tag is registered and bound to this card.
 *
 * The chip stores the gateway URL rather than the card's public link, so the
 * card a tag points at can be changed later without re-writing the chip.
 *
 * Chromium on Android only. iOS gives NFC to native apps exclusively, so there
 * the tag has to be programmed by the mobile app or pre-encoded by the supplier.
 */
export default function NfcProgrammer({
  cardId,
  onProgrammed,
}: {
  cardId: string;
  /** Fired after a tag is written and bound, so the parent can refresh. */
  onProgrammed?: () => void;
}) {
  const { t } = useTranslation('cardEditor');
  const [blocker, setBlocker] = useState<Blocker>('none');
  const [phase, setPhase] = useState<Phase>('idle');
  const [uid, setUid] = useState('');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Feature detection has to run on the client; the server has no navigator.
  useEffect(() => {
    setBlocker(detectBlocker());
    return () => abortRef.current?.abort();
  }, []);

  /** Registers the tag if it is new, then binds it to this card. */
  const linkTag = useCallback(
    async (serial: string) => {
      let tag: NfcTag | undefined;
      try {
        tag = await authFetch<NfcTag>('/nfc/tags', {
          method: 'POST',
          body: JSON.stringify({ uid: serial, hardwareType: 'CARD' }),
        });
      } catch {
        // Already in this org's inventory — reuse it instead of failing.
        const all = await authFetch<NfcTag[]>('/nfc/tags');
        tag = all.find((x) => x.uid === serial);
      }
      if (!tag) throw new Error(t('nfcProgram.errors.register'));

      await authFetch(`/nfc/tags/${tag.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ cardId }),
      });
    },
    [cardId, t],
  );

  const program = useCallback(async () => {
    setError('');
    setUid('');
    setPhase('waiting');

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    try {
      const reader = new NDEFReader();
      await reader.scan({ signal: controller.signal });

      const serial = await new Promise<string>((resolve, reject) => {
        reader.addEventListener(
          'reading',
          (event) => resolve(event.serialNumber),
          { once: true },
        );
        reader.addEventListener(
          'readingerror',
          () => reject(new Error(t('nfcProgram.errors.read'))),
          { once: true },
        );
        controller.signal.addEventListener('abort', () =>
          reject(new Error(t('nfcProgram.errors.cancelled'))),
        );
      });

      setUid(serial);
      setPhase('writing');

      // The tag is still in the field right after a read, so this lands on the
      // same chip the serial came from.
      await reader.write(
        { records: [{ recordType: 'url', data: `${API_URL}/t/${serial}` }] },
        { overwrite: true, signal: controller.signal },
      );

      setPhase('linking');
      await linkTag(serial);

      setPhase('done');
      onProgrammed?.();
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
    } finally {
      controller.abort();
    }
  }, [linkTag, onProgrammed, t]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setPhase('idle');
  }, []);

  /* ---------- unsupported browsers ---------- */
  if (blocker !== 'none') {
    return (
      <div className="rounded-2xl border border-line bg-canvas/30 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
            <Icon name="tag" size={16} />
          </span>
          <div>
            <h4 className="text-[13.5px] font-extrabold text-ink">{t('nfcProgram.title')}</h4>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              {blocker === 'insecure' ? t('nfcProgram.insecure') : t('nfcProgram.unsupported')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const busy = phase === 'waiting' || phase === 'writing' || phase === 'linking';

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
            phase === 'done'
              ? 'bg-emerald-500/10 text-emerald-500'
              : phase === 'error'
                ? 'bg-red-500/10 text-red-500'
                : 'bg-accent-soft text-accent'
          }`}
        >
          <Icon name={phase === 'done' ? 'check' : 'tag'} size={16} />
        </span>

        <div className="min-w-0 flex-1">
          <h4 className="text-[13.5px] font-extrabold text-ink">{t('nfcProgram.title')}</h4>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            {phase === 'idle' && t('nfcProgram.idle')}
            {phase === 'waiting' && t('nfcProgram.waiting')}
            {phase === 'writing' && t('nfcProgram.writing')}
            {phase === 'linking' && t('nfcProgram.linking')}
            {phase === 'done' && t('nfcProgram.done')}
            {phase === 'error' && error}
          </p>

          {uid && phase !== 'error' && (
            <p dir="ltr" className="mt-2 font-mono text-[11px] text-faint">
              {uid}
            </p>
          )}

          <div className="mt-4 flex items-center gap-2">
            {busy ? (
              <>
                <span className="flex items-center gap-2 text-[12.5px] font-bold text-accent">
                  <Icon name="loader" size={14} className="animate-spin" />
                  {phase === 'waiting' ? t('nfcProgram.holdTag') : t('nfcProgram.keepHolding')}
                </span>
                <button
                  onClick={cancel}
                  className="ms-auto text-[12px] font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
                >
                  {t('nfcProgram.cancel')}
                </button>
              </>
            ) : (
              <button onClick={program} className="v-btn !h-10 px-5 text-[13px] font-bold">
                {phase === 'done' || phase === 'error'
                  ? t('nfcProgram.again')
                  : t('nfcProgram.start')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
