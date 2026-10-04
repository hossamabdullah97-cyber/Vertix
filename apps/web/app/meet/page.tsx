'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { authFetch, getToken, type Card, type Me } from '@/lib/client';
import { whatsappHref } from '@/lib/crm';
import type { Lead } from '@/lib/crm';
import type { Occasion } from '@/lib/occasions';
import { useStoredTheme } from '@/lib/useStoredTheme';
import { QRCode } from '@/components/QRCode';
import { Icon } from '@/components/Icon';
import { AddLead } from '@/components/crm/AddLead';

type Mode = 'qr' | 'card' | 'number';

const nameOf = (c: Card) => ((c.vcardData?.fullName as string) || '').trim();
// The phone's own date: an evening event in Cairo is still today there.
const today = () => new Date().toLocaleDateString('en-CA');

/**
 * "I've just met someone": the one screen for the moment itself, at a stand
 * or across a table. Show them your card's QR code, photograph their paper
 * card, or just take their name and number, then send them your card on
 * WhatsApp before you part. Made for a phone held in one hand.
 */
export default function MeetPage() {
  const router = useRouter();
  const { t } = useTranslation('crm');
  const theme = useStoredTheme();
  const [mode, setMode] = useState<Mode>('qr');
  const [cards, setCards] = useState<Card[] | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [origin, setOrigin] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [sheet, setSheet] = useState(false);
  const [saved, setSaved] = useState<Lead | null>(null);
  const camera = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login?next=/meet');
      return;
    }
    setOrigin(window.location.origin);
    Promise.all([authFetch<Me>('/auth/me'), authFetch<Card[]>('/cards')])
      .then(([me, all]) => {
        const mine = all.filter((c) => c.ownerId === me.sub && c.isPublished);
        setCards(mine);
        let last: string | null = null;
        try {
          last = localStorage.getItem('vertex_meet_card');
        } catch {
          /* private mode */
        }
        setCardId(mine.find((c) => c.id === last)?.id ?? mine[0]?.id ?? null);
      })
      .catch(() => setCards([]));
    // The workspace's occasion running today, if any (a personal account has none).
    authFetch<Occasion[]>('/orgs/occasions')
      .then((list) => setOccasion(list.find((o) => o.startsOn <= today() && today() <= o.endsOn) ?? null))
      .catch(() => {});
  }, [router]);

  const card = cards?.find((c) => c.id === cardId) ?? null;
  const url = card && origin ? `${origin}/c/${card.slug}` : '';

  // The screen stays on while someone scans it.
  useEffect(() => {
    if (mode !== 'qr' || !('wakeLock' in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    const take = () =>
      (navigator as Navigator & { wakeLock: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
        .request('screen')
        .then((l) => (lock = l))
        .catch(() => {});
    void take();
    const again = () => document.visibilityState === 'visible' && void take();
    document.addEventListener('visibilitychange', again);
    return () => {
      document.removeEventListener('visibilitychange', again);
      void lock?.release().catch(() => {});
    };
  }, [mode]);

  function chooseCard(id: string) {
    setCardId(id);
    try {
      localStorage.setItem('vertex_meet_card', id);
    } catch {
      /* private mode */
    }
  }

  const note = occasion ? t('meet.metAt', { name: occasion.name }) : undefined;
  const greeting = useMemo(() => (url ? t('meet.greeting', { url }) : ''), [url, t]);

  async function shareLink() {
    if (!url) return;
    try {
      if (navigator.share) await navigator.share({ title: card ? nameOf(card) : undefined, text: t('meet.shareText'), url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* dismissed */
    }
  }

  function pick(m: Mode) {
    setSaved(null);
    if (m === 'card') {
      // The camera opens on the tap itself; browsers allow it only then.
      camera.current?.click();
      return;
    }
    setMode(m);
    if (m === 'number') {
      setPhoto(null);
      setSheet(true);
    }
  }

  return (
    <div data-theme={theme} className="flex min-h-[100dvh] flex-col bg-canvas text-ink">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
        <Link href="/dashboard" aria-label={t('meet.back')} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-elevated hover:text-ink">
          <Icon name="arrow-left" size={18} className="rtl:rotate-180" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{t('meet.title')}</h1>
        {occasion && (
          <span className="flex max-w-[45%] items-center gap-1.5 truncate rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500" />
            <span className="truncate">{occasion.name}</span>
          </span>
        )}
      </header>

      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setPhoto(f);
          setSheet(true);
        }}
      />

      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-4 py-5">
        {saved ? (
          <SendCard lead={saved} url={url} greeting={greeting} onDone={() => setSaved(null)} />
        ) : cards === null ? (
          <div className="v-skeleton mx-auto mt-6 aspect-square w-full max-w-[320px] rounded-2xl" />
        ) : !card ? (
          <div className="mt-10 rounded-xl p-6 text-center ring-1 ring-inset ring-line">
            <p className="text-sm leading-relaxed text-muted">{t('meet.noCard')}</p>
            <Link href="/cards" className="v-btn mt-4 inline-flex">
              {t('meet.makeCard')}
            </Link>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center">
            <p className="text-center text-sm text-muted">{t('meet.qrHint')}</p>
            <div className="mt-4 w-full max-w-[340px] rounded-3xl bg-white p-5 shadow-sm ring-1 ring-line">
              <QRCode value={`${url}?via=qr`} size={300} />
            </div>
            <p className="mt-4 text-center text-lg font-semibold">{nameOf(card) || card.slug}</p>
            <p dir="ltr" className="mt-0.5 max-w-full truncate text-xs text-faint">
              {url.replace(/^https?:\/\//, '')}
            </p>
            {cards.length > 1 && (
              <select aria-label={t('meet.whichCard')} className="v-field mt-3 w-auto" value={card.id} onChange={(e) => chooseCard(e.target.value)}>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {nameOf(c) || c.slug}
                  </option>
                ))}
              </select>
            )}
            <button type="button" onClick={shareLink} className="v-btn v-btn-ghost mt-4">
              <Icon name="send" size={14} /> {t('meet.shareLink')}
            </button>
          </div>
        )}
      </main>

      {/* The three ways, within the thumb's reach. */}
      <nav aria-label={t('meet.title')} className="sticky bottom-0 border-t border-line bg-surface/95 backdrop-blur-md" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto grid max-w-[480px] grid-cols-3 gap-2 p-3">
          {(
            [
              ['qr', 'qr', t('meet.modes.qr')],
              ['card', 'camera', t('meet.modes.card')],
              ['number', 'user-plus', t('meet.modes.number')],
            ] as const
          ).map(([m, icon, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => pick(m)}
              aria-pressed={m === 'qr' && mode === 'qr' && !saved}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium transition-colors ${
                m === 'qr' && mode === 'qr' && !saved ? 'bg-accent text-white' : 'bg-elevated text-ink ring-1 ring-inset ring-line hover:bg-surface'
              }`}
            >
              <Icon name={icon} size={20} />
              {label}
            </button>
          ))}
        </div>
      </nav>

      <AddLead
        open={sheet}
        initialFile={photo}
        note={note}
        inPerson
        quick={!photo}
        onClose={() => {
          setSheet(false);
          setMode('qr');
          setPhoto(null);
        }}
        onAdded={(lead) => setSaved(lead)}
      />
    </div>
  );
}

/** Just saved: send them your card before you part. */
function SendCard({ lead, url, greeting, onDone }: { lead: Lead; url: string; greeting: string; onDone: () => void }) {
  const { t } = useTranslation('crm');
  const wa = lead.phone && url ? whatsappHref(lead.phone, greeting) : null;
  const mail = lead.email && url ? `mailto:${lead.email}?subject=${encodeURIComponent(t('meet.mailSubject'))}&body=${encodeURIComponent(greeting)}` : null;
  return (
    <div className="mt-6 flex flex-col items-center text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <Icon name="check" size={26} />
      </span>
      <h2 className="mt-4 text-xl font-semibold">{t('meet.saved', { name: lead.name || lead.phone || lead.email || '' })}</h2>
      <p className="mt-1.5 text-sm text-muted">{wa || mail ? t('meet.sendNow') : t('meet.savedNoContact')}</p>
      <div className="mt-6 grid w-full gap-2">
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer" className="v-btn !h-12 !bg-[#25D366] !text-white hover:!bg-[#1ebe5b]">
            <Icon name="message" size={16} /> {t('meet.sendWhatsapp')}
          </a>
        )}
        {mail && (
          <a href={mail} className="v-btn v-btn-ghost !h-12">
            <Icon name="mail" size={16} /> {t('meet.sendEmail')}
          </a>
        )}
        <Link href={`/leads?lead=${lead.id}`} className="v-btn v-btn-ghost !h-12">
          {t('meet.openLead')}
        </Link>
        <button type="button" onClick={onDone} className="v-btn v-btn-ghost !h-12">
          {t('meet.next')}
        </button>
      </div>
    </div>
  );
}
