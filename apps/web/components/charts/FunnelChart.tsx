'use client';

export interface FunnelStage {
  name: string;
  count: number;
  label?: string;
}

export function FunnelChart({
  stages,
  suggestions = [],
}: {
  stages: FunnelStage[];
  suggestions?: string[];
}) {
  const maxVal = Math.max(1, ...stages.map((s) => s.count));

  return (
    <div className="grid md:grid-cols-5 gap-6 items-start">
      {/* Visual Funnel Stack (Left) */}
      <div className="md:col-span-3 flex flex-col gap-3.5 w-full">
        {stages.map((stage, idx) => {
          const percent = maxVal > 0 ? (stage.count / maxVal) * 100 : 0;
          const prevCount = idx > 0 ? stages[idx - 1].count : null;
          const dropOff = prevCount !== null && prevCount > 0 
            ? Math.round(((prevCount - stage.count) / prevCount) * 100)
            : 0;

          // Trapezoid coordinates helper
          const scale = maxVal > 0 ? stage.count / maxVal : 0;
          const nextScale = idx < stages.length - 1 ? stages[idx + 1].count / maxVal : scale;
          
          const padLeftStart = (100 - scale * 100) / 2;
          const padLeftEnd = (100 - nextScale * 100) / 2;

          const widthStart = scale * 100;
          const widthEnd = nextScale * 100;

          return (
            <div key={idx} className="relative flex flex-col items-center">
              {/* Stage Bar */}
              <div className="w-full flex items-center justify-between gap-4 p-3.5 bg-canvas/40 border border-line rounded-xl hover:bg-canvas/60 transition-all">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-line text-[11px] font-bold text-muted">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-bold text-ink truncate">{stage.name}</p>
                    <p className="text-[10px] font-bold text-muted uppercase tracking-wider">
                      {stage.label || 'Visitors'}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-[15px] font-black text-ink tabular-nums">{stage.count}</p>
                  <p className="text-[10.5px] font-semibold text-emerald-500 tabular-nums">
                    {Math.round(percent)}% conversion
                  </p>
                </div>
              </div>

              {/* Connector Trapezoid & Drop-off Banner */}
              {idx < stages.length - 1 && (
                <div className="w-full flex flex-col items-center py-1">
                  {/* Drop-off Indicator */}
                  {dropOff > 0 && (
                    <div className="v-chip !px-2 !py-0.5 !text-[9.5px] font-bold text-red-500 bg-red-500/10 border-red-500/20 absolute -right-2 top-[52px] z-10">
                      ↓ {dropOff}% drop-off
                    </div>
                  )}

                  {/* SVG Trapezoid Connection */}
                  <svg width="100%" height="24" className="opacity-15" preserveAspectRatio="none">
                    <polygon
                      points={`
                        ${padLeftStart}%,0
                        ${100 - padLeftStart}%,0
                        ${100 - padLeftEnd}%,100
                        ${padLeftEnd}%,100
                      `}
                      fill="var(--v-accent)"
                    />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Funnel Diagnostics & Suggestions (Right) */}
      <div className="md:col-span-2 v-card bg-canvas/30 border border-line p-5 rounded-2xl">
        <h3 className="text-[13px] font-bold uppercase tracking-wider text-muted mb-3.5 flex items-center gap-1.5">
          <span>🧠</span> Funnel Insights
        </h3>
        
        {suggestions.length > 0 ? (
          <div className="space-y-3">
            {suggestions.map((sug, i) => (
              <div key={i} className="flex gap-2.5 items-start">
                <span className="text-[14px] mt-0.5">⚡</span>
                <p className="text-[12px] font-semibold leading-relaxed text-muted">{sug}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-muted">
            <p className="text-[12px] font-semibold">Conversion rates are stable. No alerts found at this time.</p>
          </div>
        )}
      </div>
    </div>
  );
}
