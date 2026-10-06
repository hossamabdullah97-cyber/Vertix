import type { CustomFieldDef } from '@vertex/shared';
import type { Lead, Stage } from './crm';

/**
 * Leads as a CSV that opens straight in Excel: the BOM keeps Arabic readable,
 * dates are plain (YYYY-MM-DD HH:mm) and numbers stay numbers. Labels come
 * from the caller, so the file is in the language the page is in.
 */

export interface ExportLabels {
  headers: { name: string; company: string; email: string; phone: string; stage: string; temperature: string; value: string; source: string; card: string; added: string };
  stage: (s: Stage) => string;
  temperature: (t: Lead['temperature']) => string;
  source: (s: string) => string;
  /** The workspace's own fields, a column each after the standard ones; a checkbox reads as these words. */
  fields?: CustomFieldDef[];
  yesNo?: [string, string];
}

/** Cells that start like a formula are made plain text, so opening the file runs nothing. */
export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // A phone number (+20 100 …) is only digits and spacing, so it cannot run.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^[+\-]?[\d\s().-]+$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const pad = (n: number) => String(n).padStart(2, '0');
const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function leadsCsv(leads: Lead[], stages: Stage[], l: ExportLabels): string {
  const byId = new Map(stages.map((s) => [s.id, s]));
  const h = l.headers;
  const fields = l.fields ?? [];
  const yesNo = l.yesNo ?? ['Yes', 'No'];
  const rows: (string | number | null)[][] = [[h.name, h.company, h.email, h.phone, h.stage, h.temperature, h.value, h.source, h.card, h.added, ...fields.map((f) => f.label)]];
  for (const lead of leads) {
    const stage = lead.stageId ? byId.get(lead.stageId) : undefined;
    rows.push([
      lead.name,
      lead.company,
      lead.email,
      lead.phone,
      stage ? l.stage(stage) : '',
      l.temperature(lead.temperature),
      lead.value || 0,
      lead.source ? l.source(lead.source) : '',
      lead.card ? `/c/${lead.card.slug}` : '',
      when(lead.createdAt),
      ...fields.map((f) => {
        const v = lead.customFields?.[f.id];
        return v === undefined || v === null ? '' : f.type === 'CHECKBOX' ? (v ? yesNo[0] : yesNo[1]) : typeof v === 'number' ? v : String(v);
      }),
    ]);
  }
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function downloadText(text: string, filename: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
