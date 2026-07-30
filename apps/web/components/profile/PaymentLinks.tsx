'use client';

import { motion } from 'framer-motion';
import { Icon } from '@/components/Icon';
import { PaymentBrandLogo } from '@/components/brand/PaymentBrandLogo';
import { paymentBrand } from '@/lib/paymentBrands';
import { API_URL, type PublicPaymentLink } from '@/lib/api';

/**
 * External payment links on the public profile. Vertex Connect only opens the
 * owner-provided URL and records the click — it never processes a payment.
 */
export default function PaymentLinks({
  links,
  slug,
  profileName,
}: {
  links: PublicPaymentLink[];
  slug: string;
  profileName?: string | null;
}) {
  if (!links.length) return null;

  function trackClick(link: PublicPaymentLink) {
    // A CLICK event tagged with the platform + identity — no amount, no
    // credentials, ever. Best-effort; must not block opening the link.
    try {
      const v = localStorage.getItem('vertex_visitor') || undefined;
      fetch(`${API_URL}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          type: 'CLICK',
          visitorId: v,
          metadata: { kind: 'payment', platform: link.platform, paymentLinkId: link.id, identity: profileName ?? null },
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-2.5">
      {links.map((link, i) => {
        const brand = paymentBrand(link.platform);
        return (
          <motion.a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            onClick={() => trackClick(link)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            whileTap={{ scale: 0.98 }}
            className="group flex min-h-[64px] w-full items-center gap-3.5 rounded-2xl border border-[hsl(var(--v-border))] bg-[hsl(var(--v-surface))] p-3.5 shadow-sm transition-colors hover:border-[hsl(var(--v-border))] active:bg-[hsl(var(--v-bg))]"
          >
            <PaymentBrandLogo platform={link.platform} size={44} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-bold text-[hsl(var(--v-fg))]">
                {link.displayName}
              </span>
              <span className="block truncate text-[11.5px] text-[hsl(var(--v-muted))]">
                {link.description || brand.label}
              </span>
            </span>
            <span className="flex items-center gap-1 text-[12px] font-semibold text-[hsl(var(--v-muted))] transition-colors group-hover:text-[hsl(var(--v-fg))]">
              Open <Icon name="arrow" size={14} />
            </span>
          </motion.a>
        );
      })}
    </div>
  );
}
