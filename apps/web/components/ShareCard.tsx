'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCode, downloadQrPng } from '@/components/QRCode';
import { Icon } from '@/components/Icon';

/** Editor share panel: QR of the public profile + copy link + download. */
export default function ShareCard({ slug }: { slug: string }) {
  const { t } = useTranslation('cardEditor');
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const url = `${origin}/c/${slug}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="v-card p-5">
      <h2 className="mb-1 text-[14px] font-semibold">{t('share.title')}</h2>
      <p className="mb-4 text-[12.5px] text-muted">
        {t('share.subtitle')}
      </p>

      <div className="flex flex-col items-center">
        <div className="rounded-[14px] border border-line bg-white p-3">
          <QRCode value={url || 'https://vertex.dev'} size={168} />
        </div>

        <div className="mt-4 w-full">
          <div className="flex items-center gap-2 rounded-[var(--v-radius)] border border-line bg-canvas px-3 py-2">
            <span dir="ltr" className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{url || '…'}</span>
            <button onClick={copy} className="flex h-11 w-11 sm:h-auto sm:w-auto shrink-0 items-center justify-center text-muted transition-colors hover:text-ink" aria-label={t('share.copyLink')} title={t('share.copyLink')}>
              <Icon name={copied ? 'check' : 'copy'} size={16} />
            </button>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button onClick={() => downloadQrPng(url, `${slug}-qr.png`)} className="v-btn v-btn-ghost !h-11 sm:!h-auto">
              <Icon name="download" size={15} /> PNG
            </button>
            <a href={url} target="_blank" rel="noreferrer" className="v-btn v-btn-ghost !h-11 sm:!h-auto">
              <Icon name="external-link" size={15} /> {t('share.open')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
