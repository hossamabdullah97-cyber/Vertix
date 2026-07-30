import { actionHref, actionLabel } from '@/lib/actions';
import { Icon, actionIcon } from '@/components/Icon';
import type { PublicCardAction } from '@/lib/api';

function subtext(a: PublicCardAction): string {
  const c = a.config ?? {};
  return (
    (c.url as string) ||
    (c.phone as string) ||
    (c.email as string) ||
    (c.query as string) ||
    'Open'
  ).replace(/^https?:\/\//, '');
}

/** Scannable geometric grid of contact / social actions. */
export default function ContactGrid({
  actions,
  slug,
}: {
  actions: PublicCardAction[];
  slug: string;
}) {
  const items = actions
    .map((a) => ({ a, href: actionHref(a, slug) }))
    .filter((x) => x.href);

  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {items.map(({ a, href }) => (
        <a
          key={a.id}
          href={href!}
          target="_blank"
          rel="noreferrer"
          className="group flex flex-col gap-2.5 rounded-[var(--v-radius)] border border-[hsl(var(--v-border))] bg-[hsl(var(--v-surface))] p-3.5 transition-colors hover:border-[var(--v-accent)]"
        >
          <span
            className="flex h-10 w-10 items-center justify-center rounded-[calc(var(--v-radius)-2px)] text-[var(--v-accent-contrast)]"
            style={{ background: 'var(--v-accent)' }}
          >
            <Icon name={actionIcon(a.type)} size={19} />
          </span>
          <span className="min-w-0">
            <span className="block text-[13.5px] font-semibold text-[hsl(var(--v-fg))]">
              {actionLabel(a.type)}
            </span>
            <span className="block truncate text-[11.5px] text-[hsl(var(--v-muted))]">
              {subtext(a)}
            </span>
          </span>
        </a>
      ))}
    </div>
  );
}
