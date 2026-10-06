import { LEAD_IMPORT_MAX, type ImportLeadRow } from '@vertex/shared';

/**
 * Turns a spreadsheet of leads into rows the API can check and import.
 * Columns are found by their header, in English or Arabic, in any order:
 * the headers of the leads export, and those other CRMs and contact files
 * use. Stage names are matched to the pipeline in either language.
 */

export type LeadField = 'name' | 'firstName' | 'lastName' | 'email' | 'phone' | 'company' | 'title' | 'note' | 'stage' | 'value' | 'temperature' | 'owner' | 'createdOn';

export interface ParsedLead {
  row: ImportLeadRow;
  /** What the page could not read, before asking the server. */
  problem?: 'badDate';
}

const HEADERS: Record<LeadField, string[]> = {
  name: ['name', 'fullname', 'contact', 'contactname', 'lead', 'leadname', 'client', 'customer', 'الاسم', 'الاسمالكامل', 'العميل', 'اسمالعميل', 'جهةالاتصال'],
  firstName: ['firstname', 'givenname', 'first', 'الاسمالأول', 'الاسمالاول'],
  lastName: ['lastname', 'surname', 'familyname', 'last', 'اسمالعائلة', 'الاسمالأخير', 'الاسمالاخير', 'اللقب'],
  email: ['email', 'e-mail', 'emailaddress', 'mail', 'البريد', 'البريدالإلكتروني', 'البريدالالكتروني', 'الايميل', 'الإيميل', 'ايميل', 'إيميل'],
  phone: ['phone', 'mobile', 'phonenumber', 'mobilenumber', 'mobilephone', 'whatsapp', 'tel', 'telephone', 'cell', 'الهاتف', 'رقمالهاتف', 'الموبايل', 'رقمالموبايل', 'الجوال', 'رقمالجوال', 'واتساب', 'الواتساب', 'التليفون', 'الرقم'],
  company: ['company', 'companyname', 'organization', 'organisation', 'account', 'accountname', 'business', 'الشركة', 'اسمالشركة', 'المؤسسة', 'الجهة'],
  title: ['title', 'jobtitle', 'position', 'designation', 'role', 'المسمى', 'المسمىالوظيفي', 'الوظيفة', 'المنصب'],
  note: ['note', 'notes', 'comment', 'comments', 'description', 'details', 'ملاحظة', 'ملاحظات', 'تعليق', 'تفاصيل', 'الوصف'],
  stage: ['stage', 'status', 'pipelinestage', 'leadstatus', 'dealstage', 'المرحلة', 'الحالة'],
  value: ['value', 'dealvalue', 'amount', 'budget', 'revenue', 'expectedrevenue', 'القيمة', 'قيمةالصفقة', 'المبلغ', 'الميزانية'],
  temperature: ['temperature', 'interest', 'rating', 'priority', 'الاهتمام', 'الحرارة', 'التقييم', 'الأولوية', 'الاولوية'],
  owner: ['owner', 'assignedto', 'assignee', 'salesperson', 'rep', 'leadowner', 'المسؤول', 'المسئول', 'مسندإلى', 'مسندالى', 'البائع', 'الموظف'],
  createdOn: ['added', 'created', 'createdat', 'createdon', 'createddate', 'date', 'dateadded', 'تاريخالإضافة', 'تاريخالاضافة', 'التاريخ', 'تاريخالإنشاء', 'تاريخالانشاء'],
};

const ARABIC_DIGITS = /[٠-٩]/g;
const toLatin = (s: string) => s.replace(ARABIC_DIGITS, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

export const norm = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[\s_\-:.()/#*]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .trim();

const LOOKUP = new Map<string, LeadField>();
for (const [field, names] of Object.entries(HEADERS) as [LeadField, string[]][]) {
  for (const n of names) LOOKUP.set(norm(n), field);
}

/** Which column holds which field; unknown columns are left out. */
export function mapLeadColumns(header: unknown[]): Partial<Record<LeadField, number>> {
  const out: Partial<Record<LeadField, number>> = {};
  header.forEach((h, i) => {
    const f = LOOKUP.get(norm(h));
    if (f && out[f] === undefined) out[f] = i;
  });
  return out;
}

/** Whether the sheet has a column that says who a row is. */
export function identifies(columns: Partial<Record<LeadField, number>>): boolean {
  return ['name', 'firstName', 'lastName', 'email', 'phone'].some((f) => columns[f as LeadField] !== undefined);
}

function text(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

/** Excel stores 01001234567 as the number 1001234567; put the 0 back. */
function phoneText(v: unknown): string {
  if (typeof v === 'number') {
    const s = Number.isInteger(v) ? v.toFixed(0) : String(v);
    return /^1[0125]\d{8}$/.test(s) ? `0${s}` : s;
  }
  return text(v);
}

/** "EGP 12,500", "١٢٫٥٠٠", "12.500,00": a whole amount, or nothing. */
export function parseValue(v: unknown): number | undefined {
  if (typeof v === 'number') return v >= 0 && Number.isFinite(v) ? Math.round(v) : undefined;
  let s = toLatin(text(v)).replace(/٫/g, '.').replace(/٬/g, ',').replace(/[^\d.,]/g, '');
  if (!s) return undefined;
  if (s.includes('.') && s.includes(',')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

export function parseTemperature(v: unknown): ImportLeadRow['temperature'] {
  const s = norm(v);
  if (!s) return undefined;
  if (['hot', 'high', 'ساخن', 'حار', 'عالي', 'مرتفع'].includes(s)) return 'HOT';
  if (['warm', 'medium', 'دافئ', 'دافي', 'متوسط'].includes(s)) return 'WARM';
  if (['cold', 'low', 'بارد', 'منخفض'].includes(s)) return 'COLD';
  return undefined;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A day as YYYY-MM-DD, from an Excel date, its serial number, or text
 * (2025-03-01, 1/3/2025 read day first as written in Egypt). Empty: undefined;
 * unreadable: null.
 */
export function parseDay(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const s = toLatin(String(v).trim());
  if (!s) return undefined;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return valid(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return valid(+m[3]!, +m[2]!, +m[1]!);
  return null;
}

function valid(y: number, mo: number, d: number): string | null {
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? `${y}-${pad(mo)}-${pad(d)}` : null;
}

/** A pipeline stage and every name it may go by in a file. */
export interface StageNames {
  id: string;
  names: string[];
}

const clip = (s: string, max: number) => (s ? s.slice(0, max) : undefined);

/** The rows of a sheet (header first) as leads, each with its line in the file. */
export function parseLeadRows(table: unknown[][], stages: StageNames[]): { leads: ParsedLead[]; columns: Partial<Record<LeadField, number>>; tooMany: boolean } {
  const headerAt = table.findIndex((r) => r.some((c) => text(c) !== ''));
  if (headerAt < 0) return { leads: [], columns: {}, tooMany: false };
  const columns = mapLeadColumns(table[headerAt]!);
  const cell = (r: unknown[], f: LeadField) => (columns[f] === undefined ? undefined : r[columns[f]!]);
  const stageByName = new Map<string, string>();
  for (const s of stages) for (const n of s.names) if (n) stageByName.set(norm(n), s.id);

  const leads: ParsedLead[] = [];
  table.slice(headerAt + 1).forEach((r, i) => {
    if (!r.some((c) => text(c) !== '')) return;
    const name = text(cell(r, 'name')) || [text(cell(r, 'firstName')), text(cell(r, 'lastName'))].filter(Boolean).join(' ');
    const stage = text(cell(r, 'stage'));
    const day = parseDay(cell(r, 'createdOn'));
    const row: ImportLeadRow = {
      line: headerAt + i + 2,
      name: clip(name, 120),
      email: clip(text(cell(r, 'email')), 200),
      phone: clip(phoneText(cell(r, 'phone')), 40),
      company: clip(text(cell(r, 'company')), 120),
      title: clip(text(cell(r, 'title')), 120),
      note: clip(text(cell(r, 'note')), 2000),
      // A stage the pipeline has no such name for is sent as itself: the server says so, and uses the first.
      stageId: stage ? stageByName.get(norm(stage)) ?? `unknown:${stage}`.slice(0, 40) : undefined,
      value: parseValue(cell(r, 'value')),
      temperature: parseTemperature(cell(r, 'temperature')),
      owner: clip(text(cell(r, 'owner')), 200),
      createdOn: day ?? undefined,
    };
    for (const k of Object.keys(row) as (keyof ImportLeadRow)[]) if (row[k] === undefined || row[k] === '') delete row[k];
    leads.push(day === null ? { row, problem: 'badDate' } : { row });
  });
  return { leads: leads.slice(0, LEAD_IMPORT_MAX), columns, tooMany: leads.length > LEAD_IMPORT_MAX };
}

/** A starter file, with headers people will recognise in their language. */
export function leadsTemplateCsv(lang: 'en' | 'ar'): string {
  const rows =
    lang === 'ar'
      ? [
          ['الاسم', 'الشركة', 'البريد الإلكتروني', 'الهاتف', 'المسمى الوظيفي', 'المرحلة', 'الاهتمام', 'القيمة', 'المسؤول', 'تاريخ الإضافة', 'ملاحظات'],
          ['منى عادل', 'شركة النيل', 'mona@nile.com', '01001234567', 'مديرة المشتريات', 'جديد', 'ساخن', '25000', '', '2025-03-01', 'قابلناها في معرض القاهرة'],
          ['عمر سعيد', 'دلتا للتجارة', '', '01112345678', '', 'تم التواصل', 'دافئ', '', '', '', ''],
        ]
      : [
          ['Name', 'Company', 'Email', 'Phone', 'Job title', 'Stage', 'Temperature', 'Value', 'Owner', 'Added', 'Notes'],
          ['Mona Adel', 'Nile Trading', 'mona@nile.com', '+20 100 123 4567', 'Purchasing Manager', 'New', 'Hot', '25000', '', '2025-03-01', 'Met at the Cairo expo'],
          ['Omar Saeed', 'Delta Co', '', '+20 111 234 5678', '', 'Contacted', 'Warm', '', '', '', ''],
        ];
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  // The BOM makes Excel open the Arabic as Arabic.
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}
