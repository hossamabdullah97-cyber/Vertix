'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch, type NfcTag } from '@/lib/client';
import { normalizeUid } from '@vertex/shared';
import { HAS_TAP_DOMAIN, tapUrl } from '@/lib/tap';
import { Icon } from '@/components/Icon';

type Phase = 'idle' | 'waiting' | 'writing' | 'linking' | 'verifying' | 'locking' | 'done' | 'error';
/** How the last run ended: checked by reading the chip back, and locked too, or not checked. */
type Outcome = 'verified' | 'locked' | 'unchecked';

const sameUrl = (a: string, b: string) => a.replace(/\/+$/, '').toLowerCase() === b.replace(/\/+$/, '').toLowerCase();

/** The URL a tag carries, if its message has one. */
function urlOf(message: NDEFMessage): string | null {
  for (const r of message.records) {
    if ((r.recordType === 'url' || r.recordType === 'absolute-url') && r.data) {
      return new TextDecoder(r.encoding || 'utf-8').decode(r.data);
    }
  }
  return null;
}

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
 * Then, as the apps that program tags for a living do, it asks for a second
 * tap and reads the chip back: a tag lifted mid-write can be left empty or
 * half-written, and nobody would know until a client tapped it. On that tap
 * it can also lock the chip for good, so nobody (its holder included) can
 * write another link over it; harmless here because the URL never needs to
 * change, once it is on a domain that will not change (lib/tap.ts).
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
  const [outcome, setOutcome] = useState<Outcome>('verified');
  const [canLock, setCanLock] = useState(false);
  const [lock, setLock] = useState(HAS_TAP_DOMAIN);
  const abortRef = useRef<AbortController | null>(null);
  const skipRef = useRef<(() => void) | null>(null);

  // Feature detection has to run on the client; the server has no navigator.
  useEffect(() => {
    const b = detectBlocker();
    setBlocker(b);
    setCanLock(b === 'none' && typeof NDEFReader.prototype.makeReadOnly === 'function');
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
      } catch (err) {
        // Already in this org's inventory — reuse it instead of failing.
        const all = await authFetch<NfcTag[]>('/nfc/tags');
        // Stored in its normal form; Web NFC reports it in lower case.
        tag = all.find((x) => x.uid === normalizeUid(serial));
        // Otherwise the registration itself was refused — most often because
        // this chip was not issued by the platform. Surfacing the server's
        // reason matters here; a generic failure would leave the holder of an
        // unrecognised chip with no idea why it will not work.
        if (!tag) throw err;
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

    /** The next tag brought to the phone; "skip" resolves it with null. */
    const nextTag = (reader: NDEFReader) =>
      new Promise<NDEFReadingEvent | null>((resolve, reject) => {
        const onReading = (event: NDEFReadingEvent) => {
          cleanup();
          resolve(event);
        };
        const onError = () => {
          cleanup();
          reject(new Error(t('nfcProgram.errors.read')));
        };
        const onAbort = () => {
          cleanup();
          reject(new Error(t('nfcProgram.errors.cancelled')));
        };
        const cleanup = () => {
          reader.removeEventListener('reading', onReading as EventListener);
          reader.removeEventListener('readingerror', onError);
          controller.signal.removeEventListener('abort', onAbort);
          skipRef.current = null;
        };
        reader.addEventListener('reading', onReading);
        reader.addEventListener('readingerror', onError);
        controller.signal.addEventListener('abort', onAbort);
        skipRef.current = () => {
          cleanup();
          resolve(null);
        };
      });

    try {
      const reader = new NDEFReader();
      await reader.scan({ signal: controller.signal });

      const first = await nextTag(reader);
      if (!first) return;
      const serial = first.serialNumber;
      const url = tapUrl(serial);

      setUid(normalizeUid(serial));
      setPhase('writing');

      // The tag is still in the field right after a read, so this lands on the
      // same chip the serial came from.
      await reader.write({ records: [{ recordType: 'url', data: url }] }, { overwrite: true, signal: controller.signal });

      // Linked before the check, so lifting the phone away at this point
      // still leaves a working, registered chip.
      setPhase('linking');
      await linkTag(serial);
      onProgrammed?.();

      setPhase('verifying');
      const again = await nextTag(reader);
      if (!again) {
        setOutcome('unchecked');
        setPhase('done');
        return;
      }
      if (again.serialNumber !== serial) throw new Error(t('nfcProgram.errors.otherTag'));
      const onChip = urlOf(again.message);
      if (!onChip || !sameUrl(onChip, url)) throw new Error(t('nfcProgram.errors.verify'));

      if (lock && canLock && reader.makeReadOnly) {
        setPhase('locking');
        // The tag is in the field again for the reading just received.
        await reader.makeReadOnly({ signal: controller.signal });
        setOutcome('locked');
      } else {
        setOutcome('verified');
      }
      setPhase('done');
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
    } finally {
      skipRef.current = null;
      controller.abort();
    }
  }, [linkTag, onProgrammed, t, lock, canLock]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setPhase('idle');
  }, []);

  /* ---------- unsupported browsers ---------- */
  if (blocker !== 'none') {
    return (
      <div className="rounded-xl bg-elevated/60 p-4 ring-1 ring-inset ring-line">
        <div className="flex items-start gap-3">
          <span className="v-icon-tile">
            <Icon name="tag" size={15} />
          </span>
          <div>
            <h4 className="text-sm font-semibold text-ink">{t('nfcProgram.title')}</h4>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {blocker === 'insecure' ? t('nfcProgram.insecure') : t('nfcProgram.unsupported')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const busy = phase === 'waiting' || phase === 'writing' || phase === 'linking' || phase === 'verifying' || phase === 'locking';

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
          <h4 className="text-sm font-semibold text-ink">{t('nfcProgram.title')}</h4>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {phase === 'idle' && t('nfcProgram.idle')}
            {phase === 'waiting' && t('nfcProgram.waiting')}
            {phase === 'writing' && t('nfcProgram.writing')}
            {phase === 'linking' && t('nfcProgram.linking')}
            {phase === 'verifying' && t('nfcProgram.verifying')}
            {phase === 'locking' && t('nfcProgram.locking')}
            {phase === 'done' && t(`nfcProgram.done_${outcome}`)}
            {phase === 'error' && error}
          </p>

          {uid && phase !== 'error' && (
            <p dir="ltr" className="mt-2 font-mono text-2xs text-faint">
              {uid}
            </p>
          )}

          {canLock && !busy && (
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-muted">
              <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--v-accent)]" />
              <span>
                <span className="font-semibold text-ink">{t('nfcProgram.lock')}</span> {t('nfcProgram.lockHint')}
              </span>
            </label>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {busy ? (
              <>
                <span className="flex items-center gap-2 text-xs font-semibold text-accent">
                  <Icon name="loader" size={14} className="animate-spin" />
                  {phase === 'waiting' ? t('nfcProgram.holdTag') : phase === 'verifying' ? t('nfcProgram.tapAgain') : t('nfcProgram.keepHolding')}
                </span>
                {phase === 'verifying' ? (
                  <button
                    onClick={() => skipRef.current?.()}
                    className="v-hit ms-auto text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
                  >
                    {t('nfcProgram.skipCheck')}
                  </button>
                ) : (
                  <button
                    onClick={cancel}
                    className="v-hit ms-auto text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
                  >
                    {t('nfcProgram.cancel')}
                  </button>
                )}
              </>
            ) : (
              <button onClick={program} className="v-btn !h-10 px-5 text-sm font-semibold">
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
