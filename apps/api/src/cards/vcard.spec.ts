import { buildVCard } from './vcard';

describe('buildVCard', () => {
  it('wraps output in BEGIN/END and VERSION', () => {
    const out = buildVCard({ fullName: 'Jane Doe' });
    expect(out.startsWith('BEGIN:VCARD\r\nVERSION:3.0')).toBe(true);
    expect(out.trim().endsWith('END:VCARD')).toBe(true);
    expect(out).toContain('FN:Jane Doe');
  });

  it('includes all provided fields', () => {
    const out = buildVCard({
      fullName: 'Jane',
      org: 'Acme',
      title: 'CEO',
      phone: '+1555',
      email: 'jane@acme.co',
      website: 'https://acme.co',
    });
    expect(out).toContain('ORG:Acme');
    expect(out).toContain('TITLE:CEO');
    expect(out).toContain('TEL;TYPE=CELL:+1555');
    expect(out).toContain('EMAIL;TYPE=INTERNET:jane@acme.co');
    expect(out).toContain('URL:https://acme.co');
  });

  it('uses name/url aliases and a fallback name', () => {
    expect(buildVCard({ name: 'Bob', url: 'https://b.dev' })).toContain('FN:Bob');
    expect(buildVCard({}, { name: 'Fallback' })).toContain('FN:Fallback');
  });

  it('escapes special characters per RFC 6350', () => {
    const out = buildVCard({ fullName: 'Doe, Jane; Inc.' });
    expect(out).toContain('FN:Doe\\, Jane\\; Inc.');
  });

  it('omits fields that are not provided', () => {
    const out = buildVCard({ fullName: 'Only Name' });
    expect(out).not.toContain('ORG:');
    expect(out).not.toContain('TEL');
  });
});
