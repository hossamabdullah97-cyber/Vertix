import { describe, expect, it } from 'vitest';
import { contactFromQr, contactFromText, latinDigits, mergeContacts } from './card-text';

describe('contactFromText', () => {
  it('reads an English card', () => {
    const c = contactFromText([
      { text: 'NILE STUDIO', height: 14 },
      { text: 'Karim Nabil', height: 38 },
      { text: 'Business Development Manager', height: 18 },
      { text: 'T: +20 100 555 0199', height: 16 },
      { text: 'karim@nilestudio.co', height: 16 },
      { text: 'www.nilestudio.co', height: 16 },
      { text: '12 Street 9, Maadi, Cairo, Egypt', height: 14 },
    ]);
    expect(c).toEqual({
      name: 'Karim Nabil',
      nameAlt: null,
      title: 'Business Development Manager',
      company: 'NILE STUDIO',
      emails: ['karim@nilestudio.co'],
      phones: ['+20 100 555 0199'],
      website: 'www.nilestudio.co',
      address: '12 Street 9, Maadi, Cairo, Egypt',
    });
  });

  it('reads an Arabic card, with Arabic digits, and keeps both names', () => {
    const c = contactFromText([
      { text: 'شركة النيل للمقاولات', height: 20 },
      { text: 'مريم خالد', height: 36 },
      { text: 'Mariam Khaled', height: 22 },
      { text: 'مديرة المبيعات', height: 18 },
      { text: 'موبايل: ٠١٠٠١٢٣٤٥٦٧', height: 16 },
      { text: 'البريد: mariam@nile-build.com', height: 16 },
    ]);
    expect(c.name).toBe('مريم خالد');
    expect(c.nameAlt).toBe('Mariam Khaled');
    expect(c.title).toBe('مديرة المبيعات');
    expect(c.company).toBe('شركة النيل للمقاولات');
    expect(c.phones).toEqual(['01001234567']);
    expect(c.emails).toEqual(['mariam@nile-build.com']);
  });

  it('takes the company from the email domain when no line says it, but not from Gmail', () => {
    expect(contactFromText('Omar Adel\nomar@delta-build.com').company).toBe('Delta-build');
    expect(contactFromText('Omar Adel\nomar.adel@gmail.com').company).toBeNull();
  });

  it('keeps two phones on one line apart and drops short numbers', () => {
    const c = contactFromText('Tel 02 2345 6789 / Mob 0100 123 4567\nExt 12');
    expect(c.phones).toEqual(['02 2345 6789', '0100 123 4567']);
  });

  it('drops invisible direction marks and reads a lone ٠ as a separator', () => {
    const c = contactFromText([{ text: 'NILE STUDIO ٠ \u200fاستوديو النيل\u200e', height: 12 }, { text: 'Karim Nabil', height: 30 }]);
    expect(c.company).toBe('NILE STUDIO · استوديو النيل');
  });

  it('ignores noise the camera picks up', () => {
    const c = contactFromText('|| ~\nOmar Adel\n.');
    expect(c.name).toBe('Omar Adel');
  });
});

describe('contactFromQr', () => {
  it('reads a vCard exactly', () => {
    const c = contactFromQr('BEGIN:VCARD\r\nVERSION:3.0\r\nN:Adel;Omar;;;\r\nFN:Omar Adel\r\nORG:Delta Build\\, Inc.;Sales\r\nTITLE:Sales Director\r\nTEL;TYPE=CELL:+201001234567\r\nEMAIL;TYPE=WORK:Omar@Delta.io\r\nURL:https://delta.io\r\nADR;TYPE=WORK:;;12 Street 9;Cairo;;;Egypt\r\nEND:VCARD');
    expect(c).toEqual({
      name: 'Omar Adel',
      nameAlt: null,
      title: 'Sales Director',
      company: 'Delta Build, Inc.',
      emails: ['omar@delta.io'],
      phones: ['+201001234567'],
      website: 'https://delta.io',
      address: '12 Street 9, Cairo, Egypt',
    });
  });

  it('reads the name from N when there is no FN, and folded lines', () => {
    expect(contactFromQr('BEGIN:VCARD\nN:Hassan;Nour\nTEL:0100\n 1234567\nEND:VCARD')).toMatchObject({ name: 'Nour Hassan', phones: ['01001234567'] });
  });

  it('reads a MECARD and a bare link, and nothing else', () => {
    expect(contactFromQr('MECARD:N:Khaled,Mariam;TEL:+201001234567;EMAIL:m@x.co;;')).toMatchObject({ name: 'Mariam Khaled', phones: ['+201001234567'], emails: ['m@x.co'] });
    expect(contactFromQr('https://vertex.app/c/mariam')).toMatchObject({ website: 'https://vertex.app/c/mariam', name: null });
    expect(contactFromQr('hello')).toBeNull();
  });
});

describe('helpers', () => {
  it('reads Arabic-Indic digits', () => {
    expect(latinDigits('٠١٢٣٤٥٦٧٨٩ ۱۲')).toBe('0123456789 12');
  });

  it('fills gaps from a second reading', () => {
    const qr = contactFromQr('https://nile.co')!;
    const text = contactFromText('Omar Adel\nomar@nile.co');
    expect(mergeContacts(qr, text)).toMatchObject({ name: 'Omar Adel', website: 'https://nile.co', emails: ['omar@nile.co'] });
  });
});
