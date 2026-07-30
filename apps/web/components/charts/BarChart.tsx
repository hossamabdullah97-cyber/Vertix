'use client';

import { useEffect, useRef, useState } from 'react';

export interface BarSeries {
  label: string;
  value: number;
  secondaryValue?: number;
  color?: string;
  secondaryColor?: string;
}

export function BarChart({
  data,
  height = 200,
}: {
  data: BarSeries[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(400);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      setW(Math.max(200, entries[0].contentRect.width));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const maxValue = Math.max(
    1,
    ...data.flatMap((d) => [d.value, d.secondaryValue ?? 0])
  );

  const paddingBottom = 24;
  const paddingTop = 16;
  const innerH = height - paddingBottom - paddingTop;
  
  const totalItems = data.length;
  const groupWidth = totalItems > 0 ? (w / totalItems) * 0.7 : 20;
  const gap = totalItems > 0 ? (w / totalItems) * 0.3 : 10;

  return (
    <div ref={ref} className="w-full relative">
      <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} aria-hidden="true">
        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
          const y = paddingTop + innerH * (1 - p);
          return (
            <g key={i}>
              <line
                x1="0"
                y1={y}
                x2={w}
                y2={y}
                stroke="hsl(var(--v-border))"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              {p > 0 && p < 1 && (
                <text
                  x="4"
                  y={y - 4}
                  fill="hsl(var(--v-faint))"
                  className="text-[9px] font-mono select-none"
                >
                  {Math.round(maxValue * p)}
                </text>
              )}
            </g>
          );
        })}

        {/* Render bars */}
        {data.map((item, idx) => {
          const groupX = idx * (groupWidth + gap) + gap / 2;
          const hasSecondary = item.secondaryValue !== undefined;
          
          // primary bar
          const barW = hasSecondary ? groupWidth / 2 - 2 : groupWidth;
          const h1 = (item.value / maxValue) * innerH;
          const y1 = paddingTop + innerH - h1;
          const x1 = groupX;

          // secondary bar
          const h2 = hasSecondary ? ((item.secondaryValue ?? 0) / maxValue) * innerH : 0;
          const y2 = paddingTop + innerH - h2;
          const x2 = groupX + barW + 4;

          const isHovered = hoveredIdx === idx;
          const primaryColor = item.color || 'var(--v-accent)';
          const secondaryColor = item.secondaryColor || 'hsl(var(--v-muted))';

          return (
            <g
              key={idx}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Primary Bar */}
              <rect
                x={x1}
                y={y1}
                width={Math.max(2, barW)}
                height={Math.max(1, h1)}
                fill={primaryColor}
                rx="3"
                style={{
                  opacity: isHovered ? 0.95 : 0.8,
                  transition: 'all 0.2s ease',
                }}
              />
              
              {/* Secondary Bar */}
              {hasSecondary && (
                <rect
                  x={x2}
                  y={y2}
                  width={Math.max(2, barW)}
                  height={Math.max(1, h2)}
                  fill={secondaryColor}
                  rx="3"
                  style={{
                    opacity: isHovered ? 0.95 : 0.6,
                    transition: 'all 0.2s ease',
                  }}
                />
              )}

              {/* Invisible interactive hover zone */}
              <rect
                x={groupX - gap / 4}
                y={paddingTop}
                width={groupWidth + gap / 2}
                height={innerH}
                fill="transparent"
              />

              {/* Label */}
              <text
                x={groupX + groupWidth / 2}
                y={height - 6}
                textAnchor="middle"
                fill={isHovered ? 'hsl(var(--v-ink))' : 'hsl(var(--v-muted))'}
                className="text-[10px] font-bold select-none transition-colors"
              >
                {item.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip Overlay */}
      {hoveredIdx !== null && (
        <div
          className="absolute z-10 v-card !p-2 text-[11px] pointer-events-none shadow-lg bg-surface border border-line rounded-lg"
          style={{
            left: `${Math.min(
              w - 140,
              Math.max(10, hoveredIdx * (groupWidth + gap) + groupWidth / 2 - 60)
            )}px`,
            top: '0px',
          }}
        >
          <p className="font-bold text-ink mb-0.5">{data[hoveredIdx].label}</p>
          <div className="flex flex-col gap-0.5 text-muted font-semibold">
            <span className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: data[hoveredIdx].color || 'var(--v-accent)' }}
              />
              Value: <strong className="text-ink">{data[hoveredIdx].value}</strong>
            </span>
            {data[hoveredIdx].secondaryValue !== undefined && (
              <span className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: data[hoveredIdx].secondaryColor || 'hsl(var(--v-muted))' }}
                />
                Secondary: <strong className="text-ink">{data[hoveredIdx].secondaryValue}</strong>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
