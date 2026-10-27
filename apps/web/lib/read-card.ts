'use client';

import { authFetch, authPostFile } from './client';
import { canvasJpeg, photoCanvas, readQr, readText, type ReadProgress } from './card-reader';
import { contactFromQr, contactFromText, mergeContacts, type CardContact } from './card-text';
import { paletteFromImage } from './palette';

/** Who read it: a QR code's vCard, Claude on the server, or this device (less sure with Arabic). */
export type ReadBy = 'qr' | 'ai' | 'device' | 'deviceArabic';

export type CardReading =
  | { ok: true; contact: CardContact; by: ReadBy; colors: string[] }
  | { ok: false; error: 'notCard' | 'read' };

/** Whether the server reads cards (Claude is set up there). */
export function scanAvailable(): Promise<boolean> {
  return authFetch<{ available: boolean }>('/leads/scan')
    .then((r) => r.available)
    .catch(() => false);
}

/** Whether a reading found anything worth filling in. */
export const foundSomething = (c: CardContact) => !!(c.name || c.company || c.emails.length || c.phones.length);

/**
 * Reads a photo of a paper business card, the surest way first: its QR code
 * (a vCard is exact), then Claude on the server when it is there, then this
 * device. The card's colours are read from the photo too.
 */
export async function readCardPhoto(
  file: Blob,
  { ai, onProgress, current = () => true }: { ai: boolean; onProgress?: (p: ReadProgress) => void; current?: () => boolean },
): Promise<CardReading | null> {
  try {
    const canvas = await photoCanvas(file);
    const colors = paletteFromImage(canvas, 4);

    // 1. A QR code with a vCard is exact: nothing to guess.
    const qrText = await readQr(canvas).catch(() => null);
    const qr = qrText ? contactFromQr(qrText) : null;
    if (!current()) return null;
    if (qr && (qr.name || qr.emails.length || qr.phones.length)) return { ok: true, contact: qr, by: 'qr', colors };

    // 2. Claude, when the server has it: best at names and Arabic.
    if (ai) {
      try {
        const c = await authPostFile<CardContact>('/leads/scan', await canvasJpeg(canvas), 'card.jpg');
        if (!current()) return null;
        return { ok: true, contact: qr ? mergeContacts(c, qr) : c, by: 'ai', colors };
      } catch (e) {
        if (!current()) return null;
        if ((e as { status?: number }).status === 422) return { ok: false, error: 'notCard' };
        // Down or over its limit: read it here instead.
      }
    }

    // 3. On this device.
    const lines = await readText(canvas, (p) => current() && onProgress?.(p));
    if (!current()) return null;
    const c = qr ? mergeContacts(contactFromText(lines), qr) : contactFromText(lines);
    if (!foundSomething(c)) return { ok: false, error: 'notCard' };
    // Tesseract reads Arabic, and Arabic digits above all, much less well than English.
    return { ok: true, contact: c, by: lines.some((l) => /[؀-ۿ]/.test(l.text)) ? 'deviceArabic' : 'device', colors };
  } catch {
    return current() ? { ok: false, error: 'read' } : null;
  }
}
