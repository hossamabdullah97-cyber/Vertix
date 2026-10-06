'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import type { OnboardingView } from '@vertex/shared';
import { guideOpen } from '@/lib/onboarding';
import { Icon } from '@/components/Icon';

/**
 * The getting-started guide in the sidebar, on every page: how far along,
 * and the next steps a click away. It makes way once everything is done
 * (saying so once) or once the person hides it.
 */
export function GettingStarted({ view, onHide }: { view: OnboardingView | null; onHide: () => void }) {
  const { t } = useTranslation('dashboard');
  const [open, setOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (view?.justCompleted) setCelebrate(true);
  }, [view?.justCompleted]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (celebrate) {
    return (
      <div role="status" className="rounded-xl bg-emerald-500/[0.08] p-3 ring-1 ring-inset ring-emerald-500/25">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span aria-hidden>🎉</span> {t('guide.doneTitle')}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">{t('guide.doneBody')}</p>
        <button type="button" onClick={() => setCelebrate(false)} className="mt-2 text-xs font-medium text-accent hover:underline">
          {t('guide.doneClose')}
        </button>
      </div>
    );
  }
  if (!view || !guideOpen(view)) return null;

  const pct = Math.round((view.done / view.total) * 100);
  const left = view.steps.filter((s) => !s.done);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="getting-started"
        className="block w-full rounded-xl bg-surface p-3 text-start shadow-sm ring-1 ring-line transition-colors hover:bg-elevated"
      >
        <span className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-ink">{t('guide.title')}</span>
          <span className="tabular text-faint">{t('onboarding.progress', { done: view.done, total: view.total })}</span>
        </span>
        <span className="mt-2.5 block h-1 overflow-hidden rounded-full bg-line" aria-hidden>
          <span className="block h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
        </span>
        {left[0] && (
          <span className="mt-2 block truncate text-xs text-muted">
            {t('guide.next')} <span className="font-medium text-ink">{t(`onboarding.steps.${left[0].id}.label`)}</span>
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label={t('guide.title')} className="absolute inset-x-0 bottom-full z-40 mb-2 rounded-xl bg-surface p-2 shadow-xl ring-1 ring-line">
          <p className="px-2 pb-1.5 pt-1 text-sm font-semibold text-ink">{t('guide.title')}</p>
          <ol className="max-h-[50vh] overflow-auto">
            {view.steps.map((s, i) => (
              <li key={s.id}>
                <Link
                  href={s.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-elevated ${s.done ? 'text-faint' : 'text-ink'}`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-2xs font-semibold ${s.done ? 'bg-accent text-white' : 'text-faint ring-1 ring-inset ring-faint/40'}`}
                  >
                    {s.done ? <Icon name="check" size={11} /> : i + 1}
                  </span>
                  <span className={`min-w-0 flex-1 truncate ${s.done ? 'line-through' : ''}`}>{t(`onboarding.steps.${s.id}.label`)}</span>
                  {!s.done && <Icon name="arrow" size={12} className="shrink-0 text-faint rtl:-scale-x-100" />}
                </Link>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onHide();
            }}
            className="mt-1 w-full rounded-lg px-2 py-2 text-start text-xs text-muted hover:bg-elevated hover:text-ink"
          >
            {t('guide.hide')}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The first thing a new account sees: what the app is for, in its words for
 * a person on their own or a team, and the first step to take. Shown once.
 */
export function WelcomeDialog({ view, name, onStart, onClose }: { view: OnboardingView; name: string; onStart: () => void; onClose: () => void }) {
  const { t } = useTranslation('dashboard');
  const team = view.workspaceKind === 'TEAM';
  const first = view.steps.find((s) => !s.done);
  const points = team ? ['team1', 'team2', 'team3'] : ['own1', 'own2', 'own3'];
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-canvas/70 p-4 sm:items-center" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="welcome-title" className="w-full max-w-[460px] rounded-2xl bg-surface p-6 shadow-2xl ring-1 ring-line">
        <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Icon name="sparkle" size={20} />
        </span>
        <h2 id="welcome-title" className="mt-4 text-xl font-semibold text-ink">
          {name ? t('welcome.title', { name }) : t('welcome.titleNoName')}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{team ? t('welcome.bodyTeam') : t('welcome.bodyOwn')}</p>
        <ul className="mt-4 space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-sm text-ink">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Icon name="check" size={11} />
              </span>
              {t(`welcome.points.${p}`)}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-faint">{t('welcome.steps', { total: view.total })}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={first?.href ?? '/cards?new=1'} onClick={onStart} className="v-btn v-btn-primary">
            {first ? t(`onboarding.steps.${first.id}.link`) : t('welcome.start')}
          </Link>
          <button type="button" onClick={onClose} className="v-btn v-btn-ghost">
            {t('welcome.later')}
          </button>
        </div>
      </div>
    </div>
  );
}
