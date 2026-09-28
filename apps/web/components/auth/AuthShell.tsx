'use client';

import { useTranslation } from 'react-i18next';
import { useStoredTheme } from '@/lib/useStoredTheme';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { Brand } from '@/components/landing/shared';
import { HeroVisual } from '@/components/landing/HeroVisual';

/**
 * The frame every sign-in page shares: the form on a quiet sheet, and beside
 * it on wide screens the same card the landing page shows, so arriving here
 * does not feel like leaving the product.
 */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  const { t } = useTranslation('auth');
  const theme = useStoredTheme();

  return (
    <div data-theme={theme} className="min-h-screen bg-canvas text-ink antialiased">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="flex min-h-screen flex-col bg-surface px-4 sm:px-8">
          <header className="flex h-16 shrink-0 items-center justify-between gap-3">
            <Brand />
            <LanguageSwitcher />
          </header>
          <main className="flex flex-1 items-center justify-center py-10">
            <div className="w-full max-w-[380px]">
              <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink rtl:tracking-normal">{title}</h1>
              {subtitle && <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{subtitle}</p>}
              <div className="mt-8">{children}</div>
            </div>
          </main>
          <footer className="flex h-14 shrink-0 items-center text-[12.5px] text-faint">© {new Date().getFullYear()} Vertex Connect</footer>
        </div>

        <aside className="relative hidden flex-col items-center justify-center overflow-hidden border-s border-line px-10 py-12 lg:flex">
          <div className="w-full max-w-[540px] [@media(max-height:820px)]:scale-[0.86]">
            <HeroVisual />
          </div>
          <p className="mt-2 max-w-sm text-center text-[15px] leading-relaxed text-muted">{t('showcase')}</p>
        </aside>
      </div>
    </div>
  );
}
