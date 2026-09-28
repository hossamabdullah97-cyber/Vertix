'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * Asks before something that cannot be undone. The confirm action may be
 * async; an error it throws is shown in the dialog, which then stays open.
 * Focus starts on Cancel so Enter never confirms by accident.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  busyLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  busyLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setError('');
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center"
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-body"
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[420px] rounded-xl border border-line bg-surface p-5 shadow-lg"
          >
            <h2 id="confirm-title" className="text-[15px] font-semibold text-ink">
              {title}
            </h2>
            <div id="confirm-body" className="mt-1.5 text-[13px] leading-relaxed text-muted">
              {body}
            </div>
            {error && <p className="mt-3 text-[12.5px] text-red-600 dark:text-red-400">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button ref={cancelRef} onClick={onCancel} className="v-btn v-btn-ghost">
                {cancelLabel}
              </button>
              <button
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onConfirm();
                  } catch (e) {
                    setError((e as Error).message);
                    setBusy(false);
                  }
                }}
                disabled={busy}
                className={`v-btn disabled:opacity-60 ${danger ? 'v-btn-danger' : ''}`}
              >
                {busy ? busyLabel : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
