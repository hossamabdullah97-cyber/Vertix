import { afterEach, describe, expect, it, vi } from 'vitest';
import { notForShortcuts, runPageShortcut } from './shortcuts';

const key = (k: string, extra: Partial<KeyboardEvent> = {}, target: Partial<HTMLElement> = { tagName: 'BODY', isContentEditable: false }) =>
  ({ key: k, defaultPrevented: false, ctrlKey: false, metaKey: false, altKey: false, target, ...extra }) as unknown as KeyboardEvent;

describe('single-key shortcuts', () => {
  afterEach(() => vi.unstubAllGlobals());
  const noDialog = () => vi.stubGlobal('document', { querySelector: () => null });

  it('work when nothing else wants the key', () => {
    noDialog();
    expect(notForShortcuts(key('n'))).toBe(false);
  });

  it('never fire while typing, with a modifier held, or while a dialog is open', () => {
    noDialog();
    expect(notForShortcuts(key('n', {}, { tagName: 'INPUT', isContentEditable: false }))).toBe(true);
    expect(notForShortcuts(key('n', {}, { tagName: 'TEXTAREA', isContentEditable: false }))).toBe(true);
    expect(notForShortcuts(key('n', {}, { tagName: 'DIV', isContentEditable: true }))).toBe(true);
    expect(notForShortcuts(key('n', { metaKey: true }))).toBe(true);
    expect(notForShortcuts(key('k', { ctrlKey: true }))).toBe(true);
    vi.stubGlobal('document', { querySelector: () => ({}) });
    expect(notForShortcuts(key('n'))).toBe(true);
  });

  it('does nothing for a key the page does not offer', () => {
    expect(runPageShortcut('q')).toBe(false);
  });
});
