import { resolveAction } from '@/lib/brandIcons';
import { Icon } from '@/components/Icon';
import type { PublicCardAction } from '@/lib/api';

function resolveAll(actions: PublicCardAction[], slug: string) {
  return actions
    .map((a) => ({ a, r: resolveAction(a, slug) }))
    .filter((x): x is { a: PublicCardAction; r: NonNullable<typeof x.r> } => x.r !== null);
}

/** Round quick-contact buttons (call / email / whatsapp) — like Tap / TapiTag. */
export function QuickActions({ actions, slug }: { actions: PublicCardAction[]; slug: string }) {
  const quick = resolveAll(actions, slug).filter((x) => x.r.isQuickContact);
  if (quick.length === 0) return null;
  return (
    <div className="flex justify-center gap-3">
      {quick.map(({ a, r }) => (
        <a
          key={a.id}
          href={r.href}
          target="_blank"
          rel="noreferrer"
          aria-label={r.brand.label}
          className="flex h-12 w-12 items-center justify-center rounded-full border transition-transform active:scale-95"
          style={{ borderColor: 'hsl(var(--v-border))', color: r.brand.color, background: 'hsl(var(--v-surface))' }}
        >
          <Icon name={r.brand.icon} size={20} />
        </a>
      ))}
    </div>
  );
}

/** Rich link rows with brand-coloured icon tiles — like Popl / Joshua. */
export function LinkRows({ actions, slug }: { actions: PublicCardAction[]; slug: string }) {
  const links = resolveAll(actions, slug).filter((x) => !x.r.isQuickContact);
  if (links.length === 0) return null;
  return (
    <div className="grid gap-2.5">
      {links.map(({ a, r }) => (
        <a
          key={a.id}
          href={r.href}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3.5 rounded-[var(--v-radius)] border border-[hsl(var(--v-border))] bg-[hsl(var(--v-surface))] p-3 transition-transform active:scale-[0.99]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] text-white" style={{ background: r.brand.color }}>
            <Icon name={r.brand.icon} size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-semibold">{r.brand.label}</span>
            <span className="block truncate text-[12px] text-[hsl(var(--v-muted))]">{r.subtitle}</span>
          </span>
          <span className="text-[hsl(var(--v-faint))] rtl:rotate-180">
            <Icon name="arrow" size={18} />
          </span>
        </a>
      ))}
    </div>
  );
}
