'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GOAL_METRICS, GOAL_PERIODS, type GoalMetric, type GoalPeriod, type GoalScope } from '@vertex/shared';
import { authFetch, type Member } from '@/lib/client';
import { formatNumber } from '@/lib/format';
import { formatMoney } from '@/lib/crm';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { Sheet } from '@/components/ui/Sheet';

type Person = { id: string; name: string | null; email: string; avatarUrl: string | null };
interface Goal {
  id: string;
  metric: GoalMetric;
  period: GoalPeriod;
  scope: GoalScope;
  target: number;
  window: { from: string; to: string };
  elapsed: number;
  value?: number;
  user?: Person | null;
  members?: { user: Person; value: number }[];
}

const DAY = 86_400_000;

/** Where a number stands against its target and the time gone. */
export function paceOf(value: number, target: number, elapsed: number): 'done' | 'ahead' | 'behind' {
  if (value >= target) return 'done';
  // Some slack, and whole units: two hours into the week, nobody is behind on a target of 4.
  return value >= Math.floor(target * elapsed * 0.9) ? 'ahead' : 'behind';
}

/**
 * The team's goals for this week and month on the dashboard: a bar for each,
 * with where the team should be by now marked on it. The team's leads can set
 * and change them here; everyone else sees the team's and their own.
 */
export function GoalsPanel() {
  const { t } = useTranslation('dashboard');
  const [data, setData] = useState<{ goals: Goal[]; canEdit: boolean } | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => authFetch<{ goals: Goal[]; canEdit: boolean }>('/goals').then(setData, () => setData({ goals: [], canEdit: false })), []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!data || (!data.goals.length && !data.canEdit)) return null;

  return (
    <section className="v-card mt-4">
      <div className="flex items-center gap-2 px-4 pb-2 pt-3.5">
        <h3 className="text-base font-semibold text-ink">{t('goals.title')}</h3>
        {data.canEdit && (
          <button type="button" onClick={() => setEditing(true)} className="v-btn v-btn-ghost ms-auto !h-11 !px-3 !text-xs sm:!h-8">
            <Icon name={data.goals.length ? 'settings' : 'plus'} size={13} /> {data.goals.length ? t('goals.edit') : t('goals.set')}
          </button>
        )}
      </div>
      {data.goals.length === 0 ? (
        <p className="px-4 pb-4 text-sm leading-relaxed text-muted">{t('goals.empty')}</p>
      ) : (
        <ul className="grid gap-x-8 gap-y-1 px-4 pb-3 md:grid-cols-2">
          {data.goals.map((g) => (
            <GoalRow key={g.id} goal={g} />
          ))}
        </ul>
      )}
      {data.canEdit && <GoalsEditor open={editing} goals={data.goals} onClose={() => setEditing(false)} onChanged={load} />}
    </section>
  );
}

function useAmount() {
  const { locale } = useLocale();
  return (metric: GoalMetric, n: number) => (metric === 'WON_VALUE' ? formatMoney(n, locale) : formatNumber(n, locale));
}

function GoalRow({ goal: g }: { goal: Goal }) {
  const { t } = useTranslation('dashboard');
  const amount = useAmount();
  const left = Math.max(0, Math.ceil((new Date(g.window.to).getTime() - Date.now()) / DAY));
  const who = g.scope === 'TEAM' ? t('goals.scope.TEAM') : g.scope === 'EACH' ? t('goals.scope.EACH') : g.user?.name || g.user?.email || '';
  const heading = `${t(`goals.metric.${g.metric}`)} · ${t(`goals.period.${g.period}`)}`;

  if (g.scope === 'EACH') {
    const rows = [...(g.members ?? [])].sort((a, b) => b.value - a.value);
    const done = rows.filter((r) => r.value >= g.target).length;
    return (
      <li className="py-2.5">
        <RowHead heading={heading} who={who} side={t('goals.eachDone', { done, count: rows.length, target: amount(g.metric, g.target) })} />
        <ul className="mt-2 space-y-1.5">
          {rows.slice(0, 6).map((r) => (
            <li key={r.user.id} className="flex items-center gap-2">
              <Avatar user={r.user} size={20} />
              <span className="w-24 shrink-0 truncate text-xs text-muted">{r.user.name || r.user.email}</span>
              <Bar value={r.value} target={g.target} elapsed={g.elapsed} />
              <span className="tabular w-14 shrink-0 text-end text-xs text-ink">{amount(g.metric, r.value)}</span>
            </li>
          ))}
        </ul>
        {rows.length > 6 && <p className="mt-1 text-xs text-faint">{t('goals.more', { count: rows.length - 6 })}</p>}
      </li>
    );
  }

  const value = g.value ?? 0;
  const pace = paceOf(value, g.target, g.elapsed);
  return (
    <li className="py-2.5">
      <RowHead heading={heading} who={who} side={`${amount(g.metric, value)} / ${amount(g.metric, g.target)}`} />
      <div className="mt-2">
        <Bar value={value} target={g.target} elapsed={g.elapsed} />
      </div>
      <p className={`mt-1.5 text-xs ${pace === 'done' ? 'font-medium text-emerald-700 dark:text-emerald-400' : pace === 'ahead' ? 'text-muted' : 'text-amber-700 dark:text-amber-400'}`}>
        {pace === 'done'
          ? t('goals.reached')
          : t(pace === 'ahead' ? 'goals.onPace' : 'goals.behind', { togo: amount(g.metric, g.target - value), count: left })}
      </p>
    </li>
  );
}

function RowHead({ heading, who, side }: { heading: string; who: string; side: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="min-w-0 truncate text-sm font-medium text-ink">{heading}</span>
      <span className="min-w-0 truncate text-xs text-faint">{who}</span>
      <span className="tabular ms-auto shrink-0 text-xs text-muted">{side}</span>
    </div>
  );
}

/** The bar, filled to the value, with a tick where the team should be by now. */
function Bar({ value, target, elapsed }: { value: number; target: number; elapsed: number }) {
  const pct = Math.min(100, (value / target) * 100);
  const pace = paceOf(value, target, elapsed);
  return (
    <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-elevated ring-1 ring-inset ring-line">
      <div
        className={`absolute inset-y-0 start-0 rounded-full ${pace === 'done' ? 'bg-emerald-500' : pace === 'ahead' ? 'bg-accent' : 'bg-amber-500'}`}
        style={{ width: `${pct}%` }}
      />
      {pace !== 'done' && elapsed > 0 && elapsed < 1 && <div className="absolute inset-y-0 w-px bg-ink/40" style={{ insetInlineStart: `${elapsed * 100}%` }} aria-hidden />}
    </div>
  );
}

/** Setting, changing and removing goals. */
function GoalsEditor({ open, goals, onClose, onChanged }: { open: boolean; goals: Goal[]; onClose: () => void; onChanged: () => Promise<unknown> }) {
  const { t } = useTranslation('dashboard');
  const [members, setMembers] = useState<Member[]>([]);
  const [metric, setMetric] = useState<GoalMetric>('LEADS');
  const [period, setPeriod] = useState<GoalPeriod>('WEEK');
  const [scope, setScope] = useState<GoalScope>('TEAM');
  const [userId, setUserId] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) authFetch<Member[]>('/orgs/members').then((m) => setMembers(m.filter((x) => x.status === 'ACTIVE')), () => {});
  }, [open]);

  async function save(input: { metric: GoalMetric; period: GoalPeriod; scope: GoalScope; userId?: string; target: number }) {
    setBusy(true);
    setError('');
    try {
      await authFetch('/goals', { method: 'PUT', body: JSON.stringify(input) });
      await onChanged();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await authFetch(`/goals/${id}`, { method: 'DELETE' });
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const n = Number(target);
  const valid = Number.isInteger(n) && n > 0 && (scope !== 'MEMBER' || !!userId);

  return (
    <Sheet open={open} onClose={onClose} closeLabel={t('goals.close')} title={t('goals.editTitle')} subtitle={t('goals.editSubtitle')}>
      {goals.length > 0 && (
        <ul className="mb-6 divide-y divide-line rounded-xl ring-1 ring-inset ring-line">
          {goals.map((g) => (
            <ExistingGoal key={g.id} goal={g} busy={busy} onSave={(target) => save({ metric: g.metric, period: g.period, scope: g.scope, userId: g.user?.id, target })} onRemove={() => remove(g.id)} />
          ))}
        </ul>
      )}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          if (await save({ metric, period, scope, userId: scope === 'MEMBER' ? userId : undefined, target: n })) setTarget('');
        }}
        className="space-y-4"
      >
        <h3 className="text-sm font-semibold text-ink">{t('goals.add')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink">{t('goals.fields.metric')}</span>
            <select className="v-field" value={metric} onChange={(e) => setMetric(e.target.value as GoalMetric)}>
              {GOAL_METRICS.map((m) => (
                <option key={m} value={m}>
                  {t(`goals.metric.${m}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink">{t('goals.fields.period')}</span>
            <select className="v-field" value={period} onChange={(e) => setPeriod(e.target.value as GoalPeriod)}>
              {GOAL_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {t(`goals.periodLong.${p}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink">{t('goals.fields.scope')}</span>
            <select className="v-field" value={scope} onChange={(e) => setScope(e.target.value as GoalScope)}>
              <option value="TEAM">{t('goals.scopeLong.TEAM')}</option>
              <option value="EACH">{t('goals.scopeLong.EACH')}</option>
              <option value="MEMBER">{t('goals.scopeLong.MEMBER')}</option>
            </select>
          </label>
          {scope === 'MEMBER' ? (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink">{t('goals.fields.member')}</span>
              <select className="v-field" value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">—</option>
                {members.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name || m.user.email}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="hidden sm:block" />
          )}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink">{metric === 'WON_VALUE' ? t('goals.fields.targetMoney') : t('goals.fields.target')}</span>
            <input className="v-field" type="number" min={1} step={1} inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} dir="ltr" />
          </label>
        </div>
        <p className="text-xs leading-relaxed text-muted">{t(`goals.counts.${metric}`)}</p>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button disabled={!valid || busy} className="v-btn disabled:opacity-50">
          {t('goals.save')}
        </button>
      </form>
    </Sheet>
  );
}

function ExistingGoal({ goal: g, busy, onSave, onRemove }: { goal: Goal; busy: boolean; onSave: (target: number) => Promise<boolean>; onRemove: () => void }) {
  const { t } = useTranslation('dashboard');
  const [value, setValue] = useState(String(g.target));
  useEffect(() => setValue(String(g.target)), [g.target]);
  const n = Number(value);
  const changed = Number.isInteger(n) && n > 0 && n !== g.target;
  const who = g.scope === 'MEMBER' ? g.user?.name || g.user?.email : t(`goals.scope.${g.scope}`);
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">
          {t(`goals.metric.${g.metric}`)} · {t(`goals.period.${g.period}`)}
        </span>
        <span className="block truncate text-xs text-faint">{who}</span>
      </span>
      <input className="v-field !w-24" type="number" min={1} value={value} onChange={(e) => setValue(e.target.value)} aria-label={t('goals.fields.target')} dir="ltr" />
      <button type="button" disabled={!changed || busy} onClick={() => void onSave(n)} className="v-btn v-btn-ghost !h-9 disabled:opacity-40">
        {t('goals.save')}
      </button>
      <button type="button" disabled={busy} onClick={onRemove} aria-label={t('goals.remove')} title={t('goals.remove')} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-elevated hover:text-red-600">
        <Icon name="trash" size={14} />
      </button>
    </li>
  );
}
