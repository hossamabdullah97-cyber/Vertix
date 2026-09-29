'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/ui/Sheet';
import { Icon } from '@/components/Icon';
import ShareCard from '@/components/ShareCard';

/**
 * Shown once a card goes live: its link and QR, and the quickest ways to send
 * it on, so publishing ends with the card in someone's hands.
 */
export function PublishedSheet({ open, onClose, slug, name }: { open: boolean; onClose: () => void; slug: string; name: string }) {
  const { t } = useTranslation('cardEditor');
  const [canShare, setCanShare] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
    setCanShare(typeof navigator.share === 'function');
  }, []);

  const url = `${origin}/c/${slug}`;
  const text = t('published.shareText', { name });

  const share = () => navigator.share({ title: name, text, url }).catch(() => {});

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={t('templates.close')}
      title={t('published.title')}
      subtitle={t('published.subtitle')}
      footer={
        <button onClick={onClose} className="v-btn v-btn-ghost !h-11 w-full">
          {t('published.done')}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}
            target="_blank"
            rel="noreferrer"
            className="v-btn !h-11 !bg-[#25d366] !text-white"
          >
            <Icon name="whatsapp" size={16} /> {t('published.whatsapp')}
          </a>
          {canShare ? (
            <button onClick={share} className="v-btn v-btn-ghost !h-11">
              <Icon name="share" size={16} /> {t('published.more')}
            </button>
          ) : (
            <a href={`mailto:?subject=${encodeURIComponent(name)}&body=${encodeURIComponent(`${text} ${url}`)}`} className="v-btn v-btn-ghost !h-11">
              <Icon name="mail" size={16} /> {t('published.email')}
            </a>
          )}
        </div>
        <ShareCard slug={slug} />
      </div>
    </Sheet>
  );
}
