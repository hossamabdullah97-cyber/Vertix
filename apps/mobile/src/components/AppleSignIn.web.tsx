import type { AppleCredential } from './AppleSignIn';

/** Not in the browser build: Sign in with Apple here is for the iPhone app. */
export function AppleSignIn(_props: { onCredential: (c: AppleCredential) => void; onError: (e: unknown) => void }) {
  return null;
}
