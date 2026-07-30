'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_URL } from '@/lib/api';
import { Icon } from '@/components/Icon';
import { profileStrings, type Lang } from '@/lib/profileI18n';

/** Tactile Save-Contact button — streams the vCard as a download, with a success morph. */
export default function SaveContactButton({ slug, lang = 'en' }: { slug: string; lang?: Lang }) {
  const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle');
  const t = profileStrings(lang);

  async function save() {
    if (state !== 'idle') return;
    setState('saving');
    try {
      const res = await fetch(`${API_URL}/c/${slug}/vcard`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'contact.vcf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setState('done');
      setTimeout(() => setState('idle'), 2200);
    } catch {
      // Fallback: navigate to the endpoint (Content-Disposition forces download).
      window.location.href = `${API_URL}/c/${slug}/vcard`;
      setState('idle');
    }
  }

  return (
    <motion.button
      onClick={save}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className="relative flex h-14 w-full items-center justify-center gap-2.5 overflow-hidden rounded-[var(--v-radius)] text-[15px] font-semibold text-[var(--v-accent-contrast)] shadow-sm"
      style={{ background: 'var(--v-accent)' }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {state === 'done' ? (
          <motion.span
            key="done"
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -14, opacity: 0 }}
            className="flex items-center gap-2"
          >
            <Icon name="check" size={20} />
            {t.saved}
          </motion.span>
        ) : (
          <motion.span
            key="idle"
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -14, opacity: 0 }}
            className="flex items-center gap-2"
          >
            <Icon name={state === 'saving' ? 'download' : 'user-plus'} size={20} />
            {state === 'saving' ? t.saving : t.save}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
