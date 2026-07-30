'use client';

import { useState } from 'react';

export interface DonutItem {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({ data, size = 160 }: { data: DonutItem[]; size?: number }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  const radius = 50;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * radius; // ~314.159

  let accumulatedPercent = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 justify-center">
      {/* Donut SVG */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox="0 0 120 120"
          className="transform -rotate-90"
          aria-hidden="true"
        >
          {/* Base circle background */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="transparent"
            stroke="hsl(var(--v-canvas))"
            strokeWidth={strokeWidth}
          />
          {data.map((item, idx) => {
            const percent = item.value / total;
            const strokeLength = percent * circumference;
            const strokeOffset = circumference - (accumulatedPercent * circumference);
            accumulatedPercent += percent;

            const isHovered = hovered === idx;

            return (
              <circle
                key={idx}
                cx="60"
                cy="60"
                r={radius}
                fill="transparent"
                stroke={item.color}
                strokeWidth={isHovered ? strokeWidth + 3 : strokeWidth}
                strokeDasharray={`${strokeLength} ${circumference}`}
                strokeDashoffset={strokeOffset}
                strokeLinecap="round"
                className="transition-all duration-300 cursor-pointer"
                onMouseEnter={() => setHovered(idx)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  transformOrigin: '60px 60px',
                  scale: isHovered ? '1.02' : '1',
                }}
              />
            );
          })}
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {hovered !== null ? (
            <>
              <span className="text-[14px] font-black text-ink">
                {Math.round((data[hovered].value / total) * 100)}%
              </span>
              <span className="text-[9px] font-bold text-muted uppercase tracking-wider truncate max-w-[90px]">
                {data[hovered].label}
              </span>
            </>
          ) : (
            <>
              <span className="text-[15px] font-black text-ink">{total}</span>
              <span className="text-[9px] font-bold text-muted uppercase tracking-wider">Total</span>
            </>
          )}
        </div>
      </div>

      {/* Legend list */}
      <div className="flex flex-col gap-1.5 min-w-[120px] flex-1">
        {data.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between text-[11.5px] font-semibold transition-opacity duration-200 cursor-pointer"
            onMouseEnter={() => setHovered(idx)}
            onMouseLeave={() => setHovered(null)}
            style={{ opacity: hovered !== null && hovered !== idx ? 0.4 : 1 }}
          >
            <div className="flex items-center gap-2 text-muted">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: item.color }} />
              <span className="truncate max-w-[120px]">{item.label}</span>
            </div>
            <span className="font-mono text-ink text-[11px] tabular-nums">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
