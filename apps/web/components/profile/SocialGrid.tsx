import { actionHref } from '@/lib/actions';
import { Icon, actionIcon } from '@/components/Icon';
import { VMark } from '@/components/brand/VMark';
import type { PublicCardAction } from '@/lib/api';

/** Tight icon-only grid of actions (the monochrome "social grid" look). */
export default function SocialGrid({
  actions,
  slug,
  accent,
}: {
  actions: PublicCardAction[];
  slug: string;
  accent: string;
}) {
  const items = actions.map((a) => ({ a, href: actionHref(a, slug) })).filter((x) => x.href);
  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-4 gap-2.5">
      {items.map(({ a, href }) => (
        <a
          key={a.id}
          href={href!}
          target="_blank"
          rel="noreferrer"
          className="flex aspect-square items-center justify-center rounded-[var(--v-radius)] border border-[hsl(var(--v-border))] bg-[hsl(var(--v-surface))] transition-colors hover:border-[var(--v-accent)]"
          style={{ color: accent }}
          aria-label={a.type}
        >
          <Icon name={actionIcon(a.type)} size={22} />
        </a>
      ))}
      {/* Brand node */}
      <div
        className="flex aspect-square items-center justify-center rounded-[var(--v-radius)] border border-[hsl(var(--v-border))]"
        style={{ color: accent }}
        aria-hidden="true"
      >
        <VMark size={20} strokeWidth={2.5} />
      </div>
    </div>
  );
}
