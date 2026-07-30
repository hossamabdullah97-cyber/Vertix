'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch, getToken } from '@/lib/client';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/AppShell';
import { Icon } from '@/components/Icon';

// Import workspace layouts
import { ExecutiveDashboard } from '@/components/analytics/ExecutiveDashboard';
import { CardAnalytics } from '@/components/analytics/CardAnalytics';
import { ProfileAnalytics } from '@/components/analytics/ProfileAnalytics';
import { QrAnalytics } from '@/components/analytics/QrAnalytics';
import { NfcAnalytics } from '@/components/analytics/NfcAnalytics';
import { LeadAnalytics } from '@/components/analytics/LeadAnalytics';
import { AudienceAnalytics } from '@/components/analytics/AudienceAnalytics';
import { DeviceAnalytics } from '@/components/analytics/DeviceAnalytics';
import { GeographicAnalytics } from '@/components/analytics/GeographicAnalytics';
import { TrafficAnalytics } from '@/components/analytics/TrafficAnalytics';
import { AiInsights } from '@/components/analytics/AiInsights';
import { ReportsCenter } from '@/components/analytics/ReportsCenter';

type WorkspaceView =
  | 'overview'
  | 'cards'
  | 'profile'
  | 'qr'
  | 'nfc'
  | 'leads'
  | 'audience'
  | 'devices'
  | 'geography'
  | 'traffic'
  | 'ai'
  | 'reports';

const TABS = [
  { id: 'overview', label: 'Executive Dashboard', icon: 'gauge' },
  { id: 'cards', label: 'Card Performance', icon: 'columns' },
  { id: 'profile', label: 'Profile Interaction', icon: 'eye' },
  { id: 'qr', label: 'QR Analytics', icon: 'grid' },
  { id: 'nfc', label: 'NFC Intelligence', icon: 'zap' },
  { id: 'leads', label: 'Lead Funnel', icon: 'briefcase' },
  { id: 'audience', label: 'Audience Demographics', icon: 'users' },
  { id: 'devices', label: 'Devices & Tech', icon: 'list' },
  { id: 'geography', label: 'Geographic Map', icon: 'map' },
  { id: 'traffic', label: 'Traffic Sources', icon: 'globe' },
  { id: 'ai', label: 'AI Diagnostics', icon: 'sparkle' },
  { id: 'reports', label: 'Reports Scheduler', icon: 'check-circle' },
] as const;

export default function AnalyticsPage() {
  const router = useRouter();
  const { t } = useTranslation('analytics');
  const [view, setView] = useState<WorkspaceView>('overview');
  const [dateRange, setDateRange] = useState('30d');
  const [compareMode, setCompareMode] = useState(false);

  const [overview, setOverview] = useState<any>(null);
  const [series, setSeries] = useState<any[]>([]);
  const [top, setTop] = useState<any[]>([]);
  const [refs, setRefs] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }

    setLoading(true);
    Promise.all([
      authFetch<any>('/analytics/overview'),
      authFetch<any[]>('/analytics/timeseries'),
      authFetch<any[]>('/analytics/top-cards'),
      authFetch<any[]>('/analytics/referrers'),
      authFetch<any[]>('/leads'),
      authFetch<any[]>('/tasks'),
    ])
      .then(([o, s, t, r, l, tk]) => {
        setOverview(o);
        setSeries(s);
        setTop(t);
        setRefs(r);
        setLeads(l);
        setTasks(tk);
        setError('');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router, dateRange]);

  return (
    <AppShell
      title={t('title', 'Real-Time Enterprise Analytics')}
      action={
        <div className="flex flex-wrap items-center gap-2">
          {/* Compare mode toggle switch */}
          <button
            onClick={() => setCompareMode(!compareMode)}
            className="flex items-center gap-1.5 v-btn v-btn-ghost !h-9 text-[11.5px] font-bold"
            style={{ background: compareMode ? 'var(--v-accent-soft)' : 'transparent', color: compareMode ? 'var(--v-accent)' : 'hsl(var(--v-muted))' }}
          >
            <Icon name="refresh" size={13} />
            {compareMode ? t('comparingOn') : t('compareMode')}
          </button>

          {/* Date Range dropdown selector */}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="v-field !h-9 !w-auto text-[12px] font-semibold"
          >
            <option value="today">{t('period.today')}</option>
            <option value="yesterday">{t('period.yesterday')}</option>
            <option value="7d">{t('period.last7days')}</option>
            <option value="30d">{t('period.last30days')}</option>
            <option value="90d">{t('period.last90days')}</option>
            <option value="ytd">{t('period.thisYear')}</option>
          </select>
        </div>
      }
    >
      {/* Subnav tab bar */}
      <div className="no-scrollbar mb-6 flex gap-1.5 overflow-x-auto border-b border-line pb-3">
        {TABS.map((tabItem) => {
          const active = view === tabItem.id;
          return (
            <button
              key={tabItem.id}
              onClick={() => setView(tabItem.id)}
              className={`flex items-center gap-2 rounded-[10px] px-3.5 py-2 text-[12.5px] font-bold transition-all shrink-0 ${
                active ? 'text-white' : 'text-muted hover:text-ink hover:bg-ink/5'
              }`}
              style={active ? { background: 'var(--v-gradient-brand)', boxShadow: 'var(--v-shadow-accent)' } : undefined}
            >
              <Icon name={tabItem.icon === 'check-circle' ? 'check' : tabItem.icon} size={13} /> {t(`tabs.${tabItem.id}`, tabItem.label)}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-sm font-semibold text-red-500">
          <Icon name="x" size={15} /> {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="v-skeleton h-24 rounded-2xl" />
            ))}
          </div>
          <div className="v-skeleton h-60 rounded-2xl w-full" />
        </div>
      ) : (
        <div className="min-h-[400px]">
          {view === 'overview' && (
            <ExecutiveDashboard
              overview={overview}
              series={series}
              leads={leads}
              tasks={tasks}
              top={top}
              compareMode={compareMode}
            />
          )}

          {view === 'cards' && (
            <CardAnalytics
              top={top}
              overview={overview}
            />
          )}

          {view === 'profile' && (
            <ProfileAnalytics overview={overview} series={series} />
          )}

          {view === 'qr' && (
            <QrAnalytics />
          )}

          {view === 'nfc' && (
            <NfcAnalytics
              series={series}
              overview={overview}
            />
          )}

          {view === 'leads' && (
            <LeadAnalytics
              leads={leads}
              overview={overview}
            />
          )}

          {view === 'audience' && (
            <AudienceAnalytics />
          )}

          {view === 'devices' && (
            <DeviceAnalytics />
          )}

          {view === 'geography' && (
            <GeographicAnalytics />
          )}

          {view === 'traffic' && (
            <TrafficAnalytics
              refs={refs}
            />
          )}

          {view === 'ai' && (
            <AiInsights overview={overview} leads={leads} series={series} />
          )}

          {view === 'reports' && (
            <ReportsCenter
              overview={overview}
              leads={leads}
            />
          )}
        </div>
      )}
    </AppShell>
  );
}
