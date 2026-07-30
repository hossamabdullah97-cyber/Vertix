'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { type Lead, type Stage, type Temp, TEMP_META, initials, hueFor, formatMoney, wonStage, relativeTime } from '@/lib/crm';

interface CompanyAgg {
  name: string;
  contacts: Lead[];
  value: number;
  won: number;
  temp: Record<Temp, number>;
  lastAt: string;
}

/** Companies workspace — aggregated from the real lead list (grouped by company). */
export function CompaniesView({ leads, stages, onOpenCompany }: { leads: Lead[]; stages: Stage[]; onOpenCompany: (name: string) => void }) {
  const { t } = useTranslation('crm');
  const wonId = wonStage(stages)?.id;

  const companies = useMemo(() => {
    const map = new Map<string, CompanyAgg>();
    for (const l of leads) {
      const name = l.company?.trim() || 'No company';
      let c = map.get(name);
      if (!c) {
        c = { name, contacts: [], value: 0, won: 0, temp: { HOT: 0, WARM: 0, COLD: 0 }, lastAt: l.createdAt };
        map.set(name, c);
      }
      c.contacts.push(l);
      c.value += l.value;
      c.temp[l.temperature] += 1;
      if (wonId && l.stageId === wonId) c.won += 1;
      if (+new Date(l.createdAt) > +new Date(c.lastAt)) c.lastAt = l.createdAt;
    }
    return [...map.values()].sort((a, b) => b.value - a.value || b.contacts.length - a.contacts.length);
  }, [leads, wonId]);

  if (companies.length === 0) return <EmptyCompanies />;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {companies.map((c, i) => {
        const hue = hueFor(c.name);
        const total = c.contacts.length;
        return (
          <motion.button
            key={c.name}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ y: -2 }}
            onClick={() => onOpenCompany(c.name)}
            className="group flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 text-left shadow-sm transition-shadow hover:shadow-md hover:border-line-strong"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[14px] font-black text-white" style={{ background: `linear-gradient(140deg, hsl(${hue} 62% 55%), hsl(${hue} 62% 42%))` }}>
                {companyInitials(c.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-ink transition-colors group-hover:text-accent">{c.name === 'No company' ? t('companies.noCompany') : c.name}</p>
                <p className="text-[11.5px] font-semibold text-muted">
                  {c.name === 'No company' ? t('companies.individualLeads') : t('companies.wonSummary', { won: c.won, contacts: t('companies.contact', { count: total }) })}
                </p>
              </div>
              <Icon name="arrow" size={15} className="text-faint transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
            </div>

            {/* Contacts list avatars */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-line/50">
              <div className="flex -space-x-1.5 overflow-hidden">
                {c.contacts.slice(0, 4).map((contact) => {
                  const contactHue = hueFor(contact.name || contact.id);
                  return (
                    <span
                      key={contact.id}
                      className="inline-block h-6.5 w-6.5 rounded-full ring-2 ring-surface text-[8.5px] font-bold text-white text-center flex items-center justify-center"
                      style={{ background: `hsl(${contactHue} 62% 48%)` }}
                      title={contact.name || ''}
                    >
                      {initials(contact.name)}
                    </span>
                  );
                })}
                {total > 4 && (
                  <span className="flex h-6.5 w-6.5 items-center justify-center rounded-full bg-canvas text-[8px] font-black text-muted ring-2 ring-surface">
                    +{total - 4}
                  </span>
                )}
              </div>
              <span className="text-[11px] font-bold text-muted">{t('companies.contact', { count: total })}</span>
            </div>

            <div className="flex items-end justify-between border-t border-line/50 pt-2.5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-faint">{t('companies.pipelineValue')}</p>
                <p className="text-[16px] font-black tabular-nums text-emerald-600">{formatMoney(c.value)}</p>
              </div>
              <span className="text-[10.5px] font-semibold text-faint">{relativeTime(c.lastAt)}</span>
            </div>

            {/* temperature mix */}
            <div className="flex h-1.5 overflow-hidden rounded-full bg-line">
              {(['HOT', 'WARM', 'COLD'] as Temp[]).map((t) => c.temp[t] > 0 && <span key={t} style={{ flex: c.temp[t], background: TEMP_META[t].dot }} />)}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

function companyInitials(name: string): string {
  if (name === 'No company') return '—';
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function EmptyCompanies() {
  const { t } = useTranslation('crm');
  return (
    <div className="v-card flex flex-col items-center gap-4 py-20 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'var(--v-accent-soft)', color: 'var(--v-accent)' }}>
        <Icon name="briefcase" size={28} />
      </span>
      <div>
        <p className="text-[16px] font-bold text-ink">{t('companies.emptyTitle')}</p>
        <p className="mt-1 max-w-sm text-[13px] text-muted">{t('companies.emptyDesc')}</p>
      </div>
      <Link href="/cards" className="v-btn"><Icon name="grid" size={15} /> {t('openCards')}</Link>
    </div>
  );
}
