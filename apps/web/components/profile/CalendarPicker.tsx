'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';

const WD = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function CalendarPicker({
  value,
  onChange,
  accent,
}: {
  value: string;
  onChange: (iso: string) => void;
  accent: string;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() });

  const first = new Date(view.y, view.m, 1);
  const startWd = first.getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWd; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthName = first.toLocaleDateString('en', { month: 'long', year: 'numeric' });
  const canPrev = view.y > today.getFullYear() || (view.y === today.getFullYear() && view.m > today.getMonth());

  function shiftMonth(delta: number) {
    setView((v) => {
      const m = v.m + delta;
      return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
    });
  }

  return (
    <div className="rounded-[var(--v-radius)] border border-[hsl(var(--v-border))] p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => canPrev && shiftMonth(-1)} disabled={!canPrev}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[hsl(var(--v-muted))] disabled:opacity-30">
          <span className="rotate-180"><Icon name="arrow" size={15} /></span>
        </button>
        <span className="text-[13px] font-semibold">{monthName}</span>
        <button type="button" onClick={() => shiftMonth(1)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[hsl(var(--v-muted))]">
          <Icon name="arrow" size={15} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WD.map((w) => (
          <span key={w} className="py-1 text-[10px] font-semibold text-[hsl(var(--v-faint))]">{w}</span>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <span key={i} />;
          const iso = `${view.y}-${String(view.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const dt = new Date(view.y, view.m, d);
          const past = dt < today;
          const active = value === iso;
          return (
            <button
              key={i}
              type="button"
              disabled={past}
              onClick={() => onChange(iso)}
              className="flex h-8 items-center justify-center rounded-md text-[12.5px] font-medium disabled:opacity-25"
              style={{
                background: active ? accent : 'transparent',
                color: active ? 'var(--v-accent-contrast)' : 'hsl(var(--v-fg))',
              }}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
