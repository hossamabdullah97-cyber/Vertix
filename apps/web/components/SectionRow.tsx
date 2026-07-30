'use client';

import { useState } from 'react';
import type { Section } from '@/lib/client';

const FIELDS: Record<string, { key: string; label: string; area?: boolean }[]> = {
  BIO: [
    { key: 'title', label: 'Name' },
    { key: 'subtitle', label: 'Role / title' },
    { key: 'body', label: 'About', area: true },
  ],
  DEFAULT: [
    { key: 'title', label: 'Title' },
    { key: 'body', label: 'Body', area: true },
  ],
};

export default function SectionRow({
  section,
  onSave,
  onToggleVisible,
  onDelete,
  onMove,
}: {
  section: Section;
  onSave: (content: Record<string, unknown>) => void;
  onToggleVisible: () => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const fields = FIELDS[section.type] ?? FIELDS.DEFAULT;
  const [content, setContent] = useState<Record<string, string>>(() => {
    const c: Record<string, string> = {};
    for (const f of fields) c[f.key] = (section.content[f.key] as string) ?? '';
    return c;
  });

  return (
    <div className="border border-line rounded-xl p-4 bg-canvas/50">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          {section.type}
        </span>
        <div className="flex items-center gap-1 text-muted">
          <button onClick={() => onMove(-1)} className="px-1.5 hover:text-ink" title="Move up">↑</button>
          <button onClick={() => onMove(1)} className="px-1.5 hover:text-ink" title="Move down">↓</button>
          <button onClick={onToggleVisible} className="px-2 text-xs hover:text-ink">
            {section.isVisible ? 'Visible' : 'Hidden'}
          </button>
          <button onClick={onDelete} className="px-1.5 text-red-600 hover:text-red-700" title="Delete">✕</button>
        </div>
      </div>
      <div className="grid gap-2">
        {fields.map((f) =>
          f.area ? (
            <textarea
              key={f.key}
              className="rounded-lg border border-line px-3 py-2 text-sm bg-white"
              rows={2}
              placeholder={f.label}
              value={content[f.key]}
              onChange={(e) => setContent({ ...content, [f.key]: e.target.value })}
            />
          ) : (
            <input
              key={f.key}
              className="rounded-lg border border-line px-3 py-2 text-sm bg-white"
              placeholder={f.label}
              value={content[f.key]}
              onChange={(e) => setContent({ ...content, [f.key]: e.target.value })}
            />
          ),
        )}
      </div>
      <button
        onClick={() => onSave(content)}
        className="mt-3 text-xs font-semibold text-accent"
      >
        Save section
      </button>
    </div>
  );
}
