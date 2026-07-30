import NfcManager, { NfcTech, Ndef } from 'react-native-nfc-manager';

let started = false;

async function ensure() {
  if (!started) {
    await NfcManager.start();
    started = true;
  }
  const supported = await NfcManager.isSupported();
  if (!supported) throw new Error('This device does not support NFC');
}

export interface ReadResult {
  uid: string | null;
  url: string | null;
}

/** Reads a tag: returns its hardware UID and any NDEF URI it carries. */
export async function readTag(): Promise<ReadResult> {
  await ensure();
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef);
    const tag = await NfcManager.getTag();
    const uid = tag?.id ?? null;

    let url: string | null = null;
    const message = tag?.ndefMessage;
    if (message && message.length > 0) {
      try {
        url = Ndef.uri.decodePayload(Uint8Array.from(message[0].payload));
      } catch {
        url = null;
      }
    }
    return { uid, url };
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

/**
 * Programs a tag in a single tap: reads the hardware UID, then writes an NDEF
 * URI record built from that UID (so tapping the tag opens the gateway URL).
 * Returns the UID for server-side registration.
 */
export async function programTag(
  buildUrl: (uid: string) => string,
): Promise<string> {
  await ensure();
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef);
    const tag = await NfcManager.getTag();
    const uid = tag?.id;
    if (!uid) throw new Error('Could not read the tag UID');

    const bytes = Ndef.encodeMessage([Ndef.uriRecord(buildUrl(uid))]);
    if (!bytes) throw new Error('Failed to encode NDEF message');
    await NfcManager.ndefHandler.writeNdefMessage(bytes);
    return uid;
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

export async function cancel() {
  await NfcManager.cancelTechnologyRequest().catch(() => {});
}
