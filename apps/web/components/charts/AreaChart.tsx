'use client';

import { useEffect, useRef, useState } from 'react';

export interface Series {
  name: string;
  color: string;
  points: number[];
}

/** Responsive, dependency-free multi-series area/line chart (Swiss editorial). */
export function AreaChart({
  series,
  labels,
  height = 220,
}: {
  series: Series[];
  labels: string[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => setW(Math.max(280, entries[0].contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const padB = 26;
  const padT = 12;
  const innerH = height - padB - padT;
  const max = Math.max(1, ...series.flatMap((s) => s.points));
  const n = Math.max(...series.map((s) => s.points.length), 1);

  const xAt = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * w);
  const yAt = (v: number) => padT + innerH - (v / max) * innerH;

  function pathFor(points: number[]) {
    if (!points.length) return { line: '', area: '' };
    const coords = points.map((v, i) => [xAt(i), yAt(v)] as const);
    const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const area = `${line} L${xAt(points.length - 1).toFixed(1)} ${padT + innerH} L0 ${padT + innerH} Z`;
    return { line, area };
  }

  const grid = [0, 0.25, 0.5, 0.75, 1].map((p) => padT + innerH * p);

  return (
    <div ref={ref} className="w-full">
      <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`ac-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.16" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {grid.map((y, i) => (
          <line key={i} x1="0" y1={y} x2={w} y2={y} stroke="hsl(var(--v-border))" strokeWidth="1" />
        ))}
        {series.map((s, i) => {
          const { line, area } = pathFor(s.points);
          return (
            <g key={i}>
              <path d={area} fill={`url(#ac-${i})`} />
              <path d={line} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10.5px] text-[hsl(var(--v-faint))]">
        {labels.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
    </div>
  );
}
