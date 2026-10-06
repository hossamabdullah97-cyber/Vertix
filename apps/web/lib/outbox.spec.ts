import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { hold, useConnection } from './outbox';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
});

describe('useConnection', () => {
  // A change cut off by a reload waits in this browser; the page from the
  // server knows nothing of it, so hydration must start from "nothing waiting"
  // or React throws away the server's page (hydration errors 418/423).
  it('hydrates from what the server rendered, not from what waits on this device', () => {
    void hold({ path: '/account/onboarding', method: 'PATCH', body: '{}', orgId: null });
    const Probe = () => createElement('span', null, String(useConnection().pending));
    expect(renderToString(createElement(Probe))).toBe('<span>0</span>');
  });
});
