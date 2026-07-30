// Geometric "constellation" line-art used on monochrome card covers.
// Deterministic (seeded) so SSR and client render identically — no layout shift.
function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function Constellation({
  seed = 7,
  stroke = 'rgba(255,255,255,0.22)',
  dot = 'rgba(255,255,255,0.55)',
  className,
}: {
  seed?: number;
  stroke?: string;
  dot?: string;
  className?: string;
}) {
  const r = rng(seed);
  const w = 400;
  const h = 200;
  const nodes = Array.from({ length: 16 }, () => ({
    x: Math.round(r() * w),
    y: Math.round(r() * h),
  }));

  const edges: [number, number][] = [];
  for (let i = 0; i < nodes.length; i++) {
    // connect each node to its 2 nearest neighbours
    const dist = nodes
      .map((n, j) => ({ j, d: (n.x - nodes[i].x) ** 2 + (n.y - nodes[i].y) ** 2 }))
      .filter((x) => x.j !== i)
      .sort((a, b) => a.d - b.d);
    edges.push([i, dist[0].j]);
    edges.push([i, dist[1].j]);
  }

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
    >
      {edges.map(([a, b], i) => (
        <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} stroke={stroke} strokeWidth="0.8" />
      ))}
      {nodes.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r={i % 4 === 0 ? 1.8 : 1} fill={dot} />
      ))}
    </svg>
  );
}
