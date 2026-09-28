'use client';

/** The small on/off switch used across the app. */
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`relative inline-flex h-[18px] w-[30px] shrink-0 rounded-full transition-colors before:absolute before:-inset-3 before:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 sm:before:hidden ${on ? 'bg-accent' : ''}`}
      style={on ? undefined : { background: 'hsl(var(--v-border-strong))' }}
    >
      <span className={`pointer-events-none absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-[inset-inline-start] ${on ? 'start-[14px]' : 'start-[2px]'}`} />
    </button>
  );
}
