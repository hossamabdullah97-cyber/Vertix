'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { type Lead, TEMP_META, initials, hueFor, relativeTime, sourceMeta, formatMoney } from '@/lib/crm';

/** Contacts workspace — every captured lead as a contact record. Opens the shared drawer. */
export function ContactsView({ leads, onOpen }: { leads: Lead[]; onOpen: (id: string) => void }) {
  const { t } = useTranslation('crm');
  if (leads.length === 0) return <EmptyContacts />;

  const headers = ['contact', 'companyTitle', 'phoneEmail', 'source', 'status', 'pipelineValue', 'lastSeen'] as const;
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-line bg-canvas/30 text-muted">
              {headers.map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3 text-[11px] font-bold uppercase tracking-wider">{t(`contacts.headers.${h}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => {
              const tm = TEMP_META[l.temperature];
              const hue = hueFor(l.name || l.email || l.id);
              const src = sourceMeta(l.source);
              return (
                <tr key={l.id} onClick={() => onOpen(l.id)} className="cursor-pointer border-b border-line last:border-0 transition-colors hover:bg-canvas/30">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold text-white" style={{ background: `hsl(${hue} 62% 48%)` }}>
                        {initials(l.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-ink">{l.name || t('contacts.unknownContact')}</p>
                        {l.card && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-accent">
                            <Icon name="grid" size={10} /> {t('contacts.card')} {l.card.slug}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-bold text-ink">{l.company || '—'}</p>
                    {l.card && <p className="text-[11px] text-muted">via /c/{l.card.slug}</p>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-semibold">
                    <p className="text-[12.5px] text-ink">{l.phone || '—'}</p>
                    <p className="text-[11px] text-muted font-mono">{l.email || '—'}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1 text-[12px] text-muted"><Icon name={src.icon} size={12} /> {src.label}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="v-chip !px-2 !py-0.5 !text-[10px] font-bold" style={{ background: tm.bg, color: tm.fg, borderColor: tm.border }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tm.dot }} /> {t(`temperature.${l.temperature.toLowerCase()}`)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-bold tabular-nums text-emerald-600">{l.value > 0 ? formatMoney(l.value) : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-[11.5px] text-faint">{relativeTime(l.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyContacts() {
  const { t } = useTranslation('crm');
  return (
    <div className="v-card flex flex-col items-center gap-4 py-20 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'var(--v-accent-soft)', color: 'var(--v-accent)' }}>
        <Icon name="users" size={28} />
      </span>
      <div>
        <p className="text-[16px] font-bold text-ink">{t('contacts.emptyTitle')}</p>
        <p className="mt-1 max-w-sm text-[13px] text-muted">{t('contacts.emptyDesc')}</p>
      </div>
      <Link href="/cards" className="v-btn"><Icon name="grid" size={15} /> {t('openCards')}</Link>
    </div>
  );
}
