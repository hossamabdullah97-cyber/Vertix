'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/ui/Sheet';
import { GO_TO, notForShortcuts, runPageShortcut, usePageShortcuts } from '@/lib/shortcuts';

/** Opens the list from elsewhere (the account menu). */
export const SHOW_SHORTCUTS = 'vertex:shortcuts';

/** Listens for the shortcuts (lib/shortcuts.ts) and shows their list on "?". */
export function Shortcuts({ onSearch }: { onSearch: () => void }) {
  const { t } = useTranslation('nav');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const pending = useRef<number | null>(null); // G was pressed; the next letter picks the page
  const page = usePageShortcuts();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (notForShortcuts(e)) return;
      const key = e.key.toLowerCase();
      if (pending.current !== null) {
        window.clearTimeout(pending.current);
        pending.current = null;
        const to = GO_TO.find((g) => g.key === key);
        if (to) {
          e.preventDefault();
          router.push(to.href);
        }
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === '/') {
        e.preventDefault();
        onSearch();
      } else if (key === 'g') {
        pending.current = window.setTimeout(() => (pending.current = null), 1200);
      } else if (runPageShortcut(key)) {
        e.preventDefault();
      }
    };
    const show = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(SHOW_SHORTCUTS, show);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(SHOW_SHORTCUTS, show);
    };
  }, [router, onSearch]);

  const Row = ({ keys, label }: { keys: string[]; label: string }) => (
    <li className="flex min-h-10 items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-ink">{label}</span>
      <span className="flex shrink-0 items-center gap-1 text-xs text-faint">
        {keys.map((k, i) =>
          k === '+' ? (
            <span key={i}>{t('shortcuts.then')}</span>
          ) : (
            <kbd key={i} className="v-kbd">
              {k}
            </kbd>
          ),
        )}
      </span>
    </li>
  );

  return (
    <Sheet open={open} onClose={() => setOpen(false)} title={t('shortcuts.title')} subtitle={t('shortcuts.intro')} closeLabel={t('shortcuts.close')}>
      <div className="space-y-6">
        {page.length > 0 && (
          <section>
            <h3 className="mb-1 text-xs font-medium text-faint">{t('shortcuts.thisPage')}</h3>
            <ul className="divide-y divide-line">
              {page.map((s) => (
                <Row key={s.key} keys={[s.key.toUpperCase()]} label={s.label} />
              ))}
            </ul>
          </section>
        )}
        <section>
          <h3 className="mb-1 text-xs font-medium text-faint">{t('shortcuts.general')}</h3>
          <ul className="divide-y divide-line">
            <Row keys={['/']} label={t('shortcuts.search')} />
            <Row keys={['?']} label={t('shortcuts.help')} />
          </ul>
        </section>
        <section>
          <h3 className="mb-1 text-xs font-medium text-faint">{t('shortcuts.goTo')}</h3>
          <ul className="divide-y divide-line">
            {GO_TO.map((g) => (
              <Row key={g.key} keys={['G', '+', g.key.toUpperCase()]} label={t(g.labelKey)} />
            ))}
          </ul>
        </section>
      </div>
    </Sheet>
  );
}
