'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Mentionable } from '@vertex/shared';
import { authFetch } from '@/lib/client';
import { activeMention, insertMention, matchMembers, splitMentions, type Mention } from '@/lib/mentions';

/** Teammates a lead's notes can name, fetched once per lead while the page is open. */
const cache = new Map<string, Promise<Mentionable[]>>();
function mentionableFor(leadId: string) {
  if (!cache.has(leadId)) cache.set(leadId, authFetch<Mentionable[]>(`/leads/${leadId}/mentionable`).catch(() => (cache.delete(leadId), [])));
  return cache.get(leadId)!;
}

/**
 * A note's text box where typing @ suggests the teammates who can see the
 * lead. Picking one writes "@Name" and remembers who it is; arrow keys and
 * Enter pick, Escape closes the list.
 */
export function MentionInput({
  leadId,
  value,
  onChange,
  picked,
  onPick,
  onSubmit,
  placeholder,
  rows = 3,
  autoFocus,
  className = '',
}: {
  leadId: string;
  value: string;
  onChange: (v: string) => void;
  picked: Mention[];
  onPick: (m: Mention[]) => void;
  onSubmit: () => void;
  placeholder: string;
  rows?: number;
  autoFocus?: boolean;
  className?: string;
}) {
  const { t } = useTranslation('crm');
  const box = useRef<HTMLTextAreaElement>(null);
  const [members, setMembers] = useState<Mentionable[] | null>(null);
  const [typing, setTyping] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (typing && !members) mentionableFor(leadId).then(setMembers);
  }, [typing, members, leadId]);
  useEffect(() => setMembers(null), [leadId]);

  const options = typing && members ? matchMembers(members, typing.query) : [];
  const open = !!typing && options.length > 0;

  function look(el: HTMLTextAreaElement) {
    const found = activeMention(el.value, el.selectionStart ?? el.value.length);
    setTyping(found);
    setActive(0);
  }

  function pick(m: Mentionable) {
    const el = box.current;
    if (!el || !typing) return;
    const next = insertMention(value, typing.start, el.selectionStart ?? value.length, m.name);
    onChange(next.text);
    onPick([...picked.filter((p) => p.id !== m.id), { id: m.id, name: m.name }]);
    setTyping(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  }

  return (
    <div className="relative">
      <textarea
        ref={box}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange(e.target.value);
          look(e.target);
        }}
        onClick={(e) => look(e.currentTarget)}
        onBlur={() => setTimeout(() => setTyping(null), 150)}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              pick(options[active]!);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setTyping(null);
              return;
            }
          }
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onSubmit();
        }}
        placeholder={placeholder}
        rows={rows}
        dir="auto"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? `mentions-${leadId}` : undefined}
        className={className}
      />
      {open && (
        <ul
          id={`mentions-${leadId}`}
          role="listbox"
          aria-label={t('mentions.suggestions')}
          className="absolute inset-x-2 top-full z-30 mt-1 max-h-56 overflow-auto rounded-lg bg-surface p-1 shadow-lg ring-1 ring-line"
        >
          {options.map((m, i) => (
            <li
              key={m.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${i === active ? 'bg-elevated text-ink' : 'text-muted'}`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-2xs font-semibold text-accent">
                {m.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{m.name}</span>
              <span className="truncate text-xs text-faint" dir="ltr">
                {m.email}
              </span>
            </li>
          ))}
        </ul>
      )}
      {typing && members && options.length === 0 && !typing.query.includes(' ') && (
        <p className="pointer-events-none absolute inset-x-2 top-full z-30 mt-1 rounded-lg bg-surface px-3 py-2 text-xs text-muted shadow-lg ring-1 ring-line">{t('mentions.none')}</p>
      )}
    </div>
  );
}

/** A note's text with the teammates it names marked out; the reader's own name stands out. */
export function NoteText({ text, mentions, me }: { text: string; mentions: Mention[]; me?: string }) {
  return (
    <>
      {splitMentions(text, mentions).map((part, i) =>
        part.mention ? (
          <span key={i} className={`rounded px-0.5 font-medium ${part.mention.id === me ? 'bg-accent/15 text-accent' : 'text-accent'}`}>
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}
