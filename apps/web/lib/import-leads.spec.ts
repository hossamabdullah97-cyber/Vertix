import { describe, expect, it } from 'vitest';
import { leadsTemplateCsv, parseDay, parseLeadRows, parseTemperature, parseValue } from './import-leads';
import { parseCsv } from './import-members';

const STAGES = [
  { id: 'st_new', names: ['New', 'New', 'جديد'] },
  { id: 'st_contacted', names: ['Contacted', 'Contacted', 'تم التواصل'] },
];

describe('reading a spreadsheet of leads', () => {
  it('finds the columns in either language, in any order', () => {
    const { leads, columns } = parseLeadRows(
      [
        ['ملاحظات', 'الهاتف', 'الاسم', 'المرحلة', 'القيمة', 'الاهتمام', 'تاريخ الإضافة'],
        ['قابلناه في المعرض', 1001234567, 'منى عادل', 'تم التواصل', '٢٥٬٠٠٠ ج.م', 'ساخن', '1/3/2025'],
      ],
      STAGES,
    );
    expect(columns.phone).toBe(1);
    expect(leads[0]!.row).toEqual({
      line: 2,
      name: 'منى عادل',
      phone: '01001234567',
      note: 'قابلناه في المعرض',
      stageId: 'st_contacted',
      value: 25000,
      temperature: 'HOT',
      createdOn: '2025-03-01',
    });
  });

  it('reads back a file the leads export wrote, and puts first and last names together', () => {
    const exported = parseCsv('﻿Name,Company,Email,Phone,Stage,Temperature,Value,Source,Card,Added\r\nMona,Nile,mona@nile.co,+20 100 123 4567,New,Warm,1200,Card form,/c/mona,2025-04-02 10:30\r\n');
    const { leads } = parseLeadRows(exported, STAGES);
    expect(leads[0]!.row).toMatchObject({ name: 'Mona', company: 'Nile', email: 'mona@nile.co', stageId: 'st_new', temperature: 'WARM', value: 1200, createdOn: '2025-04-02' });
    const split = parseLeadRows([['First name', 'Last name'], ['Omar', 'Saeed']], STAGES);
    expect(split.leads[0]!.row.name).toBe('Omar Saeed');
  });

  it('skips empty rows, keeps each row’s line, and flags a date it cannot read', () => {
    const { leads } = parseLeadRows([[], ['Name', 'Date'], ['A', ''], ['', ''], ['B', 'next tuesday']], STAGES);
    expect(leads.map((l) => [l.row.line, l.problem])).toEqual([
      [3, undefined],
      [5, 'badDate'],
    ]);
  });

  it('sends a stage the pipeline has no such name for as itself, for the server to name', () => {
    const { leads } = parseLeadRows([['Name', 'Stage'], ['A', 'Hot prospect']], STAGES);
    expect(leads[0]!.row.stageId).toBe('unknown:Hot prospect');
  });

  it('reads the starter file it offers', () => {
    for (const lang of ['en', 'ar'] as const) {
      const { leads } = parseLeadRows(parseCsv(leadsTemplateCsv(lang)), STAGES);
      expect(leads).toHaveLength(2);
      expect(leads[0]!.row).toMatchObject({ stageId: 'st_new', temperature: 'HOT', value: 25000, createdOn: '2025-03-01' });
      expect(leads[1]!.row.stageId).toBe('st_contacted');
    }
  });
});

describe('values in a file', () => {
  it('reads amounts however they were written', () => {
    expect(parseValue('EGP 12,500')).toBe(12500);
    expect(parseValue('12.500,50')).toBe(12501);
    expect(parseValue('1,234.4')).toBe(1234);
    expect(parseValue('٣٠٠٠')).toBe(3000);
    expect(parseValue(99.6)).toBe(100);
    expect(parseValue('soon')).toBeUndefined();
  });

  it('reads interest in both languages', () => {
    expect(parseTemperature('Hot')).toBe('HOT');
    expect(parseTemperature('دافئ')).toBe('WARM');
    expect(parseTemperature('بارد')).toBe('COLD');
    expect(parseTemperature('maybe')).toBeUndefined();
  });

  it('reads days from Excel and from text, day first', () => {
    expect(parseDay(new Date(2025, 2, 1))).toBe('2025-03-01');
    expect(parseDay(45717)).toBe('2025-03-01');
    expect(parseDay('2025-03-01T10:00')).toBe('2025-03-01');
    expect(parseDay('٠١/٠٣/٢٠٢٥')).toBe('2025-03-01');
    expect(parseDay('31/02/2025')).toBeNull();
    expect(parseDay('')).toBeUndefined();
  });
});
