/**
 * Turns a spreadsheet of people into rows the API can invite. Columns are
 * found by their header, in English or Arabic, in any order; values are
 * checked here so problems show in the preview before anything is sent.
 */

export type ImportField = 'email' | 'name' | 'title' | 'phone' | 'team' | 'role';
export type ImportRole = 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
export type RowProblem = 'missingEmail' | 'badEmail' | 'owner' | 'duplicate';

export interface ParsedRow {
  line: number;
  email: string;
  name: string;
  title: string;
  phone: string;
  team: string;
  role: ImportRole;
  problem?: RowProblem;
}

export const MAX_ROWS = 500;

const HEADERS: Record<ImportField, string[]> = {
  email: ['email', 'e-mail', 'emailaddress', 'mail', 'البريد', 'البريدالإلكتروني', 'البريدالالكتروني', 'الايميل', 'الإيميل', 'ايميل', 'إيميل'],
  name: ['name', 'fullname', 'employee', 'employeename', 'الاسم', 'الاسمالكامل', 'اسمالموظف', 'الموظف'],
  title: ['title', 'jobtitle', 'position', 'role title', 'designation', 'المسمى', 'المسمىالوظيفي', 'الوظيفة', 'المنصب'],
  phone: ['phone', 'mobile', 'phonenumber', 'mobilenumber', 'whatsapp', 'tel', 'الهاتف', 'رقمالهاتف', 'الموبايل', 'رقمالموبايل', 'الجوال', 'رقمالجوال', 'واتساب', 'الواتساب', 'التليفون'],
  team: ['team', 'department', 'dept', 'group', 'الفريق', 'القسم', 'الإدارة', 'الادارة', 'المجموعة'],
  role: ['role', 'access', 'permission', 'الدور', 'الصلاحية', 'الصلاحيات'],
};

const norm = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[\s_\-:.()]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .trim();

const LOOKUP = new Map<string, ImportField>();
for (const [field, names] of Object.entries(HEADERS) as [ImportField, string[]][]) {
  for (const n of names) LOOKUP.set(norm(n), field);
}

/** Which column holds which field; unknown columns are ignored. */
export function mapColumns(header: unknown[]): Partial<Record<ImportField, number>> {
  const out: Partial<Record<ImportField, number>> = {};
  header.forEach((h, i) => {
    const f = LOOKUP.get(norm(h));
    if (f && out[f] === undefined) out[f] = i;
  });
  return out;
}

export function roleOf(v: string): ImportRole | 'OWNER' {
  const s = norm(v);
  if (['owner', 'مالك', 'المالك'].includes(s)) return 'OWNER';
  if (['admin', 'administrator', 'مسؤول', 'مسئول', 'ادمن', 'مشرف'].includes(s)) return 'ADMIN';
  if (['manager', 'مدير', 'مديرفريق'].includes(s)) return 'MANAGER';
  return 'EMPLOYEE';
}

/** Excel stores 01001234567 as the number 1001234567; put the 0 back. */
function cellText(v: unknown, field: ImportField): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  let s = String(v).trim();
  if (field === 'phone' && typeof v === 'number') {
    s = Number.isInteger(v) ? v.toFixed(0) : String(v);
    if (/^1[0125]\d{8}$/.test(s)) s = `0${s}`;
  }
  return s;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The rows of a sheet (header first) as people to invite, each checked. */
export function parseRows(table: unknown[][]): { rows: ParsedRow[]; columns: Partial<Record<ImportField, number>>; tooMany: boolean } {
  const headerAt = table.findIndex((r) => r.some((c) => String(c ?? '').trim() !== ''));
  if (headerAt < 0) return { rows: [], columns: {}, tooMany: false };
  const columns = mapColumns(table[headerAt]!);
  const get = (r: unknown[], f: ImportField) => (columns[f] === undefined ? '' : cellText(r[columns[f]!], f));
  const seen = new Set<string>();
  const rows: ParsedRow[] = [];
  table.slice(headerAt + 1).forEach((r, i) => {
    if (!r.some((c) => String(c ?? '').trim() !== '')) return;
    const email = get(r, 'email').toLowerCase().replace(/^mailto:/, '');
    const role = roleOf(get(r, 'role'));
    const row: ParsedRow = {
      line: headerAt + i + 2,
      email,
      name: get(r, 'name'),
      title: get(r, 'title'),
      phone: get(r, 'phone'),
      team: get(r, 'team'),
      role: role === 'OWNER' ? 'EMPLOYEE' : role,
    };
    if (!email) row.problem = 'missingEmail';
    else if (!EMAIL.test(email)) row.problem = 'badEmail';
    else if (role === 'OWNER') row.problem = 'owner';
    else if (seen.has(email)) row.problem = 'duplicate';
    if (email) seen.add(email);
    rows.push(row);
  });
  return { rows: rows.slice(0, MAX_ROWS), columns, tooMany: rows.length > MAX_ROWS };
}

/** A CSV (comma, semicolon or tab separated; quotes as Excel writes them) as a table. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length] as const);
  const sep = counts.sort((a, b) => b[1] - a[1])[0]![0];
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out;
}

/** A starter file, with headers people will recognise in their language. */
export function templateCsv(lang: 'en' | 'ar'): string {
  const rows =
    lang === 'ar'
      ? [
          ['الاسم', 'البريد الإلكتروني', 'المسمى الوظيفي', 'الهاتف', 'الفريق', 'الدور'],
          ['مريم خالد', 'mariam@company.com', 'مديرة المبيعات', '01001234567', 'المبيعات', 'مدير'],
          ['عمر عادل', 'omar@company.com', 'مسؤول حسابات', '01112345678', 'المبيعات', 'موظف'],
        ]
      : [
          ['Name', 'Email', 'Job title', 'Phone', 'Team', 'Role'],
          ['Mariam Khaled', 'mariam@company.com', 'Sales Director', '+20 100 123 4567', 'Sales', 'Manager'],
          ['Omar Adel', 'omar@company.com', 'Account Executive', '+20 111 234 5678', 'Sales', 'Employee'],
        ];
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  // The BOM makes Excel open the Arabic as Arabic.
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}
