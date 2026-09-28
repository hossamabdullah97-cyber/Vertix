'use client';

import { useTranslation } from 'react-i18next';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import { TEMPLATES } from '@/lib/templates';
import { Icon } from '@/components/Icon';
import { Initials, SectionHead, WRAP } from './shared';

/**
 * What the product does, one tile per job, each drawn with the app's own
 * pieces: the templates, the chip list, the leads, the board, the chart and
 * the team. The numbers and names in them are samples.
 */
export function Product() {
  const { t } = useTranslation('landing');
  return (
    <section id="product" aria-labelledby="product-title" className="scroll-mt-20 py-20 sm:py-28">
      <div className={WRAP}>
        <SectionHead id="product-title" label={t('product.label')} title={t('product.title')} subtitle={t('product.subtitle')} />

        <div className="mt-12 grid gap-4 lg:grid-cols-6">
          <Tile className="lg:col-span-4" title={t('product.card.title')} body={t('product.card.body')}>
            <Templates />
          </Tile>
          <Tile className="lg:col-span-2" title={t('product.chips.title')} body={t('product.chips.body')}>
            <Chips />
          </Tile>
          <Tile className="lg:col-span-2" title={t('product.leads.title')} body={t('product.leads.body')}>
            <Leads />
          </Tile>
          <Tile className="lg:col-span-4" title={t('product.pipeline.title')} body={t('product.pipeline.body')}>
            <Board />
          </Tile>
          <Tile className="lg:col-span-3" title={t('product.analytics.title')} body={t('product.analytics.body')}>
            <Chart />
          </Tile>
          <Tile className="lg:col-span-3" title={t('product.team.title')} body={t('product.team.body')}>
            <Team />
          </Tile>
        </div>

        <More />
      </div>
    </section>
  );
}

function Tile({ title, body, className = '', children }: { title: string; body: string; className?: string; children: React.ReactNode }) {
  return (
    <article className={`v-card flex flex-col overflow-hidden ${className}`}>
      <div className="p-6 pb-5">
        <h3 className="text-[16px] font-semibold tracking-tight text-ink">{title}</h3>
        <p className="mt-1.5 max-w-lg text-[14px] leading-relaxed text-muted">{body}</p>
      </div>
      {/* Illustration: read by the text above, not by a screen reader. */}
      <div aria-hidden className="mt-auto select-none px-6 pb-6">
        {children}
      </div>
    </article>
  );
}

/* --- Templates ----------------------------------------------------------- */

const SHOWN = ['swiss-blue', 'noir-teal', 'swiss-coral', 'carbon', 'swiss-green', 'noir-amber', 'swiss-violet', 'noir-pink', 'swiss-slate'];

function Templates() {
  const shown = SHOWN.map((id) => TEMPLATES.find((x) => x.id === id)!).filter(Boolean);
  return (
    <div className="-m-1 -me-6 flex gap-3 overflow-hidden p-1 [mask-image:linear-gradient(to_right,black_80%,transparent)] rtl:[mask-image:linear-gradient(to_left,black_80%,transparent)]">
      {shown.map((tpl, i) => (
        <MiniCard key={tpl.id} accent={tpl.accent} dark={tpl.mode === 'dark'} active={i === 0} />
      ))}
    </div>
  );
}

function MiniCard({ accent, dark, active }: { accent: string; dark: boolean; active: boolean }) {
  const line = dark ? 'bg-white/20' : 'bg-black/10';
  return (
    <div
      className={`relative h-[150px] w-[98px] shrink-0 overflow-hidden rounded-[10px] ring-1 ${dark ? 'bg-[#141416] ring-white/10' : 'bg-white ring-black/[0.08]'} ${active ? 'outline outline-2 outline-offset-2 outline-accent' : ''}`}
    >
      <div className="h-9" style={{ background: accent, opacity: dark ? 0.85 : 1 }} />
      <span className="absolute start-2.5 top-5 h-8 w-8 rounded-full ring-2" style={{ background: accent, ['--tw-ring-color' as string]: dark ? '#141416' : '#fff' }} />
      <div className="space-y-1.5 px-2.5 pt-8">
        <span className={`block h-1.5 w-14 rounded-full ${dark ? 'bg-white/70' : 'bg-black/70'}`} />
        <span className={`block h-1.5 w-10 rounded-full ${line}`} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5 px-2.5">
        <span className="h-4 rounded-[4px]" style={{ background: accent }} />
        <span className={`h-4 rounded-[4px] ring-1 ring-inset ${dark ? 'ring-white/20' : 'ring-black/10'}`} />
      </div>
      <div className="mt-1.5 space-y-1.5 px-2.5">
        <span className={`block h-4 rounded-[4px] ${dark ? 'bg-white/[0.06]' : 'bg-black/[0.04]'}`} />
      </div>
    </div>
  );
}

/* --- Chips --------------------------------------------------------------- */

function Chips() {
  const { t } = useTranslation('landing');
  const rows = [
    { uid: '04:A1:9C:3E:52:80', who: t('sample.name'), on: true },
    { uid: '04:7F:12:B8:6D:41', who: t('sample.people.karim'), on: true },
    { uid: '04:3C:E0:57:A9:16', who: t('sample.people.nour'), on: false },
  ];
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg bg-surface ring-1 ring-line">
      {rows.map((r) => (
        <li key={r.uid} className="flex items-center gap-3 px-3.5 py-2.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${r.on ? 'bg-emerald-500' : 'bg-faint/60'}`} />
          <span className="min-w-0 flex-1">
            <span dir="ltr" className="block truncate font-mono text-[12px] text-ink rtl:text-right">
              {r.uid}
            </span>
            <span className="block truncate text-[12px] text-muted">{r.who}</span>
          </span>
          <span className={`v-badge ${r.on ? 'v-badge-success' : 'v-badge-neutral'}`}>{r.on ? t('product.chips.active') : t('product.chips.disabled')}</span>
        </li>
      ))}
    </ul>
  );
}

/* --- Leads --------------------------------------------------------------- */

function Leads() {
  const { t } = useTranslation('landing');
  const { locale } = useLocale();
  const now = Date.now();
  const rows = [
    { name: t('sample.people.omar'), kind: 'MEETING', icon: 'calendar', ago: 2 * 60e3, hue: 215 },
    { name: t('sample.people.salma'), kind: 'QUOTE', icon: 'quote', ago: 64 * 60e3, hue: 340 },
    { name: t('sample.people.youssef'), kind: 'CONTACT', icon: 'user-plus', ago: 3 * 3600e3, hue: 150 },
  ];
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.name} className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2.5 ring-1 ring-line">
          <Initials name={r.name} hue={r.hue} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink">{r.name}</span>
            <span className="flex items-center gap-1 text-[12px] text-muted">
              <Icon name={r.icon} size={12} />
              <span className="truncate">{t(`product.leads.kinds.${r.kind}`)}</span>
            </span>
          </span>
          <span className="shrink-0 text-[11.5px] text-faint">{formatRelativeTime(now - r.ago, locale, 'short')}</span>
        </li>
      ))}
    </ul>
  );
}

/* --- Pipeline ------------------------------------------------------------ */

function Board() {
  const { t } = useTranslation(['landing', 'crm']);
  const columns: { stage: string; cards: { name: string; card: string; hot?: boolean }[]; className?: string }[] = [
    { stage: 'new', cards: [{ name: t('sample.people.omar'), card: t('sample.name'), hot: true }, { name: t('sample.people.youssef'), card: t('sample.people.karim') }] },
    { stage: 'contacted', cards: [{ name: t('sample.people.salma'), card: t('sample.name') }] },
    { stage: 'qualified', cards: [{ name: t('sample.people.laila'), card: t('sample.people.nour'), hot: true }], className: 'hidden sm:block' },
    { stage: 'proposal', cards: [{ name: t('sample.people.karim'), card: t('sample.name') }], className: 'hidden md:block' },
  ];
  return (
    <div className="flex gap-3">
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {columns.map((c) => (
          <div key={c.stage} className={`min-w-0 rounded-lg bg-elevated p-2 ring-1 ring-inset ring-line ${c.className ?? ''}`}>
            <p className="flex items-center justify-between px-1 pb-2 text-[12px] font-medium text-muted">
              <span className="truncate">{t(`crm:stages.${c.stage}`)}</span>
              <span className="tabular text-faint">{c.cards.length}</span>
            </p>
            <div className="space-y-1.5">
              {c.cards.map((card) => (
                <div key={card.name} className="rounded-md bg-surface px-2.5 py-2 shadow-sm ring-1 ring-line">
                  <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
                    <span className="truncate">{card.name}</span>
                    {card.hot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />}
                  </p>
                  <p className="truncate text-[11.5px] text-faint">{card.card}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex w-10 shrink-0 items-start justify-center rounded-lg bg-elevated pt-2 text-[12px] font-medium text-faint ring-1 ring-inset ring-line">
        <span dir="ltr">{t('landing:product.pipeline.more', { count: 3 })}</span>
      </div>
    </div>
  );
}

/* --- Analytics ----------------------------------------------------------- */

// Thirty days of sample views: this period and the one before.
const NOW = [28, 31, 29, 34, 32, 36, 33, 35, 38, 36, 40, 37, 41, 39, 43, 42, 46, 44, 48, 58, 52, 47, 49, 51, 50, 53, 52, 55, 54, 57];
const BEFORE = [24, 26, 25, 27, 26, 28, 27, 29, 28, 30, 29, 31, 30, 32, 31, 33, 32, 33, 34, 36, 35, 34, 35, 36, 35, 37, 36, 38, 37, 38];

function path(values: number[], w: number, h: number, max: number) {
  const step = w / (values.length - 1);
  return values.map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)} ${(h - (v / max) * h).toFixed(1)}`).join(' ');
}

function Chart() {
  const { t } = useTranslation('landing');
  const { locale } = useLocale();
  const W = 400;
  const H = 110;
  const max = 64;
  const line = path(NOW, W, H, max);
  return (
    <div className="rounded-lg bg-surface p-4 ring-1 ring-line">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[12px] text-muted">{t('product.analytics.views')}</p>
          <p className="mt-1 flex items-center gap-2">
            <span className="tabular text-[22px] font-semibold leading-none tracking-tight text-ink">{formatNumber(1232, locale)}</span>
            <span dir="ltr" className="v-badge v-badge-success">
              +28%
            </span>
          </p>
        </div>
        <p className="flex items-center gap-3 text-[11.5px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full bg-accent" /> {t('product.analytics.views')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-3 border-t border-dashed border-faint" /> {t('product.analytics.previous')}
          </span>
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-4 block h-[110px] w-full overflow-visible">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="stroke-line" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={`${line} L${W} ${H} L0 ${H} Z`} className="fill-accent/[0.08]" />
        <path d={path(BEFORE, W, H, max)} fill="none" className="stroke-faint" strokeWidth="1.5" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        <path d={line} fill="none" className="stroke-accent" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

/* --- Team ---------------------------------------------------------------- */

function Team() {
  const { t } = useTranslation(['landing', 'teams']);
  const people = [
    { name: t('sample.name'), role: 'OWNER', hue: 215, accent: '#2563eb' },
    { name: t('sample.people.karim'), role: 'ADMIN', hue: 25, accent: '#d85a30' },
    { name: t('sample.people.nour'), role: 'MANAGER', hue: 160, accent: '#1d9e75' },
    { name: t('sample.people.laila'), role: 'EMPLOYEE', hue: 280, accent: '#7c3aed' },
  ];
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg bg-surface ring-1 ring-line">
      {people.map((p) => (
        <li key={p.role} className="flex items-center gap-3 px-3.5 py-2.5">
          <Initials name={p.name} hue={p.hue} />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{p.name}</span>
          {/* Their own card, in their own colour. */}
          <span className="h-3.5 w-5 shrink-0 rounded-[3px]" style={{ background: p.accent }} />
          <span className="w-20 shrink-0 text-end text-[12px] text-muted">{t(`teams:roles.${p.role}.name`)}</span>
        </li>
      ))}
    </ul>
  );
}

/* --- Also included ------------------------------------------------------- */

const MORE = [
  { id: 'save', icon: 'user-plus' },
  { id: 'qr', icon: 'qr' },
  { id: 'profiles', icon: 'layers' },
  { id: 'payments', icon: 'link' },
  { id: 'webhooks', icon: 'send' },
  { id: 'slack', icon: 'bell' },
] as const;

function More() {
  const { t } = useTranslation('landing');
  return (
    <div className="mt-4 rounded-xl bg-elevated/60 p-6 ring-1 ring-inset ring-line">
      <h3 className="text-[13px] font-medium text-muted">{t('product.more.title')}</h3>
      <ul className="mt-4 grid gap-x-6 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {MORE.map((m) => (
          <li key={m.id} className="flex items-center gap-3 text-[14px] text-ink">
            <span className="v-icon-tile !h-7 !w-7 bg-surface">
              <Icon name={m.icon} size={14} />
            </span>
            {t(`product.more.items.${m.id}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
