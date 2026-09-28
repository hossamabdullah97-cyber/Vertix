import { describe, expect, it } from 'vitest';
import { appLink, platformOf } from './appLinks';

describe('platformOf', () => {
  it('tells Android and iOS phones from everything else', () => {
    expect(platformOf('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile')).toBe('android');
    expect(platformOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')).toBe('ios');
    expect(platformOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126')).toBe('other');
    // An iPad asking for the desktop site looks like a Mac, but has a touch screen.
    expect(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 5)).toBe('ios');
    expect(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 0)).toBe('other');
  });
});

describe('appLink', () => {
  it('hands WhatsApp to its app on Android, with the web page as the fallback', () => {
    expect(appLink('https://wa.me/201001234567?text=Hi%20there', 'android')).toBe(
      'intent://wa.me/201001234567?text=Hi%20there#Intent;scheme=https;package=com.whatsapp;S.browser_fallback_url=https%3A%2F%2Fwa.me%2F201001234567%3Ftext%3DHi%2520there;end',
    );
  });

  it('hands LinkedIn profiles and company pages to its app on Android', () => {
    expect(appLink('https://www.linkedin.com/in/mariam-khaled', 'android')).toBe(
      'intent://www.linkedin.com/in/mariam-khaled#Intent;scheme=https;package=com.linkedin.android;S.browser_fallback_url=https%3A%2F%2Fwww.linkedin.com%2Fin%2Fmariam-khaled;end',
    );
    expect(appLink('https://eg.linkedin.com/company/nile-studio', 'android')).toContain('package=com.linkedin.android');
  });

  it('keeps the ordinary link on iOS, so a missing app never shows an error', () => {
    expect(appLink('https://wa.me/201001234567', 'ios')).toBe('https://wa.me/201001234567');
    expect(appLink('http://linkedin.com/in/mariam', 'ios')).toBe('https://linkedin.com/in/mariam');
  });

  it('leaves other sites, other schemes and computers alone', () => {
    expect(appLink('https://instagram.com/nile', 'android')).toBeNull();
    expect(appLink('https://notlinkedin.com/in/x', 'android')).toBeNull();
    expect(appLink('tel:+201001234567', 'android')).toBeNull();
    expect(appLink('https://wa.me/201001234567', 'other')).toBeNull();
    expect(appLink('not a url', 'ios')).toBeNull();
  });
});
