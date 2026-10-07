import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The last answer to each read, on this phone, per workspace: shown when the
 * phone has no connection (and while a fresh one loads), so the day's leads
 * are still there at a fair with no signal.
 */

const PREFIX = 'vertex_cache:';
/** A bigger answer is not kept: phones give an app little room for this. */
const MAX_CHARS = 1_500_000;

const key = (org: string | null, path: string) => `${PREFIX}${org ?? '-'}:${path}`;

export async function cached<T>(org: string | null, path: string): Promise<{ data: T; at: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(key(org, path));
    return raw ? (JSON.parse(raw) as { data: T; at: number }) : null;
  } catch {
    return null;
  }
}

export async function keep(org: string | null, path: string, data: unknown) {
  try {
    const raw = JSON.stringify({ data, at: Date.now() });
    if (raw.length <= MAX_CHARS) await AsyncStorage.setItem(key(org, path), raw);
  } catch {
    // Full or unavailable: the app works without it.
  }
}

/** Signing out: what was kept belongs to that account. */
export async function clearCache() {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    // Nothing to do.
  }
}
