/**
 * The colours a picture is made of, as card accents: its most common lively
 * colours, near-whites, near-blacks and greys left out (they make poor
 * buttons), and none two alike.
 */

const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** From raw RGBA pixels (a canvas's getImageData().data). */
export function paletteFromPixels(data: ArrayLike<number>, max = 4): string[] {
  // Colours grouped in buckets of 16 levels per channel; each bucket keeps its average.
  const buckets = new Map<number, { n: number; r: number; g: number; b: number; sat: number }>();
  for (let i = 0; i + 3 < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 128) continue;
    const hi = Math.max(r, g, b);
    const lo = Math.min(r, g, b);
    const sat = hi === 0 ? 0 : (hi - lo) / hi;
    if (hi < 40 || (lo > 225 && sat < 0.1) || sat < 0.22) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0, sat: 0 };
    e.n += 1;
    e.r += r;
    e.g += g;
    e.b += b;
    e.sat += sat;
    buckets.set(key, e);
  }
  const ranked = [...buckets.values()]
    .map((e) => ({ r: e.r / e.n, g: e.g / e.n, b: e.b / e.n, score: e.n * (0.5 + e.sat / e.n) }))
    .sort((x, y) => y.score - x.score);
  const chosen: { r: number; g: number; b: number }[] = [];
  for (const c of ranked) {
    if (chosen.length >= max) break;
    if (chosen.some((o) => Math.hypot(o.r - c.r, o.g - c.g, o.b - c.b) < 60)) continue;
    chosen.push(c);
  }
  return chosen.map((c) => toHex(c.r, c.g, c.b));
}

/** From an image or canvas in the page; empty when the browser may not read it (another site's picture). */
export function paletteFromImage(source: HTMLImageElement | HTMLCanvasElement, max = 4): string[] {
  try {
    const size = 48;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(source, 0, 0, size, size);
    return paletteFromPixels(ctx.getImageData(0, 0, size, size).data, max);
  } catch {
    return [];
  }
}
