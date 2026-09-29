import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildVCard, photoFromUpload, vcardFileName } from './vcard';

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
      company: 'Acme',
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
    expect(buildVCard({}, { fallbackName: 'Fallback' })).toContain('FN:Fallback');
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

  it('reads an older card, whose job title was kept under org', () => {
    const out = buildVCard({ fullName: 'Jane', org: 'Sales Director' });
    expect(out).toContain('TITLE:Sales Director');
    expect(out).not.toContain('ORG:');
  });

  it('splits the name for sorting', () => {
    expect(buildVCard({ fullName: 'Mariam Khaled Ali' })).toContain('N:Ali;Mariam Khaled;;;');
  });

  it('carries the card links, labelled, without repeating the main phone', () => {
    const out = buildVCard(
      { fullName: 'Jane', phone: '+201' },
      {
        cardUrl: 'https://vertex.app/c/jane',
        actions: [
          { type: 'WHATSAPP', config: { phone: '+201' } },
          { type: 'CALL', config: { phone: '+202' } },
          { type: 'EMAIL', config: { email: 'j@x.co' } },
          { type: 'LINKEDIN', config: { url: 'https://www.linkedin.com/in/jane' } },
          { type: 'WEBSITE', config: { url: 'https://instagram.com/jane' } },
          { type: 'WEBSITE', config: { url: 'javascript:alert(1)' } },
        ],
      },
    );
    expect(out.match(/TEL;/g)).toHaveLength(2);
    expect(out).toContain('EMAIL;TYPE=INTERNET:j@x.co');
    expect(out).toContain('item1.URL:https://www.linkedin.com/in/jane');
    expect(out).toContain('item1.X-ABLabel:LinkedIn');
    expect(out).toContain('item2.X-ABLabel:Instagram');
    expect(out).toContain('item3.URL:https://vertex.app/c/jane');
    expect(out).not.toContain('javascript');
  });

  it('adds the about as a note and folds long lines', () => {
    const out = buildVCard({ fullName: 'Jane' }, { about: 'Line one\nline two', photo: { type: 'JPEG', base64: 'A'.repeat(300) } });
    expect(out).toContain('NOTE:Line one\\nline two');
    for (const line of out.split('\r\n')) expect(line.length).toBeLessThanOrEqual(75);
    expect(out).toContain('PHOTO;ENCODING=b;TYPE=JPEG:');
  });
});

describe('photoFromUpload', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vc-'));
  writeFileSync(join(dir, 'abc-123.jpg'), Buffer.from([1, 2, 3]));

  it('reads a photo this server stored', () => {
    expect(photoFromUpload('http://api.test/uploads/abc-123.jpg', dir)).toEqual({ type: 'JPEG', base64: 'AQID' });
  });

  it('never reads anything else', () => {
    expect(photoFromUpload('https://evil.test/uploads/../../etc/passwd', dir)).toBeNull();
    expect(photoFromUpload('http://api.test/uploads/abc-123.gif', dir)).toBeNull();
    expect(photoFromUpload('http://api.test/uploads/missing.jpg', dir)).toBeNull();
    expect(photoFromUpload(42, dir)).toBeNull();
  });
});

describe('vcardFileName', () => {
  it('keeps a Latin name and falls back for others', () => {
    expect(vcardFileName('Jane Doe')).toBe('Jane-Doe.vcf');
    expect(vcardFileName('مريم خالد')).toBe('contact.vcf');
  });
});
