'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/client';
import { Icon } from '@/components/Icon';
import { Field, Notice, SheetSection, eventLabel } from './shared';

/** The events a Zap can start from (apps/api/src/integrations/zapier/zapier.service.ts). */
const ZAP_EVENTS = ['lead.created', 'meeting.requested', 'quote.requested', 'contact.saved', 'card.viewed', 'nfc.tapped'] as const;

interface Hook {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
}

/** Zapier's own hook addresses only. */
export function isZapierHook(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' && /(^|\.)zapier\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Zaps that start from what happens in Vertex: each listens at a "Catch
 * Hook" address from Zapier's Webhooks app (or is made by the Vertex Connect
 * app in Zapier). And how a Zap acts in Vertex: with an API key.
 */
export function ZapierSetup({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation('integrations');
  const [hooks, setHooks] = useState<Hook[] | null>(null);
  const [url, setUrl] = useState('');
  const [event, setEvent] = useState<(typeof ZAP_EVENTS)[number]>('lead.created');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const appUrl = process.env.NEXT_PUBLIC_ZAPIER_APP_URL;

  const load = useCallback(() => {
    authFetch<Hook[]>('/zapier/hooks')
      .then(setHooks)
      .catch(() => setHooks([]));
  }, []);
  useEffect(load, [load]);

  async function test(id: string) {
    setBusy(`test:${id}`);
    setNote(null);
    try {
      const r = await authFetch<{ ok: boolean; status: number }>(`/zapier/hooks/${id}/test`, { method: 'POST' });
      setNote(r.ok ? { tone: 'success', text: t('apps.zapier.testSent') } : { tone: 'danger', text: t('apps.zapier.testFailed', { status: r.status || '—' }) });
    } catch (e) {
      setNote({ tone: 'danger', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    setBusy('add');
    setNote(null);
    try {
      const created = await authFetch<{ id: string }>('/zapier/hooks', { method: 'POST', body: JSON.stringify({ hookUrl: url.trim(), event }) });
      setUrl('');
      load();
      onChanged();
      // An example right away, so Zapier has fields to map.
      await test(created.id);
    } catch (e) {
      setNote({ tone: 'danger', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(`remove:${id}`);
    try {
      await authFetch(`/zapier/hooks/${id}`, { method: 'DELETE' });
      setHooks((h) => h?.filter((x) => x.id !== id) ?? null);
      onChanged();
    } catch (e) {
      setNote({ tone: 'danger', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const valid = isZapierHook(url);

  return (
    <>
      {note && (
        <Notice tone={note.tone} icon={note.tone === 'success' ? 'check' : 'x'} onDismiss={() => setNote(null)}>
          {note.text}
        </Notice>
      )}

      <SheetSection title={t('apps.zapier.listening')}>
        {hooks === null ? (
          <div className="v-skeleton h-12 w-full" />
        ) : hooks.length === 0 ? (
          <p className="text-sm text-muted">{t('apps.zapier.none')}</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg ring-1 ring-inset ring-line" data-testid="zapier-hooks">
            {hooks.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5" data-testid="zapier-hook">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{h.events.map((e) => eventLabel(t, e)).join(', ')}</span>
                  <span dir="ltr" className="block font-mono text-2xs text-faint">
                    hooks.zapier.com {h.url}
                  </span>
                </span>
                <button type="button" onClick={() => test(h.id)} disabled={!!busy} className="v-btn v-btn-ghost !h-8 !text-xs">
                  {busy === `test:${h.id}` ? t('apps.zapier.sending') : t('apps.zapier.test')}
                </button>
                <button type="button" onClick={() => remove(h.id)} disabled={!!busy} className="v-btn v-btn-ghost !h-8 !text-xs text-red-600 dark:text-red-400">
                  {t('apps.zapier.remove')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </SheetSection>

      <SheetSection title={t('apps.zapier.addTitle')} hint={t('apps.zapier.addHint')}>
        <ol className="mb-4 list-decimal space-y-1 ps-5 text-xs leading-relaxed text-muted">
          <li>{t('apps.zapier.step1')}</li>
          <li>{t('apps.zapier.step2')}</li>
          <li>{t('apps.zapier.step3')}</li>
        </ol>
        <div className="space-y-3">
          <Field label={t('apps.zapier.when')} htmlFor="zap-event">
            <select id="zap-event" className="v-field" value={event} onChange={(e) => setEvent(e.target.value as (typeof ZAP_EVENTS)[number])}>
              {ZAP_EVENTS.map((e) => (
                <option key={e} value={e}>
                  {eventLabel(t, e)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('apps.zapier.hookUrl')} htmlFor="zap-url" hint={url && !valid ? t('apps.zapier.notZapier') : undefined}>
            <input
              id="zap-url"
              dir="ltr"
              type="url"
              autoComplete="off"
              spellCheck={false}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://hooks.zapier.com/hooks/catch/…"
              className="v-field w-full font-mono text-sm"
            />
          </Field>
          <button type="button" onClick={add} disabled={!url.trim() || !!busy} className="v-btn disabled:opacity-60">
            <Icon name="send" size={14} />
            {busy === 'add' ? t('apps.zapier.connecting') : t('apps.zapier.connect')}
          </button>
        </div>
      </SheetSection>

      <SheetSection title={t('apps.zapier.actTitle')} hint={t('apps.zapier.actHint')}>
        <div className="flex flex-wrap gap-2">
          {appUrl && (
            <a href={appUrl} target="_blank" rel="noreferrer" className="v-btn">
              <Icon name="external-link" size={14} />
              {t('apps.zapier.openApp')}
            </a>
          )}
          <a href="/integrations?tab=keys" className="v-btn v-btn-ghost">
            <Icon name="lock" size={14} />
            {t('apps.zapier.makeKey')}
          </a>
        </div>
      </SheetSection>
    </>
  );
}
