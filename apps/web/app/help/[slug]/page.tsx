'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { ContactSupport, TOPIC_OF } from '@/components/help/ContactSupport';
import { authFetch } from '@/lib/client';
import { HELP, article, articlesIn, helpLocale, type HelpBlock } from '@/lib/help';

function Block({ b, tip }: { b: HelpBlock; tip: string }) {
  if ('steps' in b) {
    return (
      <ol className="space-y-3">
        {b.steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent">{i + 1}</span>
            <span className="text-base leading-relaxed text-ink">{s}</span>
          </li>
        ))}
      </ol>
    );
  }
  if ('tip' in b) {
    return (
      <p className="flex gap-3 rounded-xl bg-accent/[0.06] p-4 text-sm leading-relaxed text-ink ring-1 ring-inset ring-accent/20">
        <Icon name="sparkle" size={16} className="mt-0.5 shrink-0 text-accent" />
        <span>
          <span className="font-semibold">{tip}: </span>
          {b.tip}
        </span>
      </p>
    );
  }
  return <p className="text-base leading-relaxed text-ink">{b.p}</p>;
}

/** One help article: what to do, a button to go and do it, whether it helped, and what to read next. */
export default function HelpArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const { locale: appLocale } = useLocale();
  const locale = helpLocale(appLocale);
  const strings = HELP[locale];
  const ui = strings.ui;
  const a = article(locale, slug);
  const [answer, setAnswer] = useState<boolean | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [email, setEmail] = useState<string>();

  useEffect(() => {
    setAnswer(null);
  }, [slug]);
  useEffect(() => {
    authFetch<{ email: string }>('/auth/me').then((m) => setEmail(m.email)).catch(() => {});
  }, []);

  const rate = (helpful: boolean) => {
    setAnswer(helpful);
    void authFetch('/support/feedback', { method: 'POST', body: JSON.stringify({ article: slug, helpful }) }).catch(() => {});
  };

  if (!a) {
    return (
      <AppShell title={ui.title}>
        <div className="mx-auto max-w-[560px] rounded-xl bg-surface px-6 py-10 text-center shadow-sm ring-1 ring-line">
          <h1 className="text-lg font-semibold text-ink">{ui.notFound}</h1>
          <p className="mt-2 text-sm text-muted">{ui.notFoundBody}</p>
          <Link href="/help" className="v-btn v-btn-primary mt-5">
            {ui.home}
          </Link>
        </div>
      </AppShell>
    );
  }

  const category = strings.categories[a.category];
  const siblings = articlesIn(locale, a.category);
  const related = (a.related ?? []).map((s) => article(locale, s)).filter((r): r is NonNullable<typeof r> => !!r);

  return (
    <AppShell title={ui.title}>
      <div className="mx-auto grid max-w-[1040px] gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
        <article className="min-w-0">
          <nav aria-label={ui.home} className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <Link href="/help" className="hover:text-ink">
              {ui.home}
            </Link>
            <Icon name="arrow" size={11} className="text-faint rtl:-scale-x-100" />
            <Link href={`/help?topic=${a.category}`} className="hover:text-ink">
              {category.title}
            </Link>
          </nav>
          <h1 className="mt-3 text-2xl font-semibold text-ink">{a.title}</h1>
          <p className="mt-2 text-base text-muted">{a.summary}</p>

          <div className="mt-6 space-y-5 rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-line sm:p-7">
            {a.body.map((b, i) => (
              <Block key={i} b={b} tip={ui.tip} />
            ))}
            {a.href && a.action && (
              <Link href={a.href} className="v-btn v-btn-primary">
                {a.action}
                <Icon name="arrow" size={14} className="rtl:-scale-x-100" />
              </Link>
            )}
          </div>

          <div className="mt-6 rounded-xl bg-surface p-5 shadow-sm ring-1 ring-line" data-testid="help-feedback">
            {answer === null ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex-1 text-sm font-medium text-ink">{ui.helpful}</span>
                <button type="button" onClick={() => rate(true)} className="v-btn">
                  {ui.yes}
                </button>
                <button type="button" onClick={() => rate(false)} className="v-btn">
                  {ui.no}
                </button>
              </div>
            ) : (
              <div role="status" className="flex flex-wrap items-center gap-3">
                <span className="flex-1 text-sm text-ink">{answer ? ui.thanks : ui.thanksNo}</span>
                {!answer && (
                  <button type="button" onClick={() => setContactOpen(true)} className="v-btn v-btn-primary">
                    {ui.contact}
                  </button>
                )}
              </div>
            )}
          </div>

          {related.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-semibold text-ink">{ui.related}</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link href={`/help/${r.slug}`} className="block h-full rounded-xl bg-surface p-4 shadow-sm ring-1 ring-line hover:bg-elevated">
                      <span className="block text-sm font-medium text-ink">{r.title}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted">{r.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl bg-surface p-2 shadow-sm ring-1 ring-line">
            <p className="px-2 pb-1 pt-1.5 text-xs font-semibold text-ink">{category.title}</p>
            <ul>
              {siblings.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/help/${s.slug}`}
                    aria-current={s.slug === a.slug ? 'page' : undefined}
                    className={`block rounded-lg px-2 py-2 text-sm ${s.slug === a.slug ? 'bg-accent/10 font-medium text-accent' : 'text-muted hover:bg-elevated hover:text-ink'}`}
                  >
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl bg-surface p-4 shadow-sm ring-1 ring-line">
            <p className="text-sm font-semibold text-ink">{ui.stillStuck}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{ui.contactBody}</p>
            <button type="button" onClick={() => setContactOpen(true)} className="v-btn mt-3 w-full">
              {ui.contact}
            </button>
          </div>
        </aside>
      </div>

      <ContactSupport open={contactOpen} onClose={() => setContactOpen(false)} locale={locale} email={email} topic={TOPIC_OF[a.category]} subject={a.title} />
    </AppShell>
  );
}
