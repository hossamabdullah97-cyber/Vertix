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

  it('hands an InstaPay payment link to its app on Android', () => {
    expect(appLink('https://ipn.eg/S/hossam/instapay/4Fh2a', 'android')).toBe(
      'intent://ipn.eg/S/hossam/instapay/4Fh2a#Intent;scheme=https;package=com.egyptianbanks.instapay;S.browser_fallback_url=https%3A%2F%2Fipn.eg%2FS%2Fhossam%2Finstapay%2F4Fh2a;end',
    );
    expect(appLink('https://ipn.eg/S/hossam/instapay/4Fh2a', 'ios')).toBe('https://ipn.eg/S/hossam/instapay/4Fh2a');
  });

  it('keeps the ordinary link on iOS, so a missing app never shows an error', () => {
    expect(appLink('https://wa.me/201001234567', 'ios')).toBe('https://wa.me/201001234567');
    expect(appLink('http://linkedin.com/in/mariam', 'ios')).toBe('https://linkedin.com/in/mariam');
  });

  it('hands every app link on a card to its app on Android', () => {
    const pkg = (href: string) => /package=([^;]+)/.exec(appLink(href, 'android') ?? '')?.[1];
    expect(pkg('https://www.instagram.com/vertex.leather/')).toBe('com.instagram.android');
    expect(pkg('https://m.facebook.com/vertexleather')).toBe('com.facebook.katana');
    expect(pkg('https://fb.me/vertex')).toBe('com.facebook.katana');
    expect(pkg('https://x.com/vertex')).toBe('com.twitter.android');
    expect(pkg('https://www.tiktok.com/@vertex')).toBe('com.zhiliaoapp.musically');
    expect(pkg('https://vm.tiktok.com/ZM123/')).toBe('com.zhiliaoapp.musically');
    expect(pkg('https://youtu.be/abc')).toBe('com.google.android.youtube');
    expect(pkg('https://www.youtube.com/@vertex')).toBe('com.google.android.youtube');
    expect(pkg('https://t.me/vertex')).toBe('org.telegram.messenger');
    expect(pkg('https://snapchat.com/add/vertex')).toBe('com.snapchat.android');
    expect(pkg('https://www.threads.net/@vertex')).toBe('com.instagram.barcelona');
    expect(pkg('https://m.me/vertex')).toBe('com.facebook.orca');
    expect(pkg('https://maps.app.goo.gl/abc123')).toBe('com.google.android.apps.maps');
    expect(pkg('https://maps.google.com/?q=Giza')).toBe('com.google.android.apps.maps');
    expect(pkg('https://www.google.com/maps/place/Giza')).toBe('com.google.android.apps.maps');
    expect(pkg('https://us02web.zoom.us/j/123')).toBe('us.zoom.videomeetings');
    expect(pkg('https://teams.microsoft.com/l/meetup-join/x')).toBe('com.microsoft.teams');
    expect(pkg('https://paypal.me/vertex')).toBe('com.paypal.android.p2pmobile');
    expect(pkg('https://github.com/vertex')).toBe('com.github.android');
  });

  it('leaves other sites, other schemes and computers alone', () => {
    expect(appLink('https://vertexleatherco.com', 'android')).toBeNull();
    expect(appLink('https://www.google.com/search?q=vertex', 'android')).toBeNull();
    expect(appLink('https://notlinkedin.com/in/x', 'android')).toBeNull();
    expect(appLink('tel:+201001234567', 'android')).toBeNull();
    expect(appLink('https://wa.me/201001234567', 'other')).toBeNull();
    expect(appLink('not a url', 'ios')).toBeNull();
  });
});
