/**
 * Naming teammates with @ in a note. The text keeps "@Name" as written; the
 * people it names travel beside it as ids, so a rename never breaks a note
 * and nothing in the text has to be parsed back.
 */

export interface Mention {
  id: string;
  name: string;
}

/** The "@query" being typed just before the caret, if any: where it starts and what follows the @. */
export function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  // An @ starts a mention only at the start or after a space (not in an email address).
  if (at > 0 && !/\s/.test(before[at - 1]!)) return null;
  const query = before.slice(at + 1);
  // A name is a few words; punctuation or a fourth word means the sentence has moved on.
  if (query.length > 30 || /[\n@]/.test(query) || /\s{2}/.test(query) || /[?!.,;:،؟؛()]/.test(query) || query.split(' ').length > 3) return null;
  return { start: at, query };
}

/** Puts "@Name " in place of the "@query" being typed; where the caret goes after it. */
export function insertMention(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
  const inserted = `@${name} `;
  return { text: text.slice(0, start) + inserted + text.slice(caret), caret: start + inserted.length };
}

/** The people picked whose "@Name" is still in the text, each once. */
export function keptMentions(text: string, picked: Mention[]): Mention[] {
  const seen = new Set<string>();
  return picked.filter((m) => !seen.has(m.id) && text.includes(`@${m.name}`) && seen.add(m.id));
}

/** Teammates whose name or email starts a word with what was typed after @. */
export function matchMembers<T extends { name: string; email: string }>(members: T[], query: string, limit = 6): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return members.slice(0, limit);
  return members
    .filter((m) => m.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || m.name.toLowerCase().startsWith(q) || m.email.toLowerCase().startsWith(q))
    .slice(0, limit);
}

/** The text in pieces, the named people marked, for showing a note. */
export function splitMentions(text: string, mentions: Mention[]): { text: string; mention?: Mention }[] {
  const names = [...mentions].sort((a, b) => b.name.length - a.name.length);
  if (!names.length) return [{ text }];
  const escaped = names.map((m) => `@${m.name}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'g'));
  return parts.filter((p) => p !== '').map((p) => {
    const m = names.find((n) => `@${n.name}` === p);
    return m ? { text: p, mention: m } : { text: p };
  });
}
