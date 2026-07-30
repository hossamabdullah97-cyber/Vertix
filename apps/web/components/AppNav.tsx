'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { logout } from '@/lib/client';

const LINKS = [
  { href: '/dashboard', label: 'Cards' },
  { href: '/tags', label: 'NFC Tags' },
  { href: '/team', label: 'Team' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/billing', label: 'Billing' },
];

export default function AppNav() {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto max-w-5xl px-5 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-accent" />
            <span className="font-semibold">Vertex Connect</span>
          </Link>
          <nav className="flex items-center gap-1">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`text-sm px-3 py-1.5 rounded-md ${
                  pathname.startsWith(l.href)
                    ? 'bg-canvas text-ink font-medium'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <button
          onClick={() => {
            logout();
            router.push('/login');
          }}
          className="text-sm text-muted hover:text-ink"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
