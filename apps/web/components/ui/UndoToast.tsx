'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { dismissUndo, takeUndo, useUndoOffer } from '@/lib/undo';

/**
 * The offer from lib/undo.ts: what was removed, an Undo button, and ⌘Z /
 * Ctrl+Z while it is up (not while typing, where the field's own undo wins).
 * If the undo fails, its reason takes the offer's place for a moment.
 */
export function UndoToast() {
  const { t } = useTranslation('common');
  const offer = useUndoOffer();
  const [failed, setFailed] = useState('');

  const undo = () => {
    setFailed('');
    takeUndo().catch((e) => {
      setFailed((e as Error).message || t('undo.failed'));
      setTimeout(() => setFailed(''), 4000);
    });
  };

  useEffect(() => {
    if (!offer) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer]);

  const text = failed || offer?.message;
  return (
    <AnimatePresence>
      {text && (
        <motion.div
          key={failed ? 'failed' : offer?.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 bottom-[calc(1.5rem+var(--v-dock,0px))] z-[70] mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-1 rounded-lg bg-[#17171a] py-1.5 pe-1.5 ps-3.5 text-sm font-medium text-white shadow-lg"
        >
          <span className="me-2 truncate">{text}</span>
          {!failed && (
            <>
              <button
                type="button"
                onClick={undo}
                className="h-11 rounded-md px-3 font-semibold text-[#9ec1ff] transition-colors hover:bg-white/10 sm:h-8"
              >
                {t('undo.action')}
              </button>
              <button
                type="button"
                onClick={dismissUndo}
                aria-label={t('actions.close')}
                className="flex h-11 w-11 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white sm:h-8 sm:w-8"
              >
                <Icon name="x" size={14} />
              </button>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
