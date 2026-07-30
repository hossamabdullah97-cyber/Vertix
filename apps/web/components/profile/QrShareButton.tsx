'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCode } from '@/components/QRCode';
import { Icon } from '@/components/Icon';
import { profileStrings, type Lang } from '@/lib/profileI18n';

/** Floating "show my QR" action — opens a large scannable code for in-person sharing. */
export default function QrShareButton({ name, lang = 'en' }: { name: string; lang?: Lang }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const t = profileStrings(lang);

  useEffect(() => {
    setUrl(window.location.href);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 end-5 z-40 flex h-12 w-12 items-center justify-center rounded-full shadow-lg"
        style={{ background: 'var(--v-accent)', color: 'var(--v-accent-contrast)' }}
        aria-label="Show QR code"
      >
        <Icon name="qr" size={22} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            style={{ background: 'rgba(6,6,10,0.72)', backdropFilter: 'blur(6px)' }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 12 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-[320px] rounded-[22px] bg-white p-7 text-center text-[#111]"
            >
              <button
                onClick={() => setOpen(false)}
                className="absolute end-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-[#888] hover:bg-black/5"
                aria-label="Close"
              >
                <Icon name="x" size={18} />
              </button>
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#999]">{t.scanToConnect}</p>
              <p className="mt-1 mb-5 text-[19px] font-bold">{name}</p>
              <div className="mx-auto w-fit rounded-[16px] border border-[#eee] p-3">
                <QRCode value={url || 'https://vertex.dev'} size={220} />
              </div>
              <p className="mt-4 text-[12px] text-[#999]">{t.pointCamera}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
