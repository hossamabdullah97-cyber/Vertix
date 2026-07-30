'use client';

/**
 * Vertex Connect brand mark — a bold geometric "V" with an inner connection
 * chevron and a node dot. Monochrome (uses `currentColor`) so it adapts to its
 * context: white on the brand-blue background, brand-blue on light surfaces.
 */
export function VMark({
  size = 24,
  strokeWidth = 2.5,
  className,
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Outer V */}
      <path
        d="M6.5 7.5 L16 25 L25.5 7.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Inner connection chevron */}
      <path
        d="M12.5 9.5 L16 16.5 L19.5 9.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      />
      {/* Connection node */}
      <circle cx="25.5" cy="7.5" r="2.6" fill="currentColor" />
    </svg>
  );
}

// Animated draw-in loader using the same geometric V.
export function VLoader({ size = 28 }: { size?: number }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <VMark size={size} className="animate-pulse" />
    </div>
  );
}
