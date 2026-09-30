'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * One metric over time against the period before it, with a hover readout.
 *
 * The chart is drawn left-to-right in data order and mirrored as a whole in
 * RTL, so time runs from the start edge in either language. Readouts and axis
 * labels are positioned with logical insets so they follow the mirroring.
 */
export function TrendChart({
  current,
  previous,
  labels,
  currentLabel,
  previousLabel,
  formatDelta,
  markers = [],
  height = 232,
}: {
  current: number[];
  /** Same length as `current`; omitted when there is no earlier period to show. */
  previous?: number[];
  /** One label per point, shown in the readout and thinned out on the axis. */
  labels: string[];
  currentLabel: string;
  previousLabel: string;
  formatDelta: (pct: number) => string;
  /** Occasions to mark: a band over their points, named at its foot and in the readout. */
  markers?: { from: number; to: number; label: string }[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => setW(Math.max(280, entries[0].contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const n = current.length;
  const padT = 10;
  const padB = 6;
  const gutter = 34; // room for the value axis at the start edge
  const innerH = height - padT - padB;
  const rawMax = Math.max(1, ...current, ...(previous ?? []));
  const step = niceStep(rawMax / 4);
  const max = step * 4;

  const xAt = (i: number) => gutter + (n <= 1 ? 0 : (i / (n - 1)) * (w - gutter - 4));
  const yAt = (v: number) => padT + innerH - (v / max) * innerH;
  const path = (pts: number[]) => pts.map((v, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join(' ');

  const ticks = [0, 1, 2, 3, 4].map((k) => k * step);
  const axisIdx = useMemo(() => {
    if (n <= 1) return [0];
    const count = Math.min(5, n);
    return Array.from({ length: count }, (_, k) => Math.round((k * (n - 1)) / (count - 1)));
  }, [n]);

  // Pointer position → nearest point. The SVG is mirrored in RTL, so measure
  // from the start edge rather than the left.
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const fromStart = rtl ? box.right - e.clientX : e.clientX - box.left;
    const ratio = (fromStart - gutter) / Math.max(1, box.width - gutter - 4);
    setHover(Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1)))));
  }

  const hx = hover === null ? 0 : xAt(hover);
  const cur = hover === null ? 0 : current[hover];
  const prev = hover === null || !previous ? null : previous[hover];
  const pct = prev ? ((cur - prev) / prev) * 100 : null;
  // Keep the readout inside the plot: after the point in the first half, before it in the second.
  const readoutAfter = hover !== null && hx < w / 2;
  const hoverMarker = hover === null ? null : markers.find((m) => hover >= m.from && hover <= m.to) ?? null;
  // A band spans half a step either side of its points, so a one-day occasion is visible too.
  const half = n > 1 ? (w - gutter - 4) / (n - 1) / 2 : 0;
  const bands = markers.map((m) => {
    const x1 = Math.max(gutter, xAt(m.from) - half);
    const x2 = Math.min(w, xAt(m.to) + half);
    return { ...m, x1, x2, mid: (x1 + x2) / 2 };
  });

  return (
    <div
      ref={ref}
      className="relative w-full min-w-0 select-none"
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
    >
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        className="block rtl:-scale-x-100"
      >
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--v-accent)" stopOpacity="0.14" />
            <stop offset="100%" stopColor="var(--v-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {bands.map((b) => (
          <rect key={`${b.from}-${b.label}`} x={b.x1} y={padT} width={Math.max(2, b.x2 - b.x1)} height={innerH} style={{ fill: 'rgba(var(--v-accent-rgb), 0.07)' }} />
        ))}
        {ticks.map((v) => (
          <line
            key={v}
            x1={gutter}
            x2={w}
            y1={yAt(v)}
            y2={yAt(v)}
            stroke="hsl(var(--v-border))"
            strokeDasharray={v === 0 ? undefined : '2 4'}
          />
        ))}
        {n > 0 && (
          <path d={`${path(current)} L${xAt(n - 1)} ${yAt(0)} L${xAt(0)} ${yAt(0)} Z`} fill="url(#trend-fill)" />
        )}
        {previous && previous.length === n && (
          <path
            d={path(previous)}
            fill="none"
            stroke="hsl(var(--v-faint))"
            strokeOpacity="0.8"
            strokeWidth="1.5"
            strokeDasharray="3 4"
          />
        )}
        <path d={path(current)} fill="none" stroke="var(--v-accent)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && (
          <line x1={hx} x2={hx} y1={padT} y2={yAt(0)} stroke="hsl(var(--v-faint))" strokeOpacity="0.6" />
        )}
      </svg>

      {/* Value axis */}
      {ticks.map((v) => (
        <span
          key={v}
          className="tabular pointer-events-none absolute start-0 text-2xs leading-[14px] text-faint"
          style={{ top: yAt(v) - 7 }}
        >
          {compact(v)}
        </span>
      ))}

      {/* Occasion names, at the foot of their bands */}
      {bands.map((b) => {
        // Centred under its band, unless that would run off either edge of the plot.
        const edge = 96;
        const place: React.CSSProperties =
          b.mid > w - edge
            ? { insetInlineEnd: Math.max(0, w - b.x2) }
            : b.mid < gutter + edge
              ? { insetInlineStart: b.x1 }
              : { insetInlineStart: b.mid };
        const centred = 'insetInlineStart' in place && place.insetInlineStart === b.mid;
        return (
        <span
          key={`${b.from}-${b.label}`}
          className={`pointer-events-none absolute flex ${centred ? 'w-0 justify-center' : ''}`}
          style={{ ...place, top: yAt(0) - 26 }}
        >
          <span className="flex max-w-[180px] items-center gap-1 whitespace-nowrap rounded-md bg-surface px-1.5 py-0.5 text-2xs font-medium text-accent shadow-sm ring-1 ring-inset ring-accent/25">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span className="truncate">{b.label}</span>
          </span>
        </span>
        );
      })}

      {/* Hover markers and readout */}
      {hover !== null && (
        <>
          <span
            className="pointer-events-none absolute h-3 w-3 rounded-full bg-surface"
            style={{
              insetInlineStart: hx - 6,
              top: yAt(cur) - 6,
              boxShadow: '0 0 0 2.5px var(--v-accent), 0 0 0 7px rgba(var(--v-accent-rgb), 0.15)',
            }}
          />
          {prev !== null && (
            <span
              className="pointer-events-none absolute h-2 w-2 rounded-full bg-surface"
              style={{ insetInlineStart: hx - 4, top: yAt(prev) - 4, boxShadow: '0 0 0 2px hsl(var(--v-faint))' }}
            />
          )}
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-[176px] rounded-lg border border-line bg-surface px-3 py-2.5 text-xs shadow-lg"
            style={readoutAfter ? { insetInlineStart: hx + 16 } : { insetInlineEnd: w - hx + 16 }}
          >
            <p className="mb-1.5 text-2xs text-faint">{labels[hover]}</p>
            {hoverMarker && (
              <p className="-mt-1 mb-1.5 flex items-center gap-1 text-2xs font-medium text-accent">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span className="truncate">{hoverMarker.label}</span>
              </p>
            )}
            <p className="flex items-center gap-2">
              <span className="h-0.5 w-2.5 rounded-full bg-accent" />
              <span className="text-muted">{currentLabel}</span>
              <span className="tabular ms-auto font-semibold text-ink">{cur}</span>
            </p>
            {prev !== null && (
              <p className="mt-1 flex items-center gap-2">
                <span className="h-0.5 w-2.5 rounded-full bg-faint" />
                <span className="text-muted">{previousLabel}</span>
                <span className="tabular ms-auto font-semibold text-ink">{prev}</span>
              </p>
            )}
            {pct !== null && (
              <p className="mt-2 border-t border-line pt-2">
                <span dir="ltr" className={`v-badge ${pct >= 0 ? 'v-badge-success' : 'v-badge-danger'}`}>
                  {formatDelta(pct)}
                </span>
              </p>
            )}
          </div>
        </>
      )}

      {/* Time axis */}
      <div className="relative h-6">
        {axisIdx.map((i, k) => (
          <span
            key={i}
            // The first and last dates grow inwards, so neither is cut off at the edge.
            className={`absolute top-2 flex w-0 whitespace-nowrap text-2xs text-faint ${
              k === 0 ? 'justify-start' : k === axisIdx.length - 1 ? 'justify-end' : 'justify-center'
            }`}
            style={{ insetInlineStart: xAt(i) }}
          >
            {labels[i]}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A round step (1, 2, 5 × 10ⁿ) at least as large as `raw`. */
function niceStep(raw: number) {
  if (raw <= 1) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / mag;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * mag;
}

function compact(v: number) {
  return v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v);
}
