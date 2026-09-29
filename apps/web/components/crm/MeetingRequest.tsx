'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authDownload, authFetch } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Icon } from '@/components/Icon';
import type { Lead, LeadActivity } from '@/lib/crm';

type Status = 'PENDING' | 'ACCEPTED' | 'DECLINED';
type Decision = 'ACCEPT' | 'DECLINE';

/** The meeting a visitor asked for through the card's form, if any. */
export function meetingRequestOf(activities: LeadActivity[]): LeadActivity | null {
  return (
    activities.find((a) => {
      const m = (a.metadata ?? {}) as Record<string, unknown>;
      return a.type === 'MEETING' && typeof m.meetingAt === 'string' && !m.manual;
    }) ?? null
  );
}

export function meetingStatus(a: LeadActivity): Status {
  const s = (a.metadata as Record<string, unknown> | null)?.status;
  return s === 'ACCEPTED' || s === 'DECLINED' ? s : 'PENDING';
}

const BADGE: Record<Status, string> = {
  PENDING: 'v-badge-warning',
  ACCEPTED: 'v-badge-success',
  DECLINED: 'v-badge-neutral',
};

/**
 * Answer a visitor's meeting request. Accepting emails them a confirmation
 * with a calendar invite; declining emails them a way to pick another time.
 */
export function MeetingRequest({ lead, request, onChange }: { lead: Lead; request: LeadActivity; onChange: (a: LeadActivity) => void }) {
  const { t } = useTranslation('crm');
  const { locale } = useLocale();
  const meta = (request.metadata ?? {}) as Record<string, unknown>;
  const at = new Date(meta.meetingAt as string);
  const status = meetingStatus(request);
  const past = at.getTime() < Date.now();
  const [composing, setComposing] = useState<Decision | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const who = lead.name || lead.email || t('table.unknownLead');

  // In the zone the visitor booked in (the card's), so both sides read the same time.
  const zone = typeof meta.timezone === 'string' ? meta.timezone : undefined;
  const when = formatWhen(at, locale, zone);

  async function send(decision: Decision) {
    setBusy(true);
    setResult(null);
    try {
      const res = await authFetch<{ activity: LeadActivity; emailed: boolean }>(`/leads/${lead.id}/meeting`, {
        method: 'POST',
        body: JSON.stringify({ decision, ...(message.trim() ? { message: message.trim() } : {}) }),
      });
      onChange(res.activity);
      setComposing(null);
      setMessage('');
      const done = decision === 'ACCEPT' ? 'accepted' : 'declined';
      setResult({ kind: 'ok', text: res.emailed ? t(`meeting.${done}Emailed`, { email: lead.email }) : t(`meeting.${done}NoEmail`) });
    } catch (e) {
      const m = (e as Error).message;
      setResult({
        kind: 'error',
        text: /passed/i.test(m) ? t('meeting.errors.passed') : /someone else/i.test(m) ? t('meeting.errors.taken') : t('meeting.errors.generic'),
      });
    } finally {
      setBusy(false);
    }
  }

  const waText =
    status === 'ACCEPTED'
      ? t('meeting.waAccepted', { name: lead.name ?? '', when })
      : status === 'DECLINED'
        ? t('meeting.waDeclined', { name: lead.name ?? '', when })
        : '';
  const wa = lead.phone && !lead.email && status !== 'PENDING' ? `https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(waText)}` : null;

  return (
    <section className="mt-4 rounded-xl ring-1 ring-inset ring-line" aria-labelledby="meeting-title">
      <div className="flex items-start gap-3 p-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-elevated text-ink ring-1 ring-inset ring-line">
          <Icon name="calendar" size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="meeting-title" className="text-[13.5px] font-semibold text-ink">
              {t('meeting.title')}
            </h3>
            <span className={`v-badge ${BADGE[status]}`}>{t(`meeting.status.${past && status === 'PENDING' ? 'PASSED' : status}`)}</span>
          </div>
          <p className={`mt-0.5 text-[13px] ${status === 'DECLINED' ? 'text-faint line-through' : 'text-ink'}`}>{when}</p>
          {typeof meta.note === 'string' && meta.note.trim() && <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted">{meta.note}</p>}
          {typeof meta.reply === 'string' && meta.reply && (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              <span className="text-faint">{t('meeting.yourReply')} </span>
              {meta.reply}
            </p>
          )}
        </div>
      </div>

      {composing ? (
        <div className="border-t border-line p-3.5">
          <label htmlFor="meeting-message" className="block text-[12.5px] font-medium text-ink">
            {t('meeting.messageLabel', { name: who })}
          </label>
          <textarea
            id="meeting-message"
            className="v-field mt-1.5 min-h-20"
            value={message}
            maxLength={1000}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={composing === 'ACCEPT' ? t('meeting.acceptPlaceholder') : t('meeting.declinePlaceholder')}
            autoFocus
          />
          {!lead.email && <p className="mt-1.5 text-[12px] text-faint">{t('meeting.noEmailHint')}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={`v-btn ${composing === 'ACCEPT' ? 'v-btn-primary' : ''}`} disabled={busy} onClick={() => send(composing)}>
              {busy ? t('meeting.sending') : composing === 'ACCEPT' ? t('meeting.confirmAccept') : t('meeting.confirmDecline')}
            </button>
            <button type="button" className="v-btn v-btn-ghost" disabled={busy} onClick={() => setComposing(null)}>
              {t('meeting.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 border-t border-line p-3.5">
          {status === 'PENDING' && !past && (
            <>
              <button type="button" className="v-btn v-btn-primary" onClick={() => setComposing('ACCEPT')}>
                <Icon name="check" size={14} />
                {t('meeting.accept')}
              </button>
              <button type="button" className="v-btn v-btn-ghost" onClick={() => setComposing('DECLINE')}>
                {t('meeting.decline')}
              </button>
            </>
          )}
          {status !== 'DECLINED' && (
            <button
              type="button"
              className="v-btn v-btn-ghost"
              onClick={() => authDownload(`/leads/${lead.id}/meeting.ics`, 'meeting.ics').catch(() => setResult({ kind: 'error', text: t('meeting.errors.generic') }))}
            >
              <Icon name="calendar" size={14} />
              {t('meeting.addToCalendar')}
            </button>
          )}
          {wa && (
            <a className="v-btn v-btn-ghost" href={wa} target="_blank" rel="noreferrer">
              <Icon name="whatsapp" size={14} />
              {t('meeting.tellOnWhatsapp')}
            </a>
          )}
          {status === 'ACCEPTED' && !past && (
            <button type="button" className="ms-auto text-[12.5px] font-medium text-muted hover:text-ink" onClick={() => setComposing('DECLINE')}>
              {t('meeting.cancelMeeting')}
            </button>
          )}
          {status === 'DECLINED' && !past && (
            <button type="button" className="ms-auto text-[12.5px] font-medium text-muted hover:text-ink" onClick={() => setComposing('ACCEPT')}>
              {t('meeting.acceptAfterAll')}
            </button>
          )}
        </div>
      )}

      {result && (
        <p role="status" className={`border-t border-line px-3.5 py-2.5 text-[12.5px] ${result.kind === 'error' ? 'text-red-600 dark:text-red-400' : 'text-muted'}`}>
          {result.text}
        </p>
      )}
    </section>
  );
}

function formatWhen(at: Date, locale: string, timeZone?: string) {
  const opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
  const lang = locale === 'ar' ? 'ar-EG' : 'en-GB';
  try {
    return new Intl.DateTimeFormat(lang, { ...opts, timeZone }).format(at);
  } catch {
    return new Intl.DateTimeFormat(lang, opts).format(at); // an unknown zone name
  }
}
