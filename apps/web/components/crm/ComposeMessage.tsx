'use client';

import { can } from '@/lib/permissions';
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { renderTemplate, TEMPLATE_FIELDS, type TemplateField } from '@vertex/shared';
import { authFetch, getActiveOrgId, peek, type Card, type Me } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Icon } from '@/components/Icon';
import { whatsappHref, type Lead, type LeadActivity } from '@/lib/crm';

export type Channel = 'WHATSAPP' | 'EMAIL';

interface Template {
  id: string;
  name: string;
  channel: Channel;
  subject: string | null;
  body: string;
}

export interface ContactResult {
  activity: LeadActivity;
  firstContactedAt: string | null;
  lastContactedAt: string | null;
}

const MANAGERS = new Set(['OWNER', 'ADMIN', 'MANAGER']);
const firstName = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0] ?? '';

/**
 * Writes to a lead from a ready message: the template filled with the lead's
 * and the sender's details, still editable, then handed to WhatsApp or the
 * mail app to send. Opening it logs the message on the lead, which counts
 * as the contact the follow-up reminders wait for. Managers keep the ready
 * messages here too.
 */
export function ComposeMessage({
  lead,
  initial,
  onClose,
  onSent,
}: {
  lead: Lead;
  initial: Channel;
  onClose: () => void;
  onSent: (r: ContactResult) => void;
}) {
  const { t } = useTranslation('crm');
  const { locale } = useLocale();
  const [channel, setChannel] = useState<Channel>(initial);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [subject, setSubject] = useState('');
  const [me, setMe] = useState<Me | null>(() => peek<Me>('/auth/me') ?? null);
  const [values, setValues] = useState<Partial<Record<TemplateField, string>>>({});
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  const canWhatsApp = !!(lead.phone && whatsappHref(lead.phone));
  const canEmail = !!lead.email;

  const load = () =>
    authFetch<Template[]>(`/message-templates?lang=${locale === 'ar' ? 'ar' : 'en'}`)
      .then(setTemplates)
      .catch(() => setTemplates([]));

  // The templates, and what fills them: the lead, the sender, their card.
  useEffect(() => {
    void load();
    Promise.all([
      authFetch<Me>('/auth/me').catch(() => me),
      authFetch<{ org: { id: string; name: string } }[]>('/orgs').catch(() => []),
      authFetch<Card[]>('/cards').catch(() => [] as Card[]),
    ]).then(([who, orgs, cards]) => {
      if (who) setMe(who);
      const orgId = getActiveOrgId() ?? who?.orgId;
      const org = orgs.find((o) => o.org.id === orgId)?.org;
      const mine = cards.filter((c) => c.ownerId === who?.sub && c.isPublished);
      const card = lead.card ? { slug: lead.card.slug, vcardData: null as Record<string, unknown> | null } : mine[0];
      const myCard = mine.find((c) => c.slug === card?.slug) ?? mine[0];
      const vcard = (myCard?.vcardData ?? {}) as Record<string, unknown>;
      setValues({
        first_name: firstName(lead.name),
        name: lead.name ?? '',
        company: lead.company ?? '',
        my_name: (who?.name as string) || (vcard.fullName as string) || '',
        my_company: org?.name ?? (vcard.company as string) ?? '',
        my_phone: (vcard.phone as string) || '',
        card_link: card ? `${window.location.origin}/c/${card.slug}` : '',
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  const forChannel = useMemo(() => (templates ?? []).filter((tp) => tp.channel === channel), [templates, channel]);

  function pick(tp: Template | null) {
    setTemplateId(tp?.id ?? null);
    setText(tp ? renderTemplate(tp.body, values) : '');
    setSubject(tp?.subject ? renderTemplate(tp.subject, values) : '');
  }

  // The first ready message of the channel, once its fields are known.
  useEffect(() => {
    if (!templates || values.first_name === undefined) return;
    pick(forChannel[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, channel, values]);

  function send() {
    setError('');
    const href =
      channel === 'WHATSAPP'
        ? whatsappHref(lead.phone ?? '', text.trim())
        : `mailto:${encodeURIComponent(lead.email ?? '')}?subject=${encodeURIComponent(subject.trim())}&body=${encodeURIComponent(text.trim())}`;
    if (!href) return;
    // Opened from the tap itself, or the browser blocks the new tab.
    if (channel === 'WHATSAPP') window.open(href, '_blank', 'noopener');
    else window.location.href = href;
    authFetch<ContactResult>(`/leads/${lead.id}/contact`, {
      method: 'POST',
      body: JSON.stringify({ channel, note: text.trim(), subject: channel === 'EMAIL' ? subject.trim() || undefined : undefined, templateId: templateId ?? undefined }),
    })
      .then((r) => {
        onSent(r);
        onClose();
      })
      .catch((e) => setError((e as Error).message || t('compose.logFailed')));
  }

  const isManager = can(me, 'leads', 'basic');

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.16 }}
      role="dialog"
      aria-label={t('compose.title')}
      className="absolute inset-0 z-20 flex flex-col bg-surface sm:rounded-[14px]"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-2">
        <button
          type="button"
          onClick={editing ? () => setEditing(false) : onClose}
          aria-label={t('compose.back')}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-elevated hover:text-ink sm:h-9 sm:w-9"
        >
          <Icon name="arrow-left" size={16} className="rtl:rotate-180" />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
          {editing ? t('compose.manageTitle') : t('compose.to', { name: lead.name || t('table.unknownLead') })}
        </p>
        {!editing && isManager && (
          <button type="button" onClick={() => setEditing(true)} className="v-hit me-2 text-xs font-medium text-accent hover:underline">
            {t('compose.manage')}
          </button>
        )}
      </div>

      {editing ? (
        <TemplatesEditor templates={templates ?? []} onChange={load} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
          <div role="tablist" className="grid grid-cols-2 gap-1 rounded-[10px] bg-elevated p-1">
            {(['WHATSAPP', 'EMAIL'] as const).map((c) => {
              const ok = c === 'WHATSAPP' ? canWhatsApp : canEmail;
              return (
                <button
                  key={c}
                  role="tab"
                  type="button"
                  aria-selected={channel === c}
                  disabled={!ok}
                  onClick={() => setChannel(c)}
                  className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 ${
                    channel === c ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
                  }`}
                >
                  <Icon name={c === 'WHATSAPP' ? 'whatsapp' : 'mail'} size={14} />
                  {c === 'WHATSAPP' ? t('compose.whatsapp') : t('compose.email')}
                </button>
              );
            })}
          </div>
          {!(channel === 'WHATSAPP' ? canWhatsApp : canEmail) && (
            <p className="mt-3 text-xs text-muted">{channel === 'WHATSAPP' ? t('compose.noPhone') : t('compose.noEmail')}</p>
          )}

          <p className="mt-5 text-xs font-medium text-muted">{t('compose.ready')}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {templates === null ? (
              <span className="v-skeleton h-9 w-40 rounded-full" />
            ) : (
              <>
                {forChannel.map((tp) => (
                  <button
                    key={tp.id}
                    type="button"
                    onClick={() => pick(tp)}
                    aria-pressed={templateId === tp.id}
                    className={`min-h-9 rounded-full px-3.5 text-xs font-medium ring-1 ring-inset transition-colors ${
                      templateId === tp.id ? 'bg-accent text-white ring-accent' : 'text-ink ring-line hover:bg-elevated'
                    }`}
                  >
                    {tp.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => pick(null)}
                  aria-pressed={templateId === null}
                  className={`min-h-9 rounded-full px-3.5 text-xs font-medium ring-1 ring-inset transition-colors ${
                    templateId === null ? 'bg-accent text-white ring-accent' : 'text-muted ring-line hover:bg-elevated'
                  }`}
                >
                  {t('compose.blank')}
                </button>
              </>
            )}
          </div>

          {channel === 'EMAIL' && (
            <label className="mt-5 block">
              <span className="text-xs font-medium text-muted">{t('compose.subject')}</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} dir="auto" className="v-field mt-1.5 w-full" />
            </label>
          )}
          <label className="mt-4 flex min-h-0 flex-1 flex-col">
            <span className="text-xs font-medium text-muted">{t('compose.message')}</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              dir="auto"
              rows={8}
              className="v-field mt-1.5 min-h-[180px] w-full flex-1 resize-none py-2.5 leading-relaxed"
            />
          </label>
          <p className="mt-2 text-xs leading-relaxed text-faint">{t('compose.hint')}</p>
          {error && (
            <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      )}

      {!editing && (
        <div className="shrink-0 border-t border-line p-4">
          <button
            type="button"
            onClick={send}
            disabled={!text.trim() || !(channel === 'WHATSAPP' ? canWhatsApp : canEmail)}
            className="v-btn !h-12 w-full gap-2 text-base font-semibold disabled:opacity-50 sm:!h-11"
          >
            <Icon name={channel === 'WHATSAPP' ? 'whatsapp' : 'mail'} size={17} />
            {channel === 'WHATSAPP' ? t('compose.openWhatsapp') : t('compose.openEmail')}
          </button>
        </div>
      )}
    </motion.div>
  );
}

/** Managers' list of the workspace's ready messages: add, change, remove. */
function TemplatesEditor({ templates, onChange }: { templates: Template[]; onChange: () => Promise<void> | void }) {
  const { t } = useTranslation('crm');
  const [draft, setDraft] = useState<(Omit<Template, 'id'> & { id?: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      const body = JSON.stringify({ name: draft.name, channel: draft.channel, subject: draft.channel === 'EMAIL' ? draft.subject : null, body: draft.body });
      if (draft.id) await authFetch(`/message-templates/${draft.id}`, { method: 'PATCH', body });
      else await authFetch('/message-templates', { method: 'POST', body });
      setDraft(null);
      await onChange();
    } catch (e) {
      setError((e as Error).message || t('compose.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await authFetch(`/message-templates/${id}`, { method: 'DELETE' });
      setDraft(null);
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  if (draft) {
    const insert = (field: string) => setDraft((d) => (d ? { ...d, body: `${d.body}${d.body && !d.body.endsWith(' ') ? ' ' : ''}{{${field}}}` } : d));
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
        <label className="block">
          <span className="text-xs font-medium text-muted">{t('compose.name')}</span>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} dir="auto" className="v-field mt-1.5 w-full" />
        </label>
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-[10px] bg-elevated p-1">
          {(['WHATSAPP', 'EMAIL'] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={draft.channel === c}
              onClick={() => setDraft({ ...draft, channel: c })}
              className={`min-h-10 rounded-lg text-sm font-medium ${draft.channel === c ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
            >
              {c === 'WHATSAPP' ? t('compose.whatsapp') : t('compose.email')}
            </button>
          ))}
        </div>
        {draft.channel === 'EMAIL' && (
          <label className="mt-4 block">
            <span className="text-xs font-medium text-muted">{t('compose.subject')}</span>
            <input value={draft.subject ?? ''} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} dir="auto" className="v-field mt-1.5 w-full" />
          </label>
        )}
        <label className="mt-4 block">
          <span className="text-xs font-medium text-muted">{t('compose.message')}</span>
          <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} dir="auto" rows={7} className="v-field mt-1.5 w-full resize-none py-2.5 leading-relaxed" />
        </label>
        <p className="mt-3 text-xs text-muted">{t('compose.fields')}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {TEMPLATE_FIELDS.map((f) => (
            <button key={f} type="button" onClick={() => insert(f)} className="min-h-8 rounded-md bg-elevated px-2 text-xs text-ink ring-1 ring-inset ring-line hover:bg-canvas">
              {t(`compose.field.${f}`)}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="mt-3 text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="mt-6 flex gap-2">
          <button type="button" onClick={save} disabled={busy || !draft.name.trim() || !draft.body.trim()} className="v-btn flex-1 disabled:opacity-50">
            {busy ? t('compose.saving') : t('compose.save')}
          </button>
          {draft.id && (
            <button type="button" onClick={() => remove(draft.id!)} disabled={busy} className="v-btn v-btn-ghost text-red-600 dark:text-red-400">
              {t('compose.delete')}
            </button>
          )}
          <button type="button" onClick={() => setDraft(null)} className="v-btn v-btn-ghost">
            {t('compose.cancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <p className="px-5 pt-4 text-xs leading-relaxed text-muted">{t('compose.manageHint')}</p>
      <ul className="mt-3 divide-y divide-line border-y border-line">
        {templates.map((tp) => (
          <li key={tp.id}>
            <button type="button" onClick={() => setDraft({ ...tp })} className="flex w-full items-start gap-3 px-5 py-3 text-start hover:bg-elevated">
              <Icon name={tp.channel === 'WHATSAPP' ? 'whatsapp' : 'mail'} size={15} className="mt-0.5 shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{tp.name}</span>
                <span className="mt-0.5 line-clamp-2 block text-xs text-muted" dir="auto">
                  {tp.body}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="p-5">
        <button type="button" onClick={() => setDraft({ name: '', channel: 'WHATSAPP', subject: null, body: '' })} className="v-btn v-btn-ghost w-full gap-1.5">
          <Icon name="plus" size={14} /> {t('compose.add')}
        </button>
      </div>
    </div>
  );
}
