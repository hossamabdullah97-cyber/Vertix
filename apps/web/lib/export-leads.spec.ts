import { describe, expect, it } from 'vitest';
import { csvCell, leadsCsv, type ExportLabels } from './export-leads';
import type { Lead, Stage } from './crm';

const labels: ExportLabels = {
  headers: { name: 'Name', company: 'Company', email: 'Email', phone: 'Phone', stage: 'Stage', temperature: 'Temperature', value: 'Value', source: 'Source', card: 'Card', added: 'Added' },
  stage: (s) => s.name.toUpperCase(),
  temperature: (t) => t.toLowerCase(),
  source: (s) => `src:${s}`,
};
const stages = [{ id: 's1', name: 'New', order: 0 }] as Stage[];
const lead = (over: Partial<Lead> = {}): Lead => ({
  id: 'l1', name: 'Omar, Adel', email: 'omar@x.co', phone: '+20 100', company: 'شركة النيل', score: 0, value: 1200,
  temperature: 'HOT', source: 'card_form', stageId: 's1', createdAt: new Date(2026, 8, 29, 9, 5).toISOString(), card: { slug: 'mariam' }, ...over,
});

describe('leadsCsv', () => {
  it('writes a header and one line per lead, ready for Excel', () => {
    const csv = leadsCsv([lead(), lead({ name: null, company: null, stageId: null, card: null, value: 0 })], stages, labels);
    expect(csv.startsWith('﻿Name,Company,Email')).toBe(true);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('"Omar, Adel",شركة النيل,omar@x.co,+20 100,NEW,hot,1200,src:card_form,/c/mariam,2026-09-29 09:05');
    expect(lines[2]).toBe(',,omar@x.co,+20 100,,hot,0,src:card_form,,2026-09-29 09:05');
  });
});

describe('csvCell', () => {
  it('keeps a typed formula from running when the file is opened', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('@SUM(1)')).toBe("'@SUM(1)");
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell('+20 100 123 4567')).toBe('+20 100 123 4567');
    expect(csvCell('+1+cmd|x')).toBe("'+1+cmd|x");
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });
});

describe('leadsCsv with the workspace’s own fields', () => {
  it('adds a column for each, a checkbox as words', () => {
    const fields = [
      { id: 'f_b', label: 'Budget', type: 'NUMBER' as const, options: [], order: 0 },
      { id: 'f_v', label: 'VIP', type: 'CHECKBOX' as const, options: [], order: 1 },
    ];
    const csv = leadsCsv([lead({ customFields: { f_b: 5000, f_v: true } }), lead({ customFields: null })], stages, { ...labels, fields, yesNo: ['نعم', 'لا'] });
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]!.endsWith(',Added,Budget,VIP')).toBe(true);
    expect(lines[1]!.endsWith(',5000,نعم')).toBe(true);
    expect(lines[2]!.endsWith(',,')).toBe(true);
  });
});
