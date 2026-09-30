'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from '@/components/Icon';
import { useLocale } from '@/components/i18n/LanguageProvider';

/**
 * A panel that slides in from the end edge, the same shape as the lead panel.
 * Escape and the backdrop close it.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  closeLabel,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  closeLabel: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { dir } = useLocale();
  // Slides in from the edge it sits on, which is the left in Arabic.
  const dx = dir === 'rtl' ? -24 : 24;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-canvas/60"
          />
          <motion.aside
            initial={{ opacity: 0, x: dx }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dx }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            role="dialog"
            aria-modal="true"
            className="fixed inset-y-0 end-0 z-50 flex w-full max-w-[440px] flex-col bg-surface shadow-2xl sm:inset-y-2 sm:end-2 sm:rounded-[14px] sm:ring-1 sm:ring-line"
          >
            <header className="flex items-start gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="text-md font-semibold text-ink">{title}</div>
                {subtitle && <div className="mt-0.5 text-xs text-faint">{subtitle}</div>}
              </div>
              <button
                onClick={onClose}
                aria-label={closeLabel}
                className="-m-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-ink sm:h-8 sm:w-8"
              >
                <Icon name="x" size={16} />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <footer className="border-t border-line px-5 py-3">{footer}</footer>}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
