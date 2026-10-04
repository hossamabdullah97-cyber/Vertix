'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Icon } from '@/components/Icon';
import { Field, Notice, SheetSection, Toggle, eventLabel, iso } from './shared';

/** Apps that post to a chat or a channel (ChannelsService in the API), set up here rather than through OAuth. */
export const CHANNEL_APPS = new Set(['telegram', 'ms_teams']);

interface Settings {
  connected: boolean;
  status: string;
  account: string | null;
  lastError: string | null;
  events: string[];
  lang: 'en' | 'ar';
  available: string[];
}
interface Chat {
  id: string;
  title: string;
  type: string;
}

/** What a channel is told and in which language: the same controls when connecting and after. */
function WhatToSend({
  available,
  events,
  lang,
  disabled,
  onEvents,
  onLang,
}: {
  available: string[];
  events: string[];
  lang: 'en' | 'ar';
  disabled?: boolean;
  onEvents: (e: string[]) => void;
  onLang: (l: 'en' | 'ar') => void;
}) {
  const { t } = useTranslation('integrations');
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-medium text-ink">{t('apps.channel.events')}</p>
        <ul className="divide-y divide-line rounded-lg ring-1 ring-inset ring-line">
          {available.map((e) => {
            const on = events.includes(e);
            return (
              <li key={e} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-sm text-ink">{eventLabel(t, e)}</span>
                <Toggle on={on} disabled={disabled} label={eventLabel(t, e)} onChange={() => onEvents(on ? events.filter((x) => x !== e) : [...events, e])} />
              </li>
            );
          })}
        </ul>
      </div>
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-ink">{t('apps.channel.lang')}</legend>
        <div className="flex gap-2">
          {(['ar', 'en'] as const).map((l) => (
            <label key={l} className={`flex h-11 flex-1 cursor-pointer items-center justify-center rounded-lg text-sm ring-1 ring-inset sm:h-9 ${lang === l ? 'bg-accent/10 font-medium text-ink ring-accent' : 'text-muted ring-line'}`}>
              <input type="radio" name="channel-lang" value={l} checked={lang === l} disabled={disabled} onChange={() => onLang(l)} className="sr-only" />
              {t(`apps.channel.langs.${l}`)}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/** Connecting Telegram (a bot and one of its chats) or Teams (a Workflows link). */
export function ChannelSetup({ appKey, appName, onConnected }: { appKey: string; appName: string; onConnected: () => void }) {
  const { t } = useTranslation('integrations');
  const { locale } = useLocale();
  const [token, setToken] = useState('');
  const [bot, setBot] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [chatId, setChatId] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['lead.created']);
  const [lang, setLang] = useState<'en' | 'ar'>(locale === 'ar' ? 'ar' : 'en');
  const [available, setAvailable] = useState<string[]>(['lead.created', 'meeting.requested', 'quote.requested', 'contact.saved', 'nfc.tapped', 'member.added']);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    authFetch<Settings>(`/integrations/${appKey}/channel`)
      .then((s) => setAvailable(s.available))
      .catch(() => undefined);
  }, [appKey]);

  async function findChats(e?: React.FormEvent) {
    e?.preventDefault();
    setError('');
    setBusy('chats');
    try {
      const r = await authFetch<{ bot: string; chats: Chat[] }>('/integrations/telegram/chats', { method: 'POST', body: JSON.stringify({ botToken: token.trim() }) });
      setBot(r.bot);
      setChats(r.chats);
      if (!r.chats.some((c) => c.id === chatId)) setChatId(r.chats[0]?.id ?? '');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy('connect');
    try {
      const chat = chats?.find((c) => c.id === chatId);
      await authFetch(`/integrations/${appKey}/channel`, {
        method: 'PUT',
        body: JSON.stringify(appKey === 'telegram' ? { botToken: token.trim(), chatId, chatTitle: chat?.title, lang, events } : { url: url.trim(), lang, events }),
      });
      onConnected();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  const steps = (keys: string[], values: Record<string, string> = {}) => (
    <ol className="list-decimal space-y-1.5 ps-5 text-sm leading-relaxed text-ink marker:text-faint">
      {keys.map((k) => (
        <li key={k}>{t(k, values)}</li>
      ))}
    </ol>
  );

  if (appKey === 'telegram') {
    return (
      <SheetSection title={t('apps.channel.setUp', { name: appName })}>
        <div className="space-y-5">
          {error && <Notice tone="danger" icon="x">{error}</Notice>}
          {steps(['apps.channel.telegram.step1', 'apps.channel.telegram.step2'])}
          <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
            {t('apps.channel.telegram.openBotFather')} <Icon name="external-link" size={13} />
          </a>
          <form onSubmit={findChats} className="space-y-3">
            <Field label={t('apps.channel.telegram.token')} htmlFor="tg-token" hint={t('apps.channel.telegram.tokenHint')}>
              <input id="tg-token" dir="ltr" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456789:AA…" className="v-field w-full font-mono text-sm" />
            </Field>
            <button type="submit" disabled={!token.trim() || !!busy} className="v-btn v-btn-ghost disabled:opacity-60">
              {busy === 'chats' ? t('apps.channel.telegram.checking') : bot ? t('apps.channel.telegram.refresh') : t('apps.channel.telegram.check')}
            </button>
          </form>

          {bot !== null && (
            <form onSubmit={connect} className="space-y-5">
              <div className="space-y-3">
                <p className="text-sm text-ink">{t('apps.channel.telegram.addBot', { bot: iso(`@${bot}`) })}</p>
                {chats && chats.length > 0 ? (
                  <fieldset>
                    <legend className="mb-2 text-xs font-medium text-ink">{t('apps.channel.telegram.chat')}</legend>
                    <div className="space-y-1.5">
                      {chats.map((c) => (
                        <label key={c.id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ring-1 ring-inset ${chatId === c.id ? 'ring-accent' : 'ring-line'}`}>
                          <input type="radio" name="tg-chat" value={c.id} checked={chatId === c.id} onChange={() => setChatId(c.id)} className="accent-[hsl(var(--v-accent))]" />
                          <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.title}</span>
                          <span className="shrink-0 text-xs text-faint">{t(`apps.channel.telegram.types.${c.type}`, { defaultValue: c.type })}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : (
                  <Notice icon="info">{t('apps.channel.telegram.noChats')}</Notice>
                )}
              </div>
              {chats && chats.length > 0 && (
                <>
                  <WhatToSend available={available} events={events} lang={lang} onEvents={setEvents} onLang={setLang} />
                  <button type="submit" disabled={!chatId || !events.length || !!busy} className="v-btn w-full disabled:opacity-60 sm:w-auto">
                    {busy === 'connect' ? t('apps.channel.connecting') : t('apps.channel.connect')}
                  </button>
                </>
              )}
            </form>
          )}
        </div>
      </SheetSection>
    );
  }

  return (
    <SheetSection title={t('apps.channel.setUp', { name: appName })}>
      <form onSubmit={connect} className="space-y-5">
        {error && <Notice tone="danger" icon="x">{error}</Notice>}
        {steps(['apps.channel.teams.step1', 'apps.channel.teams.step2', 'apps.channel.teams.step3'])}
        <Field label={t('apps.channel.teams.url')} htmlFor="teams-url" hint={t('apps.channel.teams.urlHint')}>
          <input id="teams-url" dir="ltr" type="url" autoComplete="off" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…logic.azure.com/workflows/…" className="v-field w-full font-mono text-sm" />
        </Field>
        <WhatToSend available={available} events={events} lang={lang} onEvents={setEvents} onLang={setLang} />
        <button type="submit" disabled={!url.trim() || !events.length || !!busy} className="v-btn w-full disabled:opacity-60 sm:w-auto">
          {busy === 'connect' ? t('apps.channel.connecting') : t('apps.channel.connect')}
        </button>
      </form>
    </SheetSection>
  );
}

/** A connected channel: what it is told, in which language, and a test message. */
export function ChannelSettings({ appKey, canManage, onChanged }: { appKey: string; canManage: boolean; onChanged: () => void }) {
  const { t } = useTranslation('integrations');
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    authFetch<Settings>(`/integrations/${appKey}/channel`).then(setS).catch((e) => setNote({ tone: 'danger', text: (e as Error).message }));
  }, [appKey]);

  async function save(change: Partial<Pick<Settings, 'events' | 'lang'>>) {
    if (!s) return;
    const before = s;
    setS({ ...s, ...change });
    setNote(null);
    try {
      setS(await authFetch<Settings>(`/integrations/${appKey}/channel`, { method: 'PATCH', body: JSON.stringify(change) }));
    } catch (e) {
      setS(before);
      setNote({ tone: 'danger', text: (e as Error).message });
    }
  }

  async function test() {
    setBusy('test');
    setNote(null);
    try {
      setS(await authFetch<Settings>(`/integrations/${appKey}/channel/test`, { method: 'POST' }));
      setNote({ tone: 'success', text: t('apps.channel.testSent') });
      onChanged();
    } catch (e) {
      setNote({ tone: 'danger', text: (e as Error).message });
    } finally {
      setBusy('');
    }
  }

  if (!s) return <div className="v-skeleton h-40 rounded-lg" />;
  return (
    <SheetSection title={t('apps.channel.settings')}>
      <div className="space-y-5">
        {note && (
          <Notice tone={note.tone} icon={note.tone === 'success' ? 'check' : 'x'} onDismiss={() => setNote(null)}>
            {note.text}
          </Notice>
        )}
        <WhatToSend
          available={s.available}
          events={s.events}
          lang={s.lang}
          disabled={!canManage}
          onEvents={(events) => void save({ events })}
          onLang={(lang) => void save({ lang })}
        />
        {canManage && (
          <button onClick={test} disabled={!!busy} className="v-btn v-btn-ghost disabled:opacity-60">
            <Icon name="send" size={14} /> {busy === 'test' ? t('apps.channel.testing') : t('apps.channel.test')}
          </button>
        )}
      </div>
    </SheetSection>
  );
}
