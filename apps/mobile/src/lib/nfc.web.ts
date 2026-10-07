// A browser cannot program chips: the web build (previews, tests) says so.
export async function nfcSupported(): Promise<boolean> {
  return false;
}
export interface ReadResult {
  uid: string | null;
  url: string | null;
}
export async function readTag(): Promise<ReadResult> {
  throw new Error('NFC_UNSUPPORTED');
}
export async function programTag(_buildUrl: (uid: string) => string): Promise<string> {
  throw new Error('NFC_UNSUPPORTED');
}
export async function cancelNfc() {}
