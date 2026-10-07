import NfcManager, { Ndef, NfcTech } from 'react-native-nfc-manager';

let started = false;

/** Whether this phone can read and write chips at all. */
export async function nfcSupported(): Promise<boolean> {
  try {
    return await NfcManager.isSupported();
  } catch {
    return false;
  }
}

async function ensure() {
  if (!started) {
    await NfcManager.start();
    started = true;
  }
  if (!(await NfcManager.isSupported())) throw new Error('NFC_UNSUPPORTED');
}

export interface ReadResult {
  uid: string | null;
  url: string | null;
}

/** Reads a chip: its serial and the address written on it. */
export async function readTag(): Promise<ReadResult> {
  await ensure();
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef);
    const tag = await NfcManager.getTag();
    let url: string | null = null;
    const message = tag?.ndefMessage;
    if (message?.length) {
      try {
        url = Ndef.uri.decodePayload(Uint8Array.from(message[0]!.payload));
      } catch {
        url = null;
      }
    }
    return { uid: tag?.id ?? null, url };
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => undefined);
  }
}

/**
 * Programs a chip in one tap: reads its serial, then writes the address built
 * from it, so tapping the chip opens the card. Returns the serial, for the
 * server to register.
 */
export async function programTag(buildUrl: (uid: string) => string): Promise<string> {
  await ensure();
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef);
    const tag = await NfcManager.getTag();
    const uid = tag?.id;
    if (!uid) throw new Error('NFC_NO_SERIAL');
    const bytes = Ndef.encodeMessage([Ndef.uriRecord(buildUrl(uid))]);
    if (!bytes) throw new Error('NFC_ENCODE');
    await NfcManager.ndefHandler.writeNdefMessage(bytes);
    return uid;
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => undefined);
  }
}

export async function cancelNfc() {
  await NfcManager.cancelTechnologyRequest().catch(() => undefined);
}
