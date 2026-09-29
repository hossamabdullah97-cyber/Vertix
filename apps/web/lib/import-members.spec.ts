import { describe, expect, it } from 'vitest';
import { mapColumns, parseCsv, parseRows, roleOf, templateCsv } from './import-members';

describe('mapColumns', () => {
  it('finds columns by English or Arabic header, in any order', () => {
    expect(mapColumns(['Full Name', 'E-mail', 'Mobile', 'Department', 'Job title'])).toEqual({ name: 0, email: 1, phone: 2, team: 3, title: 4 });
    expect(mapColumns(['البريد الإلكتروني', 'الاسم', 'المسمى الوظيفي', 'رقم الهاتف', 'القسم', 'الصلاحية'])).toEqual({ email: 0, name: 1, title: 2, phone: 3, team: 4, role: 5 });
    expect(mapColumns(['Notes', 'Email'])).toEqual({ email: 1 });
  });
});

describe('roleOf', () => {
  it('reads roles in both languages and defaults to employee', () => {
    expect(roleOf('Admin')).toBe('ADMIN');
    expect(roleOf('مدير')).toBe('MANAGER');
    expect(roleOf('')).toBe('EMPLOYEE');
    expect(roleOf('owner')).toBe('OWNER');
  });
});

describe('parseRows', () => {
  it('checks each row and says what is wrong', () => {
    const { rows } = parseRows([
      [],
      ['Name', 'Email', 'Role'],
      ['Mona', 'Mona@Example.com ', 'admin'],
      ['No email', '', ''],
      ['Bad', 'not-an-email', ''],
      ['Again', 'mona@example.com', ''],
      ['Boss', 'boss@example.com', 'Owner'],
      ['', '', ''],
    ]);
    expect(rows.map((r) => [r.line, r.email, r.role, r.problem])).toEqual([
      [3, 'mona@example.com', 'ADMIN', undefined],
      [4, '', 'EMPLOYEE', 'missingEmail'],
      [5, 'not-an-email', 'EMPLOYEE', 'badEmail'],
      [6, 'mona@example.com', 'EMPLOYEE', 'duplicate'],
      [7, 'boss@example.com', 'EMPLOYEE', 'owner'],
    ]);
  });

  it('puts back the 0 Excel drops from Egyptian mobile numbers', () => {
    const { rows } = parseRows([['Email', 'Phone'], ['a@b.co', 1001234567], ['c@d.co', 971501234567]]);
    expect(rows.map((r) => r.phone)).toEqual(['01001234567', '971501234567']);
  });

  it('stops at 500 people and says so', () => {
    const table = [['Email'], ...Array.from({ length: 501 }, (_, i) => [`p${i}@x.co`])];
    const { rows, tooMany } = parseRows(table);
    expect(rows).toHaveLength(500);
    expect(tooMany).toBe(true);
  });
});

describe('parseCsv', () => {
  it('reads quotes, commas inside them, and Excel’s semicolons', () => {
    expect(parseCsv('﻿Name,Email\r\n"Adel, Omar",omar@x.co\r\n"Say ""hi""",a@b.co\n')).toEqual([
      ['Name', 'Email'],
      ['Adel, Omar', 'omar@x.co'],
      ['Say "hi"', 'a@b.co'],
    ]);
    expect(parseCsv('Name;Email\nMona;m@x.co')).toEqual([['Name', 'Email'], ['Mona', 'm@x.co']]);
  });

  it('reads back its own template', () => {
    const { rows, columns } = parseRows(parseCsv(templateCsv('ar')));
    expect(Object.keys(columns).sort()).toEqual(['email', 'name', 'phone', 'role', 'team', 'title']);
    expect(rows.map((r) => [r.email, r.role, r.phone])).toEqual([
      ['mariam@company.com', 'MANAGER', '01001234567'],
      ['omar@company.com', 'EMPLOYEE', '01112345678'],
    ]);
  });
});
