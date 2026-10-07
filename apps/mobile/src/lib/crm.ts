/** A lead as the API lists it (GET /leads). The same rules as the web (apps/web/lib/crm.ts). */
export interface Lead {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  score: number;
  value: number;
  temperature: 'COLD' | 'WARM' | 'HOT';
  source: string;
  stageId: string | null;
  assignedTo?: string | null;
  firstContactedAt?: string | null;
  lastContactedAt?: string | null;
  lastVisitAt?: string | null;
  createdAt: string;
  card: { slug: string } | null;
}

export interface Stage {
  id: string;
  name: string;
  order: number;
  color?: string | null;
}

export interface Task {
  id: string;
  title: string;
  dueDate: string | null;
  completed: boolean;
  completedAt: string | null;
  leadId: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  createdAt: string;
  lead: { id: string; name: string | null } | null;
}

const HOUR = 3_600_000;
const WAITING_FLAG_HOURS = 24;
const WAITING_GIVE_UP_HOURS = 14 * 24;

/** Hours a lead has waited for anyone to reach out, or null once someone has. */
export function waitingHours(lead: Pick<Lead, 'firstContactedAt' | 'createdAt'>, now = Date.now()): number | null {
  if (lead.firstContactedAt) return null;
  const h = Math.floor((now - new Date(lead.createdAt).getTime()) / HOUR);
  return h >= 0 ? h : 0;
}

/** Whether a lead is flagged as waiting for a reply. */
export function awaitsReply(lead: Pick<Lead, 'firstContactedAt' | 'createdAt'>, now = Date.now()): boolean {
  const h = waitingHours(lead, now);
  return h !== null && h >= WAITING_FLAG_HOURS && h <= WAITING_GIVE_UP_HOURS;
}

/** When the lead came back to a card lately (not the visit they left their details on). */
export function returnedAt(lead: Pick<Lead, 'lastVisitAt' | 'createdAt'>, now = Date.now()): string | null {
  if (!lead.lastVisitAt) return null;
  const at = new Date(lead.lastVisitAt).getTime();
  if (at - new Date(lead.createdAt).getTime() < 30 * 60_000) return null;
  return now - at < 7 * 24 * HOUR ? lead.lastVisitAt : null;
}

/** A wa.me link to the lead's number (Egyptian 01… understood), with a message ready. */
export function whatsappHref(phone: string, text?: string): string | null {
  let d = phone.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (/^01[0125]\d{8}$/.test(d)) d = `20${d.slice(1)}`;
  if (!/^[1-9]\d{7,14}$/.test(d)) return null;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** Leads matching what was typed: name, company, email or phone. */
export function search<T extends Pick<Lead, 'name' | 'company' | 'email' | 'phone'>>(leads: T[], q: string): T[] {
  const s = q.trim().toLowerCase();
  if (!s) return leads;
  const digits = s.replace(/\D/g, '');
  return leads.filter(
    (l) =>
      [l.name, l.company, l.email].some((v) => v?.toLowerCase().includes(s)) ||
      (digits.length >= 3 && (l.phone ?? '').replace(/\D/g, '').includes(digits)),
  );
}

export type LeadFilter = 'all' | 'waiting' | 'hot' | 'back';

export function filterLeads<T extends Lead>(leads: T[], f: LeadFilter, now = Date.now()): T[] {
  switch (f) {
    case 'all':
      return leads;
    case 'waiting':
      return leads.filter((l) => awaitsReply(l, now));
    case 'hot':
      return leads.filter((l) => l.temperature === 'HOT');
    case 'back':
      return leads.filter((l) => returnedAt(l, now));
  }
}
