import { useEffect, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { publicApi } from '@/lib/api';

export interface AppleCredential {
  identityToken: string;
  /** The nonce Apple was given the SHA-256 of; the server checks the token carries it. */
  nonce: string;
  name?: string;
}

/**
 * Apple's own "Sign in with Apple" button, on iPhones when the server has it
 * set up (GET /auth/providers). Cancelling is not an error.
 */
export function AppleSignIn({ onCredential, onError }: { onCredential: (c: AppleCredential) => void; onError: (e: unknown) => void }) {
  const scheme = useColorScheme();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void Promise.all([AppleAuthentication.isAvailableAsync(), publicApi<{ apple?: boolean }>('/auth/providers').catch(() => ({ apple: false }))]).then(
      ([available, providers]) => setShown(available && !!providers.apple),
    );
  }, []);

  if (!shown) return null;

  async function start() {
    try {
      const nonce = `${Crypto.randomUUID()}${Crypto.randomUUID()}`;
      const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce: hashed,
      });
      if (!cred.identityToken) throw new Error('No identity token');
      const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ') || undefined;
      onCredential({ identityToken: cred.identityToken, nonce, name });
    } catch (e) {
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
      onError(e);
    }
  }

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={scheme === 'dark' ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={12}
      style={{ height: 50 }}
      onPress={start}
    />
  );
}
