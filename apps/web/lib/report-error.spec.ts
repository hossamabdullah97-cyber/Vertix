import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeError, isStaleChunk, reportError, resetReports, watchErrors, worthReporting } from './report-error';

// No DOM here: a window with just what the reporter uses.
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}
const fakeWindow = Object.assign(new EventTarget(), { location: { pathname: '/reset-password', search: '?token=secret' } });
const event = (type: string, props: Record<string, unknown>) => Object.assign(new Event(type), props);

describe('reporting errors from the page', () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  beforeEach(() => {
    resetReports();
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('localStorage', new MemoryStorage());
    localStorage.setItem('vertex_token', 'tok.1');
  });
  afterEach(() => vi.unstubAllGlobals());

  const sentBody = (i = 0) => JSON.parse(String((fetchMock.mock.calls[i] as unknown as [string, RequestInit])[1].body));

  it('sends the error, the page without its query, and who was signed in', () => {
    reportError(new TypeError('x is undefined'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/telemetry\/errors$/);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok.1');
    expect(init.keepalive).toBe(true);
    expect(sentBody()).toMatchObject({ kind: 'error', name: 'TypeError', message: 'x is undefined', path: '/reset-password' });
  });

  it('sends one error once a page, and stops after ten', () => {
    reportError(new Error('same'));
    reportError(new Error('same'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 20; i++) reportError(new Error(`different ${i}`));
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it('leaves out noise and a deploy’s stale code files', () => {
    expect(worthReporting({ name: 'Error', message: 'Script error.' })).toBe(false);
    expect(worthReporting({ name: 'AbortError', message: 'aborted' })).toBe(false);
    expect(worthReporting({ name: 'Error', message: 'x', stack: 'at f (chrome-extension://abc/x.js:1:1)' })).toBe(false);
    expect(isStaleChunk({ name: 'ChunkLoadError', message: 'Loading chunk 712 failed.' })).toBe(true);
    expect(isStaleChunk({ name: 'TypeError', message: 'Failed to fetch dynamically imported module: /x.js' })).toBe(true);
    reportError(Object.assign(new Error('Loading chunk 9 failed.'), { name: 'ChunkLoadError' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads whatever was thrown', () => {
    expect(describeError('plain text')).toEqual({ name: 'Error', message: 'plain text' });
    expect(describeError({ message: 'like an error' })).toEqual({ name: 'Error', message: 'like an error' });
  });

  it('hears what nothing caught, until told to stop', () => {
    const stop = watchErrors();
    fakeWindow.dispatchEvent(event('error', { error: new RangeError('too far'), message: 'too far' }));
    fakeWindow.dispatchEvent(event('unhandledrejection', { reason: new Error('rejected') }));
    stop();
    fakeWindow.dispatchEvent(event('error', { error: new Error('after'), message: 'after' }));
    expect(fetchMock.mock.calls.map((_, i) => [sentBody(i).kind, sentBody(i).message])).toEqual([
      ['error', 'too far'],
      ['unhandledrejection', 'rejected'],
    ]);
  });
});
