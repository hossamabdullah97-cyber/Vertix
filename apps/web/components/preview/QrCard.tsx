'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { QRCode, downloadQrPng } from '@/components/QRCode';
import { Icon } from '@/components/Icon';

/**
 * Realistic QR experience: a branded QR card with an animated scan line and
 * download / share / copy actions, plus a hint that it opens the landing page.
 */
export function QrCard({ url, name }: { url: string; name: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  async function share() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: name, url });
      } catch {
        /* cancelled */
      }
    } else {
      copy();
    }
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-[300px] overflow-hidden rounded-[24px] border border-line bg-surface p-6 text-center shadow-xl"
      >
        <div className="mb-4">
          <p className="text-[15px] font-bold tracking-tight text-ink">{name || 'Your Profile'}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Scan to connect</p>
        </div>

        <div className="relative mx-auto w-fit overflow-hidden rounded-2xl border border-line bg-white p-3">
          <QRCode value={url} size={190} />
          {/* animated scan line */}
          <motion.span
            className="pointer-events-none absolute inset-x-3 h-8 rounded-full"
            style={{ background: 'linear-gradient(180deg, rgba(37, 99, 235,0.35), transparent)' }}
            initial={{ top: '8%' }}
            animate={{ top: ['8%', '78%', '8%'] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* scanner corners */}
          {[
            'left-1.5 top-1.5 border-l-2 border-t-2',
            'right-1.5 top-1.5 border-r-2 border-t-2',
            'left-1.5 bottom-1.5 border-l-2 border-b-2',
            'right-1.5 bottom-1.5 border-r-2 border-b-2',
          ].map((c) => (
            <span key={c} className={`absolute h-4 w-4 rounded-[3px] border-accent ${c}`} />
          ))}
        </div>

        <p className="mt-4 truncate text-[11px] text-muted">{url}</p>
      </motion.div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button onClick={() => downloadQrPng(url, `${name || 'vertex'}-qr.png`)} className="v-btn v-btn-ghost h-9 px-3 text-[12px] font-semibold">
          <Icon name="download" size={14} /> Download
        </button>
        <button onClick={share} className="v-btn v-btn-ghost h-9 px-3 text-[12px] font-semibold">
          <Icon name="send" size={14} /> Share
        </button>
        <button onClick={copy} className="v-btn v-btn-ghost h-9 px-3 text-[12px] font-semibold">
          <Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}
