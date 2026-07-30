'use client';

import { useState } from 'react';

export interface GeoRegion {
  code: string;
  name: string;
  value: number;
  color: string;
}

const CONTINENTS = [
  { name: 'North America', x: 75, y: 40 },
  { name: 'South America', x: 105, y: 90 },
  { name: 'Europe', x: 175, y: 32 },
  { name: 'Africa', x: 185, y: 70 },
  { name: 'Asia', x: 260, y: 45 },
  { name: 'Australia', x: 300, y: 95 },
];

export function GeoMapChart({
  regions,
}: {
  regions: GeoRegion[];
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const maxValue = Math.max(1, ...regions.map((r) => r.value));

  // Map country codes to continents for the visual nodes
  const mapCodeToCoord = (code: string) => {
    switch (code.toUpperCase()) {
      case 'US':
      case 'CA':
      case 'MX':
        return { x: 75, y: 40 }; // North America
      case 'BR':
      case 'AR':
      case 'CO':
        return { x: 105, y: 90 }; // South America
      case 'GB':
      case 'FR':
      case 'DE':
      case 'IT':
      case 'ES':
        return { x: 175, y: 32 }; // Europe
      case 'ZA':
      case 'EG':
      case 'NG':
      case 'KE':
        return { x: 185, y: 70 }; // Africa
      case 'JP':
      case 'CN':
      case 'IN':
      case 'KR':
      case 'SG':
      case 'AE':
      case 'SA':
        return { x: 260, y: 45 }; // Asia
      case 'AU':
      case 'NZ':
        return { x: 300, y: 95 }; // Australia
      default:
        return null;
    }
  };

  return (
    <div className="grid sm:grid-cols-5 gap-6 items-center">
      {/* Map graphic (Left) */}
      <div className="sm:col-span-3 flex justify-center p-4 bg-canvas/30 rounded-2xl border border-line relative overflow-hidden">
        {/* Vector stylized grid globe */}
        <svg width="100%" height="150" viewBox="0 0 360 150" className="opacity-45" aria-hidden="true">
          {/* Latitude & Longitude grid lines */}
          {[15, 30, 45, 60, 75, 90, 105, 120, 135].map((y, i) => (
            <line key={i} x1="0" y1={y} x2="360" y2={y} stroke="hsl(var(--v-border))" strokeWidth="0.5" />
          ))}
          {[30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((x, i) => (
            <line key={i} x1={x} y1="0" x2={x} y2="150" stroke="hsl(var(--v-border))" strokeWidth="0.5" />
          ))}

          {/* Continents outlines */}
          {CONTINENTS.map((c, i) => (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r="22"
              fill="transparent"
              stroke="hsl(var(--v-border))"
              strokeWidth="0.5"
              strokeDasharray="2 2"
            />
          ))}
        </svg>

        {/* Dynamic event density markers */}
        {regions.map((region, idx) => {
          const coord = mapCodeToCoord(region.code);
          if (!coord) return null;

          const size = 10 + (region.value / maxValue) * 20;
          const isHovered = hoveredIdx === idx;

          return (
            <div
              key={idx}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
              style={{
                left: `${(coord.x / 360) * 100}%`,
                top: `${(coord.y / 150) * 100}%`,
              }}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Outer pulsing ring */}
              <span
                className="absolute inset-0 rounded-full animate-ping opacity-25"
                style={{
                  background: region.color,
                  width: size,
                  height: size,
                }}
              />
              {/* Core dot */}
              <div
                className="rounded-full shadow-md cursor-pointer border border-white/20 transition-all"
                style={{
                  background: region.color,
                  width: size,
                  height: size,
                  scale: isHovered ? '1.25' : '1',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Country List & Density (Right) */}
      <div className="sm:col-span-2 flex flex-col gap-2.5 w-full">
        <h4 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">
          Top Visitor Markets
        </h4>
        {regions.map((region, idx) => {
          const isHovered = hoveredIdx === idx;
          const percent = maxValue > 0 ? (region.value / maxValue) * 100 : 0;

          return (
            <div
              key={idx}
              className="flex flex-col gap-1 cursor-pointer transition-opacity duration-200"
              style={{ opacity: hoveredIdx !== null && !isHovered ? 0.45 : 1 }}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div className="flex justify-between items-center text-[12px] font-semibold">
                <span className="text-ink flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: region.color }} />
                  {region.name}
                </span>
                <span className="font-mono text-muted tabular-nums">{region.value} scans</span>
              </div>
              <div className="h-1.5 w-full bg-canvas rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${percent}%`,
                    background: region.color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
