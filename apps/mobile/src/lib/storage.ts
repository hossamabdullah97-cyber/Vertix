import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Secrets on the phone's own keystore (Keychain on iOS, Keystore on Android).
 * The web build, used for previews and tests, has no keystore: it keeps them
 * for the tab, as the website does.
 */
export const secrets = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string | null): Promise<void> {
    if (Platform.OS === 'web') {
      if (value === null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
      return;
    }
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  },
};
