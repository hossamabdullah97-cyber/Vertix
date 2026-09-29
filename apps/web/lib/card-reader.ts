'use client';

import type { TextLine } from './card-text';

/**
 * Reading a business card photo on the phone itself: its QR code first
 * (the browser's own detector, or jsQR), then its printed text with
 * Tesseract. Everything the reader needs is served by this app (see
 * scripts/copy-ocr.mjs), so the photo never leaves the phone.
 */

/** The photo, turned upright and no bigger than `max` pixels, on a canvas. */
export async function photoCanvas(file: Blob, max = 1600): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d', { willReadFrequently: true })!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas;
}

export function canvasJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No image'))), 'image/jpeg', 0.85));
}

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

/** The text of the first QR code in the photo, or null. */
export async function readQr(canvas: HTMLCanvasElement): Promise<string | null> {
  const Native = (globalThis as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (Native) {
    try {
      const formats = (await Native.getSupportedFormats?.()) ?? ['qr_code'];
      if (formats.includes('qr_code')) {
        const found = await new Native({ formats: ['qr_code'] }).detect(canvas);
        if (found[0]?.rawValue) return found[0].rawValue;
      }
    } catch {
      /* fall through to jsQR */
    }
  }
  const { default: jsQR } = await import('jsqr');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })?.data || null;
}

export type ReadProgress = { phase: 'loading' | 'reading'; progress: number };

type Worker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;
let worker: Promise<Worker> | null = null;
let report: ((p: ReadProgress) => void) | null = null;

/** One reader for the page's life: starting it (and fetching its data the first time) is the slow part. */
function getWorker(): Promise<Worker> {
  worker ??= import('tesseract.js').then(({ createWorker, OEM }) =>
    createWorker(['ara', 'eng'], OEM.LSTM_ONLY, {
      workerPath: '/ocr/worker.min.js',
      corePath: '/ocr/core',
      langPath: '/ocr/lang',
      gzip: true,
      logger: (m: { status: string; progress: number }) =>
        report?.({ phase: m.status.startsWith('recognizing') ? 'reading' : 'loading', progress: m.progress ?? 0 }),
    }),
  );
  worker.catch(() => {
    worker = null;
  });
  return worker;
}

/**
 * The photo as the reader likes it: big enough that small print is ~30px
 * tall, which Tesseract reads best. (Greying and stretching the contrast
 * was tried; it lost as much as it gained.)
 */
export function forReading(src: HTMLCanvasElement): HTMLCanvasElement {
  const scale = Math.min(2.5, Math.max(1, 2200 / Math.max(src.width, src.height)));
  const out = document.createElement('canvas');
  out.width = Math.round(src.width * scale);
  out.height = Math.round(src.height * scale);
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

/** The card's printed lines, with how tall each is (in the original photo's pixels). */
export async function readText(canvas: HTMLCanvasElement, onProgress?: (p: ReadProgress) => void): Promise<TextLine[]> {
  report = onProgress ?? null;
  try {
    const w = await getWorker();
    const prepared = forReading(canvas);
    const { data } = await w.recognize(prepared, { rotateAuto: true }, { blocks: true, text: true });
    const lines: TextLine[] = [];
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs) {
        for (const line of para.lines) {
          if (line.confidence < 30) continue;
          lines.push({ text: line.text.trim(), height: line.bbox.y1 - line.bbox.y0 });
        }
      }
    }
    return lines.length ? lines : data.text.split('\n').map((text) => ({ text }));
  } finally {
    report = null;
  }
}
