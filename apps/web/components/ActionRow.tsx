'use client';

import { useState } from 'react';
import type { CardAction } from '@/lib/client';

// Which config fields each action type needs.
const FIELDS: Record<string, { key: string; label: string }[]> = {
  WHATSAPP: [{ key: 'phone', label: 'Phone (+countrycode)' }, { key: 'text', label: 'Prefilled message' }],
  CALL: [{ key: 'phone', label: 'Phone' }],
  EMAIL: [{ key: 'email', label: 'Email' }],
  MAPS: [{ key: 'query', label: 'Place / query' }, { key: 'url', label: 'Maps URL (optional)' }],
  LINKEDIN: [{ key: 'url', label: 'LinkedIn URL' }],
  WEBSITE: [{ key: 'url', label: 'Website URL' }],
  BOOK_MEETING: [{ key: 'url', label: 'Booking URL' }],
  REQUEST_QUOTE: [{ key: 'url', label: 'Quote form URL' }],
  FILE: [{ key: 'url', label: 'File URL' }],
  SAVE_CONTACT: [],
};

export default function ActionRow({
  action,
  onSave,
  onToggleActive,
  onDelete,
  onMove,
}: {
  action: CardAction;
  onSave: (config: Record<string, unknown>) => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const fields = FIELDS[action.type] ?? [];
  const [config, setConfig] = useState<Record<string, unknown>>(() => ({
    ...action.config,
  }));

  return (
    <div className="border border-line rounded-xl p-4 bg-canvas/50">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          {action.type}
        </span>
        <div className="flex items-center gap-1 text-muted">
          <button onClick={() => onMove(-1)} className="px-1.5 hover:text-ink">↑</button>
          <button onClick={() => onMove(1)} className="px-1.5 hover:text-ink">↓</button>
          <button onClick={onToggleActive} className="px-2 text-xs hover:text-ink">
            {action.isActive ? 'Active' : 'Off'}
          </button>
          <button onClick={onDelete} className="px-1.5 text-red-600 hover:text-red-700">✕</button>
        </div>
      </div>
      <div className="grid gap-2">
        {fields.map((f) => (
          <input
            key={f.key}
            className="rounded-lg border border-line px-3 py-2 text-sm bg-white"
            placeholder={f.label}
            value={(config[f.key] as string) ?? ''}
            onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
          />
        ))}
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={config.isPrimary === true}
            onChange={(e) => setConfig({ ...config, isPrimary: e.target.checked })}
          />
          Primary action (opens on NFC tap)
        </label>
      </div>
      <button
        onClick={() => onSave(config)}
        className="mt-3 text-xs font-semibold text-accent"
      >
        Save action
      </button>
    </div>
  );
}
