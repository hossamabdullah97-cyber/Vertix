import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { secrets } from './storage';

/**
 * Locking the app with the phone's Face ID, Touch ID or fingerprint: a phone
 * left on a table at a fair does not open the leads to whoever picks it up.
 * On when the person turns it on (More); asked when the app opens, and when it
 * comes back after a minute away.
 */

const KEY = 'vertex_lock';
/** Away for less than this (a quick look at WhatsApp) does not lock. */
export const LOCK_AFTER_MS = 60_000;

/** Whether coming back to the app should ask again. */
export function shouldLock(enabled: boolean, awaySince: number | null, now = Date.now()): boolean {
  return enabled && awaySince !== null && now - awaySince >= LOCK_AFTER_MS;
}

/** Whether this phone can lock the app: a sensor, with a face or finger enrolled. */
export async function lockAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
}

export async function lockEnabled(): Promise<boolean> {
  return (await secrets.get(KEY)) === '1';
}

/** Turns it on only after the person has unlocked once, so nobody locks themselves out. */
export async function setLockEnabled(on: boolean, prompt: string): Promise<boolean> {
  if (on && !(await unlock(prompt))) return false;
  await secrets.set(KEY, on ? '1' : null);
  return true;
}

export async function unlock(prompt: string): Promise<boolean> {
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: prompt });
  return r.success;
}

/** Whether the app is locked now, for a signed-in person who turned the lock on. */
export function useAppLock(signedIn: boolean) {
  const [locked, setLocked] = useState(false);
  const enabled = useRef(false);
  const awaySince = useRef<number | null>(null);

  useEffect(() => {
    if (!signedIn) {
      setLocked(false);
      return;
    }
    void lockEnabled().then((on) => {
      enabled.current = on;
      if (on) setLocked(true);
    });
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') awaySince.current = Date.now();
      if (s === 'active') {
        void lockEnabled().then((on) => {
          enabled.current = on;
          if (shouldLock(on, awaySince.current)) setLocked(true);
          awaySince.current = null;
        });
      }
    });
    return () => sub.remove();
  }, [signedIn]);

  return { locked, unlocked: () => setLocked(false) };
}
