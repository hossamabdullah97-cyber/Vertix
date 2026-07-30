'use client';

import { useState } from 'react';

export interface HeatmapPoint {
  day: number; // 0 = Sunday, 1 = Monday, etc.
  hour: number; // 0-23
  value: number;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS_SHORT = ['12a', '3a', '6a', '9a', '12p', '3p', '6p', '9p'];

export function HeatmapChart({
  data,
}: {
  data: HeatmapPoint[];
}) {
  const [hovered, setHovered] = useState<{ day: number; hour: number; val: number } | null>(null);

  const maxValue = Math.max(1, ...data.map((d) => d.value));

  // Build 2D matrix [day][hour]
  const matrix: number[][] = Array(7).fill(0).map(() => Array(24).fill(0));
  data.forEach((p) => {
    if (p.day >= 0 && p.day < 7 && p.hour >= 0 && p.hour < 24) {
      matrix[p.day][p.hour] = p.value;
    }
  });

  const getHeatColor = (val: number) => {
    if (val === 0) return 'hsl(var(--v-canvas))';
    const opacity = 0.15 + (val / maxValue) * 0.85;
    return `rgba(37, 99, 235, ${opacity})`; // matching Accent HSL
  };

  return (
    <div className="w-full flex flex-col gap-3 relative">
      <div className="overflow-x-auto no-scrollbar">
        <div className="min-w-[480px] p-2 flex flex-col gap-1.5">
          {/* Hour labels */}
          <div className="flex text-[9px] font-bold text-faint mb-1">
            <div className="w-10 shrink-0" /> {/* spacing for day label */}
            <div className="flex-1 flex justify-between px-1.5">
              {HOURS_SHORT.map((h, i) => (
                <span key={i} className="w-6 text-center select-none">{h}</span>
              ))}
            </div>
          </div>

          {/* Grid rows */}
          {matrix.map((row, dayIdx) => (
            <div key={dayIdx} className="flex items-center gap-1.5">
              {/* Day label */}
              <span className="w-10 text-[10px] font-bold text-muted select-none">
                {DAYS[dayIdx]}
              </span>

              {/* Cells */}
              <div className="flex-1 flex gap-1 justify-between">
                {row.map((val, hourIdx) => (
                  <div
                    key={hourIdx}
                    onMouseEnter={() => setHovered({ day: dayIdx, hour: hourIdx, val })}
                    onMouseLeave={() => setHovered(null)}
                    className="flex-1 aspect-square rounded-sm border border-line/10 cursor-pointer transition-all hover:scale-110 hover:shadow-sm"
                    style={{
                      background: getHeatColor(val),
                      minHeight: '12px',
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex justify-end items-center gap-2 text-[10px] font-bold text-muted pr-2">
        <span>Less active</span>
        <div className="flex gap-1">
          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
            <div
              key={i}
              className="h-3 w-3 rounded-sm border border-line/10"
              style={{ background: getHeatColor(p * maxValue) }}
            />
          ))}
        </div>
        <span>More active</span>
      </div>

      {/* Tooltip */}
      {hovered !== null && (
        <div
          className="absolute z-10 v-card !p-2 text-[11px] pointer-events-none shadow-lg bg-surface border border-line rounded-lg"
          style={{
            left: '52px',
            bottom: '40px',
          }}
        >
          <p className="font-bold text-ink">
            {DAYS[hovered.day]} at {hovered.hour === 0 ? '12 AM' : hovered.hour === 12 ? '12 PM' : hovered.hour > 12 ? `${hovered.hour - 12} PM` : `${hovered.hour} AM`}
          </p>
          <p className="text-muted font-semibold">
            Activity level: <strong className="text-ink">{hovered.val} events</strong>
          </p>
        </div>
      )}
    </div>
  );
}
