import { describe, expect, it, jest } from '@jest/globals';
jest.mock('./config', () => ({ WEB_BASE: 'https://app.example.com' }));
import { appRoute } from './links';

describe('appRoute', () => {
  it('opens a lead from a notification or an email, in its workspace', () => {
    expect(appRoute('https://app.example.com/leads?lead=L1&org=O1')).toBe('/lead/L1?org=O1');
    expect(appRoute('/leads?lead=L1')).toBe('/lead/L1');
  });

  it("maps the website's pages to the app's screens", () => {
    expect(appRoute('https://app.example.com/dashboard')).toBe('/');
    expect(appRoute('https://app.example.com/leads/')).toBe('/leads');
    expect(appRoute('/notifications')).toBe('/notifications');
    expect(appRoute('/cards/C1?org=O2')).toBe('/card/C1?org=O2');
  });

  it('opens a page without its own screen in the website view', () => {
    expect(appRoute('/invitations')).toBe('/web?path=%2Finvitations');
    expect(appRoute('/leads?view=tasks')).toBe('/web?path=%2Fleads%3Fview%3Dtasks');
  });

  it("leaves visitors' pages and other sites alone", () => {
    expect(appRoute('https://app.example.com/c/mona')).toBeNull();
    expect(appRoute('https://app.example.com/t/04A1B2')).toBeNull();
    expect(appRoute('https://evil.example.net/leads?lead=L1')).toBeNull();
  });

  it("keeps the app's own links", () => {
    expect(appRoute('vertexconnect://lead/L1')).toBe('/lead/L1');
    expect(appRoute('vertexconnect://notifications')).toBe('/notifications');
  });
});
