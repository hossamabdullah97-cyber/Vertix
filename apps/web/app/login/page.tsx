'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { login, register } from '@/lib/client';
import { VMark } from '@/components/brand/VMark';
import { Icon } from '@/components/Icon';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useTranslation(['auth', 'common']);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('owner@vertex.dev');
  const [password, setPassword] = useState('Password123!');
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register({ email, password, name, organizationName: org });
      window.location.href = '/dashboard';
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-canvas text-ink lg:grid-cols-[1.1fr_1fr] relative overflow-hidden">
      {/* Brand panel (SaaS modern look) */}
      <div className="relative hidden overflow-hidden lg:flex flex-col justify-between p-16 bg-[#030303] border-e border-white/5">
        {/* Animated Mesh Gradients */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] rounded-full bg-blue-700/30 filter blur-[90px] animate-mesh-1" />
          <div className="absolute -bottom-[10%] -right-[10%] w-[60%] h-[60%] rounded-full bg-blue-700/20 filter blur-[100px] animate-mesh-2" />
          <div className="absolute top-[30%] right-[10%] w-[40%] h-[40%] rounded-full bg-blue-600/20 filter blur-[110px] animate-mesh-1" />
        </div>

        {/* Top Header */}
        <div className="relative flex items-center gap-3 text-white z-10">
          <span className="flex h-10 w-10 items-center justify-center rounded-[12px] shadow-lg shadow-blue-600/10" style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}>
            <VMark size={18} strokeWidth={3} />
          </span>
          <span className="v-display text-[17px] font-extrabold tracking-tight">Vertex Connect</span>
        </div>

        {/* Hero Section */}
        <div className="relative max-w-lg z-10 my-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-white/5 text-blue-400 border border-white/10 mb-6">
            <Icon name="sparkle" size={12} /> {t('auth:brand.badge')}
          </span>
          <h2 className="v-display text-[44px] font-extrabold leading-[1.12] text-white tracking-tight">
            {t('auth:brand.headline')}
          </h2>
          <p className="mt-5 text-[15.5px] leading-relaxed text-white/60 font-medium">
            {t('auth:brand.description')}
          </p>
        </div>

        {/* Footer */}
        <div className="relative flex items-center gap-5 text-[12px] font-semibold text-white/35 z-10">
          <span className="flex items-center gap-1.5"><Icon name="lock" size={13} /> {t('auth:brand.featureIsolation')}</span>
          <span className="flex items-center gap-1.5"><Icon name="inbox" size={13} /> {t('auth:brand.featurePipeline')}</span>
          <span className="flex items-center gap-1.5"><Icon name="tag" size={13} /> {t('auth:brand.featureNfc')}</span>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-12 bg-canvas relative">
        {/* Subtle blur circles for background depth on mobile */}
        <div className="absolute -top-[10%] right-0 w-[200px] h-[200px] rounded-full bg-blue-600/5 filter blur-[60px] pointer-events-none lg:hidden" />
        <div className="absolute -bottom-[10%] left-0 w-[200px] h-[200px] rounded-full bg-blue-600/5 filter blur-[60px] pointer-events-none lg:hidden" />

        <div className="w-full max-w-[390px] space-y-8">
          <div className="space-y-6">
            <div className="flex items-center gap-3 lg:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-[10px] text-white" style={{ background: 'var(--v-accent)' }}>
                <VMark size={16} strokeWidth={3} />
              </span>
              <span className="v-display text-[16px] font-extrabold tracking-tight">Vertex Connect</span>
            </div>

            <div className="space-y-2">
              <h1 className="v-display text-[28px] font-extrabold tracking-tight text-ink">
                {mode === 'login' ? t('auth:login.title') : t('auth:register.title')}
              </h1>
              <p className="text-[14px] text-muted font-medium">
                {mode === 'login' ? t('auth:login.subtitle') : t('auth:register.subtitle')}
              </p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <div className="grid gap-4 sm:grid-cols-1">
                <Field label={t('auth:register.name')}>
                  <input className="v-field" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('auth:register.namePlaceholder')} />
                </Field>
                <Field label={t('auth:register.organization')}>
                  <input className="v-field" value={org} onChange={(e) => setOrg(e.target.value)} placeholder={t('auth:register.organizationPlaceholder')} required />
                </Field>
              </div>
            )}

            <Field label={t('auth:login.email')}>
              <input type="email" dir="ltr" className="v-field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('auth:login.emailPlaceholder')} required />
            </Field>

            <Field
              label={t('auth:login.password')}
              hint={
                mode === 'login' ? (
                  <a href="/forgot-password" className="text-[12px] font-bold text-accent transition-colors hover:text-accent/80">
                    {t('auth:login.forgot')}
                  </a>
                ) : undefined
              }
            >
              <input type="password" dir="ltr" className="v-field" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </Field>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-[13px] font-medium">
                <Icon name="x" size={15} />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={busy} className="v-btn w-full mt-4 h-11 text-[14.5px] font-bold">
              {busy ? t('auth:login.submitting') : mode === 'login' ? t('auth:login.submit') : t('auth:register.submit')}
            </button>
          </form>

          <div className="border-t border-line/70 pt-6 text-center space-y-4">
            <p className="text-[13.5px] text-muted font-medium">
              {mode === 'login' ? (
                <>
                  {t('auth:login.switchPrompt')}{' '}
                  <button onClick={() => setMode('register')} className="font-bold text-accent hover:underline">
                    {t('auth:login.switchAction')}
                  </button>
                </>
              ) : (
                <>
                  {t('auth:register.switchPrompt')}{' '}
                  <button onClick={() => setMode('login')} className="font-bold text-accent hover:underline">
                    {t('auth:register.switchAction')}
                  </button>
                </>
              )}
            </p>

            <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-canvas border border-line text-[11.5px] text-faint font-semibold tracking-wide">
              <Icon name="lock" size={12} /> <span>{t('auth:sandbox')}</span> <span dir="ltr" className="font-mono text-ink">owner@vertex.dev</span> / <span dir="ltr" className="font-mono text-ink">Password123!</span>
            </div>

            <div className="flex justify-center pt-2">
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[12.5px] font-bold text-muted uppercase tracking-wider">{label}</label>
        {hint}
      </div>
      {children}
    </div>
  );
}
