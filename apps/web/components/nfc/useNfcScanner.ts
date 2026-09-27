'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Why the browser cannot read a chip, when it cannot. */
export type NfcBlocker = 'none' | 'unsupported' | 'insecure';

export function detectNfcBlocker(): NfcBlocker {
  if (typeof window === 'undefined') return 'none';
  // Web NFC needs a secure context; localhost counts as one.
  if (!window.isSecureContext) return 'insecure';
  if (!('NDEFReader' in window)) return 'unsupported';
  return 'none';
}

/**
 * Reads chip serials from the browser, one tap after another.
 *
 * The scan is left open rather than resolved on the first read, because both
 * places that register hardware work through a stack of chips: the platform
 * admin taking in a shipment, and a workspace taking in what it bought. Closing
 * after each one would mean a button press per chip.
 *
 * Chromium on Android only. iOS gives NFC to native apps exclusively, so there
 * the UID has to be typed in — every caller keeps a manual path for that.
 */
export function useNfcScanner(onSerial: (serial: string) => void) {
  const [blocker, setBlocker] = useState<NfcBlocker>('none');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // The handler is held in a ref so a caller can close over changing state
  // without the scan being torn down and restarted between taps.
  const handler = useRef(onSerial);
  handler.current = onSerial;

  // Feature detection has to run on the client; the server has no navigator.
  useEffect(() => {
    setBlocker(detectNfcBlocker());
    return () => abortRef.current?.abort();
  }, []);

  const start = useCallback(async () => {
    setError('');
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    try {
      const reader = new NDEFReader();
      reader.addEventListener('reading', (event) => {
        handler.current(event.serialNumber);
      });
      reader.addEventListener('readingerror', () => {
        setError('read');
      });
      await reader.scan({ signal: controller.signal });
      setScanning(true);
    } catch (e) {
      setError((e as Error).message);
      setScanning(false);
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setScanning(false);
  }, []);

  return { blocker, scanning, error, start, stop };
}
