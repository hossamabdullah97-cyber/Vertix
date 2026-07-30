'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_URL } from '@/lib/api';
import { Icon } from '@/components/Icon';
import { profileStrings, type Lang } from '@/lib/profileI18n';

export default function PrimaryActions({
  slug,
  name,
  lang = 'en',
}: {
  slug: string;
  name: string;
  lang?: Lang;
}) {
  const t = profileStrings(lang);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'done'>('idle');
  const [toast, setToast] = useState('');

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 1800);
  }

  async function save() {
    if (saveState !== 'idle') return;
    setSaveState('saving');
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
      setSaveState('done');
      setTimeout(() => setSaveState('idle'), 2200);
    } catch {
      window.location.href = `${API_URL}/c/${slug}/vcard`;
      setSaveState('idle');
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      flash(t.linkCopied);
    } catch {
      /* clipboard blocked */
    }
  }

  async function share() {
    const url = window.location.href;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: name, url });
      } catch {
        /* cancelled */
      }
    } else {
      await copyLink();
    }
  }

  return (
    <div className="space-y-3">
      {/* Save Contact — primary pill CTA in the card's own accent */}
      <motion.button
        onClick={save}
        whileTap={{ scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="relative flex h-[52px] w-full items-center justify-center gap-2.5 overflow-hidden rounded-full text-[15px] font-semibold text-[var(--v-accent-contrast)]"
        style={{
          background: 'var(--v-accent)',
          boxShadow: '0 4px 16px color-mix(in srgb, var(--v-accent) 35%, transparent)',
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={saveState}
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -14, opacity: 0 }}
            className="flex items-center gap-2"
          >
            <Icon name={saveState === 'done' ? 'check' : saveState === 'saving' ? 'download' : 'user-plus'} size={18} />
            {saveState === 'done' ? t.saved : saveState === 'saving' ? t.saving : t.save}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      {/* Share + Copy row */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={share}
          className="flex h-11 items-center justify-center gap-2 rounded-full border border-[hsl(var(--v-border))] bg-[hsl(var(--v-surface))] text-[13px] font-semibold text-[hsl(var(--v-fg))] transition-colors hover:bg-[hsl(var(--v-bg))] active:scale-[0.98]"
        >
          <Icon name="send" size={15} /> {t.share}
        </button>
        <button
          onClick={copyLink}
          className="flex h-11 items-center justify-center gap-2 rounded-full border border-[hsl(var(--v-border))] bg-[hsl(var(--v-surface))] text-[13px] font-semibold text-[hsl(var(--v-fg))] transition-colors hover:bg-[hsl(var(--v-bg))] active:scale-[0.98]"
        >
          <Icon name="copy" size={15} /> {t.copyLink}
        </button>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed inset-x-0 bottom-6 z-50 mx-auto flex w-fit items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-semibold shadow-lg"
            style={{ background: 'hsl(var(--v-fg))', color: 'hsl(var(--v-bg))' }}
          >
            <Icon name="check" size={15} /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
