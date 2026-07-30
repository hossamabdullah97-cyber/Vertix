'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';

interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings: Record<string, unknown> | null;
}

interface WorkspaceSettingsProps {
  org: OrgInfo | null;
  saving?: boolean;
  onSave: (input: { name: string; settings: Record<string, unknown> }) => void | Promise<void>;
}

const TIMEZONES = ['UTC', 'Africa/Cairo', 'Europe/London', 'Europe/Paris', 'Asia/Dubai', 'Asia/Riyadh', 'America/New_York', 'America/Los_Angeles', 'Asia/Kolkata', 'Asia/Singapore'];
const LANGUAGES = [{ v: 'en', l: 'English' }, { v: 'ar', l: 'العربية (Arabic)' }];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'EGP', 'SAR', 'AED'];

// Integration architecture is prepared but not yet connectable — shown honestly.
const INTEGRATIONS = [
  { name: 'Google Workspace', icon: 'users', desc: 'Auto-provision employee cards' },
  { name: 'Slack', icon: 'message', desc: 'Post NFC taps & new leads to a channel' },
  { name: 'HubSpot', icon: 'briefcase', desc: 'Sync captured leads to contacts' },
  { name: 'Zapier / Webhooks', icon: 'link', desc: 'Send events to any endpoint' },
  { name: 'API Keys', icon: 'lock', desc: 'Programmatic access tokens' },
  { name: 'Microsoft 365', icon: 'grid', desc: 'Directory sync & SSO' },
];

export function WorkspaceSettings({ org, saving, onSave }: WorkspaceSettingsProps) {
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [language, setLanguage] = useState('en');
  const [currency, setCurrency] = useState('USD');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!org) return;
    const s = org.settings ?? {};
    setName(org.name);
    setTimezone((s.timezone as string) || 'UTC');
    setLanguage((s.language as string) || 'en');
    setCurrency((s.currency as string) || 'USD');
  }, [org]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ name: name.trim() || org?.name || 'Organization', settings: { ...(org?.settings ?? {}), timezone, language, currency } });
  }

  function copyId() {
    if (!org) return;
    navigator.clipboard?.writeText(org.id).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="grid lg:grid-cols-[1.5fr_1fr] gap-6">
        {/* General settings — real */}
        <div className="v-card p-5 bg-surface border border-line rounded-2xl shadow-sm space-y-5">
          <div>
            <h3 className="text-[14.5px] font-bold text-ink tracking-tight">General Settings</h3>
            <p className="text-[11.5px] text-muted">Organization name, timezone, language, and currency</p>
          </div>

          <label className="block space-y-1.5">
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Organization Name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="v-field !h-9 text-[12.5px]" required />
          </label>

          <div className="grid sm:grid-cols-3 gap-4">
            <label className="block space-y-1.5">
              <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Timezone</span>
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="v-field !h-9 text-[12px] font-semibold">
                {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Language</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="v-field !h-9 text-[12px] font-semibold">
                {LANGUAGES.map((l) => <option key={l.v} value={l.v}>{l.l}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Currency</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="v-field !h-9 text-[12px] font-semibold">
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>

          <div className="pt-3 border-t border-line flex justify-end">
            <button type="submit" disabled={saving} className="v-btn h-9 px-6 font-bold shadow-md disabled:opacity-60">
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>

        {/* Organization identity — read-only real data */}
        <div className="v-card p-5 bg-surface border border-line rounded-2xl shadow-sm space-y-3">
          <h3 className="text-[14px] font-bold text-ink tracking-tight">Organization</h3>
          <div className="space-y-2.5 text-[12.5px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted font-semibold">Workspace URL</span>
              <span className="font-mono text-ink">/{org?.slug ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted font-semibold">Plan</span>
              <span className="v-chip !px-2 !py-0.5 !text-[10px] font-bold text-blue-600 bg-blue-600/10 border-blue-600/20">{org?.plan ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted font-semibold shrink-0">Org ID</span>
              <button type="button" onClick={copyId} className="flex items-center gap-1.5 font-mono text-[11px] text-muted hover:text-ink min-w-0">
                <span className="truncate">{org?.id ?? '—'}</span>
                <Icon name={copied ? 'check' : 'copy'} size={12} className="shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Integrations — honest roadmap (architecture prepared, not yet connectable) */}
      <div className="v-card p-5 bg-surface border border-line rounded-2xl shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div>
            <h3 className="text-[14.5px] font-bold text-ink tracking-tight">Integrations &amp; API</h3>
            <p className="text-[11.5px] text-muted">Connectors and developer access — architecture prepared, rolling out soon</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {INTEGRATIONS.map((it) => (
            <div key={it.name} className="p-4 bg-canvas/30 border border-line rounded-xl flex flex-col justify-between min-h-[112px]">
              <div className="flex justify-between items-start">
                <span className="text-muted"><Icon name={it.icon} size={16} /></span>
                <span className="v-chip !px-2 !py-0.5 !text-[9.5px] font-bold text-muted bg-canvas border-line">Coming soon</span>
              </div>
              <div className="mt-3">
                <h4 className="text-[12.5px] font-bold text-ink">{it.name}</h4>
                <p className="text-[11px] text-muted mt-0.5 leading-relaxed">{it.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
