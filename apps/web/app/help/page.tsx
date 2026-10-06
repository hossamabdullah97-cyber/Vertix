'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SupportRequestView } from '@vertex/shared';
import AppShell from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { ContactSupport, TOPIC_OF } from '@/components/help/ContactSupport';
import { authFetch } from '@/lib/client';
import { formatDate } from '@/lib/format';
import { HELP, HELP_ARTICLES, HELP_CATEGORIES, article, articleCount, articlesIn, helpLocale, searchHelp, type HelpArticle, type HelpCategory } from '@/lib/help';

const isCategory = (v: string | null): v is HelpCategory => HELP_CATEGORIES.some((c) => c.id === v);

function ArticleRow({ a, href }: { a: HelpArticle; href: string }) {
  return (
    <li>
      <Link href={href} className="group flex items-start gap-3 rounded-lg px-3 py-3 hover:bg-elevated" data-testid="help-article">
        <Icon name="file-text" size={15} className="mt-0.5 shrink-0 text-faint group-hover:text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">{a.title}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted">{a.summary}</span>
        </span>
        <Icon name="arrow" size={13} className="mt-1 shrink-0 text-faint rtl:-scale-x-100" />
      </Link>
    </li>
  );
}

/**
 * The help center: search the articles, browse them by topic, or write to a
 * person. Its own messages are listed below with whether they were answered.
 */
export default function HelpPage() {
  const router = useRouter();
  const { locale: appLocale } = useLocale();
  const locale = helpLocale(appLocale);
  const strings = HELP[locale];
  const ui = strings.ui;
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<HelpCategory | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [email, setEmail] = useState<string>();
  const [requests, setRequests] = useState<SupportRequestView[] | null>(null);

  // The query and topic live in the address, so a search can be linked to and Back works.
  useEffect(() => {
    const read = () => {
      const p = new URLSearchParams(window.location.search);
      setQ(p.get('q') ?? '');
      const topic = p.get('topic');
      setCategory(isCategory(topic) ? topic : null);
      if (p.get('contact') === '1') setContactOpen(true);
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);

  useEffect(() => {
    authFetch<{ email: string }>('/auth/me').then((m) => setEmail(m.email)).catch(() => {});
    authFetch<SupportRequestView[]>('/support/requests').then(setRequests).catch(() => setRequests([]));
  }, []);

  const setQuery = (v: string) => {
    setQ(v);
    const url = new URL(window.location.href);
    if (v.trim()) url.searchParams.set('q', v);
    else url.searchParams.delete('q');
    url.searchParams.delete('topic');
    setCategory(null);
    window.history.replaceState(null, '', url);
  };

  const results = useMemo(() => (q.trim() ? searchHelp(locale, q) : null), [locale, q]);
  const popular = useMemo(() => HELP_ARTICLES.filter((a) => a.popular).map((a) => article(locale, a.slug)!), [locale]);
  const articleHref = (slug: string) => `/help/${slug}`;

  return (
    <AppShell
      title={ui.title}
      action={
        <button type="button" onClick={() => setContactOpen(true)} className="v-btn">
          <Icon name="message" size={14} />
          <span className="hidden sm:inline">{ui.contact}</span>
        </button>
      }
    >
      <div className="mx-auto max-w-[920px]">
        <section className="rounded-2xl bg-surface px-5 py-8 text-center shadow-sm ring-1 ring-line sm:px-10 sm:py-10">
          <h2 className="text-2xl font-semibold text-ink">{ui.ask}</h2>
          <p className="mt-2 text-sm text-muted">{ui.subtitle}</p>
          <div className="relative mx-auto mt-6 max-w-[560px]">
            <Icon name="search" size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={ui.search}
              aria-label={ui.searchLabel}
              className="v-field h-12 w-full !ps-10 text-base"
              dir={q ? 'auto' : undefined}
              autoFocus
            />
          </div>
        </section>

        {results ? (
          <section className="mt-6" aria-live="polite">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <h2 className="text-sm font-semibold text-ink">{results.length ? articleCount(locale, results.length) : ui.results_zero}</h2>
              <button type="button" onClick={() => setQuery('')} className="text-xs font-medium text-accent hover:underline">
                {ui.clear}
              </button>
            </div>
            {results.length ? (
              <ul className="rounded-xl bg-surface p-1 shadow-sm ring-1 ring-line">
                {results.map((a) => (
                  <ArticleRow key={a.slug} a={a} href={articleHref(a.slug)} />
                ))}
              </ul>
            ) : (
              <div className="rounded-xl bg-surface px-5 py-8 text-center shadow-sm ring-1 ring-line">
                <p className="text-sm font-medium text-ink">{ui.noResults.replace('{{q}}', q.trim())}</p>
                <p className="mt-1 text-xs text-muted">{ui.noResultsHint}</p>
                <button type="button" onClick={() => setContactOpen(true)} className="v-btn v-btn-primary mt-4">
                  {ui.contact}
                </button>
              </div>
            )}
          </section>
        ) : category ? (
          <section className="mt-6">
            <button
              type="button"
              onClick={() => {
                router.replace('/help');
                setCategory(null);
              }}
              className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink"
            >
              <Icon name="arrow-left" size={13} className="rtl:-scale-x-100" /> {ui.home}
            </button>
            <h2 className="text-lg font-semibold text-ink">{strings.categories[category].title}</h2>
            <p className="mt-1 text-sm text-muted">{strings.categories[category].desc}</p>
            <ul className="mt-4 rounded-xl bg-surface p-1 shadow-sm ring-1 ring-line">
              {articlesIn(locale, category).map((a) => (
                <ArticleRow key={a.slug} a={a} href={articleHref(a.slug)} />
              ))}
            </ul>
          </section>
        ) : (
          <>
            <section className="mt-8">
              <h2 className="mb-3 px-1 text-sm font-semibold text-ink">{ui.browse}</h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {HELP_CATEGORIES.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/help?topic=${c.id}`}
                      onClick={() => setCategory(c.id)}
                      className="flex h-full flex-col rounded-xl bg-surface p-4 shadow-sm ring-1 ring-line transition-colors hover:bg-elevated"
                      data-testid="help-category"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent" aria-hidden>
                        <Icon name={c.icon} size={17} />
                      </span>
                      <span className="mt-3 text-sm font-semibold text-ink">{strings.categories[c.id].title}</span>
                      <span className="mt-1 flex-1 text-xs leading-relaxed text-muted">{strings.categories[c.id].desc}</span>
                      <span className="mt-3 text-xs text-faint">{articleCount(locale, articlesIn(locale, c.id).length)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-8">
              <h2 className="mb-3 px-1 text-sm font-semibold text-ink">{ui.popular}</h2>
              <ul className="grid rounded-xl bg-surface p-1 shadow-sm ring-1 ring-line md:grid-cols-2">
                {popular.map((a) => (
                  <ArticleRow key={a.slug} a={a} href={articleHref(a.slug)} />
                ))}
              </ul>
            </section>
          </>
        )}

        <section className="mt-8 flex flex-col items-start gap-4 rounded-xl bg-surface p-5 shadow-sm ring-1 ring-line sm:flex-row sm:items-center">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent" aria-hidden>
            <Icon name="message" size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">{ui.stillStuck}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">{ui.contactBody}</span>
          </span>
          <button type="button" onClick={() => setContactOpen(true)} className="v-btn v-btn-primary">
            {ui.contact}
          </button>
        </section>

        {!!requests?.length && (
          <section className="mt-8">
            <h2 className="mb-3 px-1 text-sm font-semibold text-ink">{ui.yourRequests}</h2>
            <ul className="divide-y divide-line rounded-xl bg-surface shadow-sm ring-1 ring-line" data-testid="support-requests">
              {requests.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink" dir="auto">
                      {r.subject}
                    </span>
                    <span className="mt-0.5 block text-xs text-faint">
                      <bdi className="tabular">{r.ref}</bdi> · {ui.topics[r.topic]} · {formatDate(r.createdAt, appLocale)}
                    </span>
                  </span>
                  <span className={`v-badge ${r.status === 'OPEN' ? 'v-badge-accent' : 'v-badge-success'}`}>{r.status === 'OPEN' ? ui.open : ui.closed}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <ContactSupport
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        locale={locale}
        email={email}
        topic={category ? TOPIC_OF[category] : 'other'}
        subject={results && !results.length ? q.trim() : ''}
        onSent={(r) => setRequests((rs) => [r, ...(rs ?? [])])}
      />
    </AppShell>
  );
}
