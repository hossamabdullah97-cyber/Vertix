import { describe, expect, it } from 'vitest';
import { paletteFromPixels } from './palette';

/** n pixels of one colour, as RGBA. */
const px = (n: number, r: number, g: number, b: number, a = 255) => Array.from({ length: n }, () => [r, g, b, a]).flat();

describe('paletteFromPixels', () => {
  it('puts the most common lively colour first', () => {
    const colours = paletteFromPixels([...px(30, 37, 99, 235), ...px(10, 220, 38, 38)]);
    expect(colours[0]).toBe('#2563eb');
    expect(colours[1]).toBe('#dc2626');
  });

  it('leaves out whites, blacks, greys and see-through pixels', () => {
    const colours = paletteFromPixels([...px(100, 255, 255, 255), ...px(100, 10, 10, 10), ...px(100, 128, 128, 128), ...px(100, 37, 99, 235, 0), ...px(5, 16, 185, 129)]);
    expect(colours).toEqual(['#10b981']);
  });

  it('does not offer two shades that look the same', () => {
    const colours = paletteFromPixels([...px(20, 37, 99, 235), ...px(18, 40, 104, 240), ...px(5, 234, 179, 8)]);
    expect(colours).toHaveLength(2);
  });

  it('gives nothing for a picture with no colour', () => {
    expect(paletteFromPixels(px(50, 240, 240, 240))).toEqual([]);
  });
});
