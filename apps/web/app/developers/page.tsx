import type { Metadata } from 'next';
import Link from 'next/link';
import { API_ENDPOINTS, API_GROUPS, SCOPE_DOCS, WEBHOOK_EVENT_DOCS, WEBHOOK_PAYLOAD_EXAMPLE, type ApiEndpoint, type ApiField } from '@vertex/shared/dist/api-reference';
import { serverLocale } from '@/lib/i18n/server';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { Brand, WRAP } from '@/components/landing/shared';
import { Icon } from '@/components/Icon';
import { API_BASE, DEV_STRINGS, VERIFY_SNIPPET, curlFor } from '@/lib/developers';

export async function generateMetadata(): Promise<Metadata> {
  const s = DEV_STRINGS[(await serverLocale())];
  return { title: `${s.title} · Vertex Connect`, description: s.lead };
}

const METHOD_TONE: Record<string, string> = {
  GET: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  POST: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  PATCH: 'bg-amber-500/10 text-amber-800 dark:text-amber-300',
  PUT: 'bg-amber-500/10 text-amber-800 dark:text-amber-300',
  DELETE: 'bg-red-500/10 text-red-700 dark:text-red-300',
};

/** Code reads left to right in either language. */
function Code({ children, label }: { children: string; label?: string }) {
  return (
    <figure className="min-w-0">
      {label && <figcaption className="mb-1.5 text-xs font-medium text-muted">{label}</figcaption>}
      <pre dir="ltr" className="overflow-x-auto rounded-xl bg-[#0f1117] p-4 text-start font-mono text-xs leading-relaxed text-slate-100">
        <code>{children}</code>
      </pre>
    </figure>
  );
}

function Fields({ title, fields, s, lang }: { title: string; fields: ApiField[]; s: (typeof DEV_STRINGS)['en']['endpoint']; lang: 'en' | 'ar' }) {
  return (
    <div className="mt-5">
      <h4 className="mb-2 text-xs font-semibold text-ink">{title}</h4>
      <div className="overflow-x-auto rounded-xl ring-1 ring-inset ring-line">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-line text-start text-xs text-faint">
              <th className="px-3 py-2 text-start font-medium">{s.name}</th>
              <th className="px-3 py-2 text-start font-medium">{s.type}</th>
              <th className="px-3 py-2 text-start font-medium">{s.about}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {fields.map((f) => (
              <tr key={f.name} className="align-top">
                <td className="whitespace-nowrap px-3 py-2.5">
                  <code dir="ltr" className="font-mono text-xs font-semibold text-ink">
                    {f.name}
                  </code>
                  <span className={`ms-2 text-2xs ${f.required ? 'text-red-600 dark:text-red-400' : 'text-faint'}`}>{f.required ? s.required : s.optional}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted" dir="ltr">
                  {f.type}
                  {f.nullable ? ` | null` : ''}
                </td>
                <td className="px-3 py-2.5 text-muted">
                  {f.desc[lang]}
                  {f.enum && (
                    <span className="mt-1 block text-xs">
                      {s.oneOf}:{' '}
                      {f.enum.map((v) => (
                        <code key={v} dir="ltr" className="me-1 rounded bg-elevated px-1 py-0.5 font-mono text-2xs text-ink">
                          {v}
                        </code>
                      ))}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Endpoint({ e, lang }: { e: ApiEndpoint; lang: 'en' | 'ar' }) {
  const s = DEV_STRINGS[lang].endpoint;
  return (
    <section id={e.id} className="scroll-mt-24 border-t border-line py-10 first:border-t-0" data-testid="endpoint">
      <h3 className="text-lg font-semibold text-ink">{e.summary[lang]}</h3>
      <p dir="ltr" className="mt-2 flex flex-wrap items-center gap-2 text-start">
        <span className={`rounded-md px-2 py-0.5 font-mono text-xs font-semibold ${METHOD_TONE[e.method]}`}>{e.method}</span>
        <code className="font-mono text-sm text-ink">{e.path}</code>
      </p>
      {e.desc && <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-muted">{e.desc[lang]}</p>}
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          {s.scope}:{' '}
          <code dir="ltr" className="rounded bg-elevated px-1.5 py-0.5 font-mono text-ink">
            {e.scope}
          </code>
        </span>
        {e.roles && (
          <span>
            {s.roles} <bdi className="font-mono">{e.roles.join(', ')}</bdi>
          </span>
        )}
      </p>
      <div className="grid gap-x-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {e.pathParams && <Fields title={s.pathParams} fields={e.pathParams} s={s} lang={lang} />}
          {e.query && <Fields title={s.query} fields={e.query} s={s} lang={lang} />}
          {e.body && <Fields title={s.body} fields={e.body} s={s} lang={lang} />}
        </div>
        <div className="mt-5 min-w-0 space-y-4">
          <Code label={s.request}>{curlFor(e.method, e.path, e.request)}</Code>
          <Code label={`${s.response} · ${e.status}`}>{JSON.stringify(e.response, null, 2)}</Code>
        </div>
      </div>
    </section>
  );
}

/**
 * The public API, for the developers connecting a workspace to their own
 * systems: how to authenticate, what fails how, webhooks and how to check
 * them, and every endpoint with an example. Server-rendered, open to anyone.
 */
export default async function DevelopersPage() {
  const lang = (await serverLocale());
  const t = DEV_STRINGS[lang];
  const guide = [
    { id: 'start', title: t.sections.start.title },
    { id: 'auth', title: t.sections.auth.title },
    { id: 'errors', title: t.sections.errors.title },
    { id: 'limits', title: t.sections.limits.title },
    { id: 'webhooks', title: t.sections.webhooks.title },
  ];

  return (
    <div className="min-h-screen bg-canvas text-ink antialiased">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className={`${WRAP} flex h-16 items-center justify-between gap-3`}>
          <Brand />
          <div className="flex items-center gap-2">
            <span className="hidden sm:block">
              <a href={`${API_BASE}/openapi.json`} className="v-btn v-btn-ghost" download="vertex-connect-openapi.json">
                <Icon name="download" size={14} /> {t.openapi}
              </a>
            </span>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <div className={`${WRAP} grid gap-10 py-10 lg:grid-cols-[220px_minmax(0,1fr)]`}>
        <nav aria-label={t.contents} className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] space-y-5 overflow-y-auto pb-6 text-sm">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-faint">{t.guide}</p>
              {guide.map((g) => (
                <a key={g.id} href={`#${g.id}`} className="block rounded-md px-2 py-1.5 text-muted hover:bg-elevated hover:text-ink">
                  {g.title}
                </a>
              ))}
            </div>
            {API_GROUPS.map((g) => (
              <div key={g.id}>
                <p className="mb-1.5 text-xs font-semibold text-faint">{g.title[lang]}</p>
                {API_ENDPOINTS.filter((e) => e.group === g.id).map((e) => (
                  <a key={e.id} href={`#${e.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted hover:bg-elevated hover:text-ink">
                    <span dir="ltr" className={`w-12 shrink-0 font-mono text-2xs font-semibold ${METHOD_TONE[e.method]!.split(' ').slice(1).join(' ')}`}>
                      {e.method}
                    </span>
                    <span className="truncate">{e.summary[lang]}</span>
                  </a>
                ))}
              </div>
            ))}
          </div>
        </nav>

        <main className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl rtl:tracking-normal">{t.title}</h1>
          <p className="mt-3 max-w-[64ch] text-md leading-relaxed text-muted">{t.lead}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/integrations?tab=keys" className="v-btn v-btn-primary">
              <Icon name="lock" size={14} /> {t.getKey}
            </Link>
            <a href={`${API_BASE}/openapi.json`} className="v-btn" download="vertex-connect-openapi.json">
              <Icon name="download" size={14} /> {t.openapi}
            </a>
          </div>

          <div className="mt-12 max-w-[72ch] space-y-12">
            <section id="start" className="scroll-mt-24">
              <h2 className="text-xl font-semibold">{t.sections.start.title}</h2>
              {t.sections.start.p.map((p) => (
                <p key={p} className="mt-3 text-sm leading-relaxed text-muted">
                  {p}
                </p>
              ))}
              <div className="mt-4">
                <Code>{API_BASE}</Code>
              </div>
            </section>

            <section id="auth" className="scroll-mt-24">
              <h2 className="text-xl font-semibold">{t.sections.auth.title}</h2>
              {t.sections.auth.p.map((p) => (
                <p key={p} className="mt-3 text-sm leading-relaxed text-muted">
                  {p}
                </p>
              ))}
              <div className="mt-4">
                <Code>{`curl ${API_BASE}/leads \\\n  -H "Authorization: Bearer vxk_live_…"`}</Code>
              </div>
              <h3 className="mt-6 text-sm font-semibold">{t.sections.auth.scopes}</h3>
              <dl className="mt-2 divide-y divide-line rounded-xl ring-1 ring-inset ring-line">
                {SCOPE_DOCS.map((sc) => (
                  <div key={sc.scope} className="flex gap-4 px-4 py-2.5 text-sm">
                    <dt className="w-36 shrink-0">
                      <code dir="ltr" className="font-mono text-xs text-ink">
                        {sc.scope}
                      </code>
                    </dt>
                    <dd className="text-muted">{sc.desc[lang]}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section id="errors" className="scroll-mt-24">
              <h2 className="text-xl font-semibold">{t.sections.errors.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">{t.sections.errors.p[0]}</p>
              <dl className="mt-4 divide-y divide-line rounded-xl ring-1 ring-inset ring-line">
                {t.sections.errors.codes.map(([code, what]) => (
                  <div key={code} className="flex gap-4 px-4 py-2.5 text-sm">
                    <dt className="tabular w-12 shrink-0 font-mono text-xs font-semibold text-ink">{code}</dt>
                    <dd className="text-muted">{what}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4">
                <Code>{JSON.stringify({ statusCode: 403, message: 'This token is missing the required scope(s): crm:write' }, null, 2)}</Code>
              </div>
            </section>

            <section id="limits" className="scroll-mt-24">
              <h2 className="text-xl font-semibold">{t.sections.limits.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">{t.sections.limits.p[0]}</p>
            </section>

            <section id="webhooks" className="scroll-mt-24">
              <h2 className="text-xl font-semibold">{t.sections.webhooks.title}</h2>
              {t.sections.webhooks.p.map((p) => (
                <p key={p} className="mt-3 text-sm leading-relaxed text-muted">
                  {p}
                </p>
              ))}
              <h3 className="mt-6 text-sm font-semibold">{t.sections.webhooks.events}</h3>
              <dl className="mt-2 divide-y divide-line rounded-xl ring-1 ring-inset ring-line" data-testid="webhook-events">
                {WEBHOOK_EVENT_DOCS.map((w) => (
                  <div key={w.event} className="flex gap-4 px-4 py-2.5 text-sm">
                    <dt className="w-40 shrink-0">
                      <code dir="ltr" className="font-mono text-xs text-ink">
                        {w.event}
                      </code>
                    </dt>
                    <dd className="text-muted">{w.desc[lang]}</dd>
                  </div>
                ))}
              </dl>
              <h3 className="mt-6 text-sm font-semibold">{t.sections.webhooks.headers}</h3>
              <div className="mt-2 space-y-4">
                <Code>{`X-Vertex-Signature: t=1791286435,v1=5f2c…\nX-Vertex-Event: lead.created\nX-Vertex-Event-Id: ${WEBHOOK_PAYLOAD_EXAMPLE.id}\nX-Vertex-Delivery: cm3k9x2dlv001`}</Code>
                <Code>{JSON.stringify(WEBHOOK_PAYLOAD_EXAMPLE, null, 2)}</Code>
                <Code label={t.sections.webhooks.verify}>{VERIFY_SNIPPET}</Code>
              </div>
            </section>
          </div>

          <h2 className="mt-16 text-2xl font-semibold">{t.reference}</h2>
          {API_GROUPS.map((g) => (
            <div key={g.id} id={`group-${g.id}`} className="mt-10 scroll-mt-24">
              <h2 className="text-xl font-semibold">{g.title[lang]}</h2>
              <p className="mt-1 text-sm text-muted">{g.desc[lang]}</p>
              <div className="mt-2">
                {API_ENDPOINTS.filter((e) => e.group === g.id).map((e) => (
                  <Endpoint key={e.id} e={e} lang={lang} />
                ))}
              </div>
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}
