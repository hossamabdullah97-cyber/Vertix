import type { Metadata } from 'next';
import Link from 'next/link';
import type { StatusIncidentView, StatusView } from '@vertex/shared';
import { serverLocale } from '@/lib/i18n/server';
import { apiGet } from '@/lib/api';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { Brand, WRAP } from '@/components/landing/shared';
import { Icon } from '@/components/Icon';
import { STATE_TONE, STATUS_STRINGS, formatUptime } from '@/lib/status';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${STATUS_STRINGS[(await serverLocale())].title} · Vertex Connect` };
}

function Incident({ i, lang }: { i: StatusIncidentView; lang: 'en' | 'ar' }) {
  const s = STATUS_STRINGS[lang];
  const tone = i.impact === 'MAINTENANCE' ? STATE_TONE.MAINTENANCE : i.impact === 'MAJOR' ? STATE_TONE.OUTAGE : STATE_TONE.DEGRADED;
  return (
    <article className="rounded-xl bg-surface p-5 shadow-sm ring-1 ring-line" data-testid="incident">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${i.status === 'RESOLVED' ? STATE_TONE.OPERATIONAL.dot : tone.dot}`} aria-hidden />
        <h3 className="text-base font-semibold text-ink">{(lang === 'ar' && i.titleAr) || i.title}</h3>
        <span className="v-badge">{s.status[i.status]}</span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {s.affects}: {i.components.map((c) => s.components[c].name).join('، ')}
        {i.startsAt && i.endsAt && (
          <>
            {' · '}
            {s.from} <bdi>{formatDateTime(i.startsAt, lang)}</bdi> {s.to} <bdi>{formatDateTime(i.endsAt, lang)}</bdi>
          </>
        )}
      </p>
      <ol className="mt-4 space-y-3 border-s-2 border-line ps-4">
        {i.updates.map((u) => (
          <li key={u.id}>
            <p className="text-xs text-faint">
              <span className="font-medium text-ink">{s.status[u.status]}</span> · <bdi>{formatDateTime(u.createdAt, lang)}</bdi>
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted" dir="auto">
              {(lang === 'ar' && u.messageAr) || u.message}
            </p>
          </li>
        ))}
      </ol>
    </article>
  );
}

/**
 * The public status page: is the platform working now, how each part has
 * done for 90 days, and what is being done about anything that isn't.
 * Rendered on the server on every visit, so it never shows a stale "all
 * good"; if the API can't be reached, that is what it says.
 */
export default async function StatusPage() {
  const lang = (await serverLocale());
  const s = STATUS_STRINGS[lang];
  const v = await apiGet<StatusView>('/status');
  const now = Date.now();
  const scheduled = v?.active.filter((i) => i.status === 'SCHEDULED' && i.startsAt && new Date(i.startsAt).getTime() > now) ?? [];
  const going = v?.active.filter((i) => !scheduled.includes(i)) ?? [];
  const overall = v ? v.overall : 'OUTAGE';
  const tone = STATE_TONE[overall];

  return (
    <div className="min-h-screen bg-canvas text-ink antialiased">
      <header className="border-b border-line bg-surface">
        <div className={`${WRAP} flex h-16 items-center justify-between gap-3`}>
          <Brand />
          <LanguageSwitcher />
        </div>
      </header>

      <main className={`${WRAP} max-w-[880px] py-10`}>
        <h1 className="text-3xl font-semibold tracking-tight rtl:tracking-normal">{s.title}</h1>
        <p className="mt-2 text-sm text-muted">{s.subtitle}</p>

        <section role="status" data-testid="overall" className={`mt-6 flex items-start gap-3 rounded-2xl p-5 ring-1 ring-inset ${tone.banner}`}>
          <Icon name={overall === 'OPERATIONAL' ? 'check' : overall === 'MAINTENANCE' ? 'settings' : 'alert'} size={20} className={`mt-0.5 shrink-0 ${tone.text}`} />
          <div>
            <p className={`text-lg font-semibold ${tone.text}`}>{v ? s.overall[overall] : s.unreachable}</p>
            <p className="mt-1 text-xs text-muted">
              {!v ? s.unreachableBody : v.checkedAt ? s.checked.replace('{{time}}', formatRelativeTime(v.checkedAt, lang)) : s.notChecked}
            </p>
          </div>
        </section>

        {going.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold">{s.active}</h2>
            <div className="space-y-3">
              {going.map((i) => (
                <Incident key={i.id} i={i} lang={lang} />
              ))}
            </div>
          </section>
        )}

        {scheduled.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold">{s.scheduled}</h2>
            <div className="space-y-3">
              {scheduled.map((i) => (
                <Incident key={i.id} i={i} lang={lang} />
              ))}
            </div>
          </section>
        )}

        {v && (
          <section className="mt-8 divide-y divide-line rounded-2xl bg-surface shadow-sm ring-1 ring-line">
            {v.components.map((c) => {
              const t = STATE_TONE[c.state];
              return (
                <div key={c.id} className="p-5" data-testid="status-component">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{s.components[c.id].name}</p>
                      <p className="mt-0.5 text-xs text-muted">{s.components[c.id].desc}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium ${t.text}`}>
                      <span className={`h-2 w-2 rounded-full ${t.dot}`} aria-hidden />
                      {s.state[c.state]}
                    </span>
                  </div>
                  <div className="mt-3 flex h-8 gap-[2px]" aria-hidden>
                    {c.days.map((d, idx) => (
                      <span
                        key={d.day}
                        title={`${d.day} · ${d.uptime === null ? s.noData : formatUptime(d.uptime, lang)}`}
                        className={`flex-1 rounded-[2px] ${idx < 60 ? 'hidden sm:block' : ''} ${d.worst ? STATE_TONE[d.worst].bar : 'bg-line'} ${d.worst === 'OPERATIONAL' ? 'opacity-80' : ''}`}
                      />
                    ))}
                  </div>
                  <div className="mt-1.5 flex justify-between text-2xs text-faint">
                    <span className="hidden sm:inline">{s.days90}</span>
                    <span>{c.uptime === null ? s.noData : s.uptime.replace('{{value}}', formatUptime(c.uptime, lang))}</span>
                    <span>{s.today}</span>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {v && (
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-semibold">{s.recent}</h2>
            {v.recent.length ? (
              <div className="space-y-3">
                {v.recent.map((i) => (
                  <Incident key={i.id} i={i} lang={lang} />
                ))}
              </div>
            ) : (
              <p className="rounded-xl px-5 py-6 text-sm text-muted ring-1 ring-inset ring-line">{s.recentNone}</p>
            )}
          </section>
        )}

        <p className="mt-10 text-xs text-muted">
          <Link href="/help?contact=1" className="hover:text-ink hover:underline">
            {s.help}
          </Link>
        </p>
      </main>
    </div>
  );
}
