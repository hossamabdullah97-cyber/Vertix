'use client';

import { useEffect, useState } from 'react';
import { SUPPORT_TOPICS, type SupportRequestView, type SupportTopic } from '@vertex/shared';
import { authFetch } from '@/lib/client';
import { lastPage } from '@/lib/support';
import { HELP, type HelpCategory, type HelpLocale } from '@/lib/help';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';

/** The topic a help category's questions are usually about. */
export const TOPIC_OF: Record<HelpCategory, SupportTopic> = {
  start: 'other',
  cards: 'cards',
  sharing: 'chips',
  leads: 'leads',
  team: 'team',
  integrations: 'integrations',
  billing: 'billing',
  account: 'account',
};

/**
 * Writing to the people who run the platform: a topic, a subject and what
 * happened. They answer by email; the person gets a copy with its reference.
 */
export function ContactSupport({
  open,
  onClose,
  locale,
  email,
  topic: initialTopic = 'other',
  subject: initialSubject = '',
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  locale: HelpLocale;
  email?: string;
  topic?: SupportTopic;
  subject?: string;
  onSent?: (r: SupportRequestView) => void;
}) {
  const ui = HELP[locale].ui;
  const [topic, setTopic] = useState<SupportTopic>(initialTopic);
  const [subject, setSubject] = useState(initialSubject);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<SupportRequestView | null>(null);

  useEffect(() => {
    if (!open) return;
    setTopic(initialTopic);
    setSubject(initialSubject);
    setMessage('');
    setError('');
    setSent(null);
  }, [open, initialTopic, initialSubject]);

  const ready = subject.trim().length >= 3 && message.trim().length >= 10;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await authFetch<SupportRequestView>('/support/requests', {
        method: 'POST',
        body: JSON.stringify({ topic, subject: subject.trim(), message: message.trim(), page: lastPage(), lang: locale }),
      });
      setSent(r);
      onSent?.(r);
    } catch (err) {
      setError((err as { status?: number }).status === 429 ? ui.tooMany : ui.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} closeLabel={ui.close} title={sent ? ui.sentTitle : ui.formTitle} subtitle={sent ? undefined : ui.formSubtitle}>
      {sent ? (
        <div role="status" className="rounded-xl bg-emerald-500/[0.07] p-5 ring-1 ring-inset ring-emerald-500/25">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" aria-hidden>
            <Icon name="check" size={18} />
          </span>
          <p className="mt-3 text-sm leading-relaxed text-ink">
            {ui.sentBody.replace('{{ref}}', sent.ref).replace('{{email}}', email ?? '')}
          </p>
          <button type="button" onClick={onClose} className="v-btn mt-4">
            {ui.close}
          </button>
        </div>
      ) : (
        <form onSubmit={send} className="space-y-4">
          {error && (
            <p role="alert" className="rounded-lg bg-red-500/[0.07] px-3 py-2.5 text-xs leading-relaxed text-red-700 dark:text-red-300">
              {error}
            </p>
          )}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink">{ui.topic}</span>
            <select className="v-field w-full" value={topic} onChange={(e) => setTopic(e.target.value as SupportTopic)}>
              {SUPPORT_TOPICS.map((id) => (
                <option key={id} value={id}>
                  {ui.topics[id]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink">{ui.subject}</span>
            <input className="v-field w-full" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={140} placeholder={ui.subjectPlaceholder} dir={subject ? 'auto' : undefined} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink">{ui.message}</span>
            <textarea
              className="v-field min-h-[160px] w-full"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={5000}
              placeholder={ui.messagePlaceholder}
              dir={message ? 'auto' : undefined}
            />
            <span className="mt-1 block text-xs text-faint">{ui.messageHint}</span>
          </label>
          {email && <p className="text-xs text-muted">{ui.replyBy.replace('{{email}}', email)}</p>}
          <div className="flex gap-2">
            <button className="v-btn v-btn-primary disabled:opacity-50" disabled={!ready || busy}>
              <Icon name="send" size={14} /> {busy ? ui.sending : ui.send}
            </button>
            <button type="button" onClick={onClose} className="v-btn v-btn-ghost">
              {ui.cancel}
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
