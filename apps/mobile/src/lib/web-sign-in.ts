import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { redeemWebSignIn } from './api';
import { WEB_BASE } from './config';

/** Where the website sends the code back (it never takes the address from the link). */
const RETURN = 'vertexconnect://auth';

const base64url = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A PKCE pair: the verifier stays here; the website and the API see only its SHA-256. */
export async function pkcePair(random: (n: number) => Uint8Array = Crypto.getRandomBytes) {
  const bytes = random(32);
  const verifier = base64url(btoa(String.fromCharCode(...bytes)));
  const challenge = base64url(await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 }));
  return { verifier, challenge };
}

/**
 * Signing in through the website, for every way it offers (Google, a
 * company's single sign-on, a password): its sign-in opens in the phone's
 * browser sheet, and comes back with a one-time code that only this app's
 * verifier can use. Resolves false when the person closed the sheet.
 */
export async function signInOnWebsite(): Promise<boolean> {
  const { verifier, challenge } = await pkcePair();
  const result = await WebBrowser.openAuthSessionAsync(`${WEB_BASE}/app-login?challenge=${challenge}`, RETURN);
  if (result.type !== 'success') return false;
  const code = new URL(result.url).searchParams.get('code');
  if (!code) return false;
  await redeemWebSignIn(code, verifier);
  return true;
}
