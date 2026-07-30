import Link from 'next/link';
import { VMark } from '@/components/brand/VMark';
import { Icon } from '@/components/Icon';

const FEATURES = [
  { icon: 'tag', title: 'NFC Smart Cards', desc: 'Register physical NFC chips and bind them to any digital profile. Every tap opens your live card instantly.' },
  { icon: 'grid', title: 'Digital Business Cards', desc: 'Build rich profiles with contact actions, social links, and content sections — published live in one click.' },
  { icon: 'layers', title: 'Template Marketplace', desc: '19 premium templates with a live design studio and side-by-side compare view to find your look.' },
  { icon: 'inbox', title: 'Built-in CRM', desc: 'A 7-stage sales pipeline with board and table views, contacts, companies, tasks, and lead scoring.' },
  { icon: 'chart-bar', title: 'Real Analytics', desc: 'Track profile views, taps, clicks and saves. See top-performing cards and a real conversion funnel.' },
  { icon: 'users', title: 'Teams & Workspaces', desc: 'Multi-tenant organizations with roles, teams, member directory, and per-workspace isolation.' },
];

const STEPS = [
  { icon: 'grid', title: 'Create your card', desc: 'Design a digital profile in the studio — pick a template, add your details and tap actions.' },
  { icon: 'tag', title: 'Tap or share', desc: 'Link a physical NFC chip or share your QR. One tap opens your live profile on any phone.' },
  { icon: 'inbox', title: 'Capture leads', desc: 'Every save and interaction lands in your CRM pipeline, ready to convert and track.' },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-canvas text-ink">
      {/* Nav */}
      <header className="v-glass sticky top-0 z-30">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[11px] text-white shadow-md" style={{ background: 'var(--v-gradient-brand)' }}>
              <VMark size={17} strokeWidth={3} />
            </span>
            <span className="v-display text-[16px] font-extrabold tracking-tight">Vertex Connect</span>
          </Link>
          <nav className="hidden items-center gap-7 text-[13.5px] font-semibold text-muted md:flex">
            <a href="#features" className="transition-colors hover:text-ink">Features</a>
            <a href="#how" className="transition-colors hover:text-ink">How it works</a>
          </nav>
          <div className="flex items-center gap-2.5">
            <Link href="/login" className="v-btn v-btn-ghost !h-9 px-4 text-[13px]">Sign in</Link>
            <Link href="/dashboard" className="v-btn !h-9 px-4 text-[13px]">Open dashboard</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-[20%] left-1/2 h-[520px] w-[880px] -translate-x-1/2 rounded-full opacity-[0.14]" style={{ background: 'radial-gradient(closest-side, #2563eb, transparent)' }} />
        </div>
        <div className="relative mx-auto max-w-3xl px-5 pt-20 pb-16 text-center sm:pt-28">
          <span className="v-badge v-badge-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Production NFC + CRM platform
          </span>
          <h1 className="v-display mt-6 text-[40px] font-extrabold leading-[1.08] tracking-tight sm:text-[56px]">
            Turn every tap into a<br className="hidden sm:block" /> tracked business opportunity.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[16px] font-medium leading-relaxed text-muted">
            NFC smart cards, premium digital profiles, a built-in CRM, and real analytics — one platform to unify and scale your organization's real-world connections.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/dashboard" className="v-btn !h-11 px-6 text-[14.5px] font-bold">
              <Icon name="arrow" size={17} /> Open dashboard
            </Link>
            <Link href="/login" className="v-btn v-btn-ghost !h-11 px-6 text-[14.5px] font-bold">Sign in</Link>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12.5px] font-semibold text-faint">
            <span className="flex items-center gap-1.5"><Icon name="lock" size={13} /> Multi-tenant isolation</span>
            <span className="flex items-center gap-1.5"><Icon name="inbox" size={13} /> 7-stage pipeline</span>
            <span className="flex items-center gap-1.5"><Icon name="tag" size={13} /> Native NFC programming</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <span className="v-section-label">Everything in one platform</span>
          <h2 className="v-display mt-2 text-[30px] font-extrabold tracking-tight sm:text-[36px]">Built to connect and convert</h2>
          <p className="mt-3 text-[15px] font-medium text-muted">From the first tap to a closed deal — every capability works on real data, no mock dashboards.</p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="v-card v-card-hover p-6">
              <span className="v-icon-tile"><Icon name={f.icon} size={17} /></span>
              <h3 className="mt-4 text-[16px] font-extrabold tracking-tight text-ink">{f.title}</h3>
              <p className="mt-1.5 text-[13.5px] font-medium leading-relaxed text-muted">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-5 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <span className="v-section-label">How it works</span>
          <h2 className="v-display mt-2 text-[30px] font-extrabold tracking-tight sm:text-[36px]">Three steps to your first lead</h2>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="v-card p-6">
              <div className="flex items-center justify-between">
                <span className="v-icon-tile"><Icon name={s.icon} size={17} /></span>
                <span className="v-display text-[34px] font-extrabold leading-none text-line">0{i + 1}</span>
              </div>
              <h3 className="mt-4 text-[16px] font-extrabold tracking-tight text-ink">{s.title}</h3>
              <p className="mt-1.5 text-[13.5px] font-medium leading-relaxed text-muted">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="v-hero px-8 py-14 text-center sm:px-16">
          <div className="relative z-10">
            <h2 className="v-display text-[30px] font-extrabold tracking-tight text-white sm:text-[38px]">Ready to connect smarter?</h2>
            <p className="mx-auto mt-3 max-w-lg text-[15px] font-medium text-white/80">
              Open your workspace and build your first NFC-powered digital card in minutes.
            </p>
            <div className="mt-7 flex items-center justify-center gap-3">
              <Link href="/dashboard" className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-6 text-[14.5px] font-bold text-[#1d4ed8] shadow-sm transition-transform hover:-translate-y-0.5">
                <Icon name="arrow" size={17} /> Open dashboard
              </Link>
              <Link href="/login" className="inline-flex h-11 items-center rounded-xl border border-white/25 bg-white/10 px-6 text-[14.5px] font-bold text-white backdrop-blur transition-colors hover:bg-white/20">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] text-white" style={{ background: 'var(--v-gradient-brand)' }}>
              <VMark size={15} strokeWidth={3} />
            </span>
            <span className="v-display text-[14px] font-extrabold tracking-tight">Vertex Connect</span>
          </div>
          <p className="text-[12.5px] font-medium text-faint">NFC digital business cards &amp; CRM · Built for teams.</p>
          <div className="flex items-center gap-4 text-[13px] font-semibold text-muted">
            <Link href="/login" className="transition-colors hover:text-ink">Sign in</Link>
            <Link href="/dashboard" className="transition-colors hover:text-ink">Dashboard</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
