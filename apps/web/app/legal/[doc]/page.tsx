import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverLocale } from '@/lib/i18n/server';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { Brand, WRAP } from '@/components/landing/shared';
import { Icon } from '@/components/Icon';
import { formatDate } from '@/lib/format';
import { COMPANY, COMPANY_DETAILS_MISSING, LEGAL_DOCS, LEGAL_STRINGS, LEGAL_UPDATED, fillLegal, type LegalDoc } from '@/lib/legal';

const isDoc = (d: string): d is LegalDoc => (LEGAL_DOCS as string[]).includes(d);

export async function generateMetadata(props: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const params = await props.params;
  if (!isDoc(params.doc)) return {};
  const s = LEGAL_STRINGS[(await serverLocale())];
  const title = params.doc === 'contact' ? s.contact.title : s.docs[params.doc].title;
  return { title: `${title} · ${COMPANY.name}` };
}

/**
 * Privacy policy, terms, refunds and contact: what a payment provider checks
 * for before it takes a merchant live, and what a customer looks for before
 * trusting the platform with their clients' details. Plain server-rendered
 * text in the reader's language (lib/legal.ts holds it).
 */
export default async function LegalPage(props: { params: Promise<{ doc: string }> }) {
  const params = await props.params;
  if (!isDoc(params.doc)) notFound();
  const doc = params.doc;
  const locale = (await serverLocale());
  const s = LEGAL_STRINGS[locale];
  const updated = formatDate(LEGAL_UPDATED, locale);

  return (
    <div className="min-h-screen bg-canvas text-ink antialiased">
      <header className="border-b border-line bg-surface">
        <div className={`${WRAP} flex h-16 items-center justify-between gap-3`}>
          <Brand />
          <LanguageSwitcher />
        </div>
      </header>

      <div className={`${WRAP} py-8 sm:py-12`}>
        <nav aria-label={s.nav[doc]} className="-mx-1 flex gap-1 overflow-x-auto pb-1">
          {LEGAL_DOCS.map((d) => (
            <Link
              key={d}
              href={`/legal/${d}`}
              aria-current={d === doc ? 'page' : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-lg px-3.5 text-sm font-medium transition-colors sm:min-h-9 ${
                d === doc ? 'bg-ink text-canvas' : 'text-muted hover:bg-elevated hover:text-ink'
              }`}
            >
              {s.nav[d]}
            </Link>
          ))}
        </nav>

        {COMPANY_DETAILS_MISSING && (
          <p role="note" className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-100 dark:ring-amber-500/20">
            {s.missing}
          </p>
        )}

        <article className="mt-8 max-w-[68ch]">
          {doc === 'contact' ? (
            <>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl rtl:tracking-normal">{s.contact.title}</h1>
              <p className="mt-3 text-md leading-relaxed text-muted">{s.contact.summary}</p>
              <dl className="mt-8 divide-y divide-line rounded-xl border border-line bg-surface">
                {(
                  [
                    ['mail', s.contact.email, COMPANY.email, COMPANY.email ? `mailto:${COMPANY.email}` : null],
                    ['phone', s.contact.phone, COMPANY.phone, COMPANY.phone ? `tel:${COMPANY.phone.replace(/[^\d+]/g, '')}` : null],
                    ['map-pin', s.contact.address, COMPANY.address, null],
                    ['clock', s.contact.hours, s.contact.hoursValue, null],
                  ] as const
                ).map(([icon, label, value, href]) => (
                  <div key={label} className="flex items-start gap-3 px-5 py-4">
                    <Icon name={icon} size={16} className="mt-0.5 shrink-0 text-faint" />
                    <dt className="w-28 shrink-0 text-sm text-muted">{label}</dt>
                    <dd className="min-w-0 flex-1 text-sm font-medium text-ink">
                      {!value ? (
                        <span className="text-faint">{s.contact.notSet}</span>
                      ) : href ? (
                        <a href={href} dir="ltr" className="text-accent hover:underline">
                          {value}
                        </a>
                      ) : (
                        value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl rtl:tracking-normal">{s.docs[doc].title}</h1>
              <p className="mt-2 text-sm text-faint">
                {s.updated}: {updated}
              </p>
              <p className="mt-5 text-md leading-relaxed text-muted">{fillLegal(s.docs[doc].summary)}</p>
              {s.docs[doc].sections.map((section, i) => (
                <section key={section.h} className="mt-8">
                  <h2 className="text-lg font-semibold">
                    {i + 1}. {section.h}
                  </h2>
                  {section.p.map((para) => (
                    <p key={para.slice(0, 40)} className="mt-2.5 text-base leading-relaxed text-ink/85">
                      {fillLegal(para)}
                    </p>
                  ))}
                </section>
              ))}
            </>
          )}
        </article>
      </div>

      <footer className="border-t border-line">
        <div className={`${WRAP} flex h-14 items-center text-xs text-faint`}>
          © {new Date().getFullYear()} {COMPANY.name}
        </div>
      </footer>
    </div>
  );
}
