'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/Icon';

export interface ActionItem {
  key: string;
  label: string;
  icon: string;
  /** Internal route; rendered as a link. */
  href?: string;
  /** External page, opened in a new tab. */
  externalHref?: string;
  onSelect?: () => void;
  danger?: boolean;
  /** Draws a divider above this item. */
  separated?: boolean;
}

/**
 * A "more actions" button and its menu. The menu is placed against the
 * viewport so a scrolling table cannot clip it, opens upwards when there is no
 * room below, and is keyboard-navigable (arrows, Escape).
 */
export function ActionMenu({ label, items }: { label: string; items: ActionItem[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function toggle() {
    if (open) return setOpen(false);
    const r = buttonRef.current?.getBoundingClientRect();
    if (r) {
      const rtl = document.documentElement.dir === 'rtl';
      const below = window.innerHeight - r.bottom > 44 * items.length + 24;
      setPos({
        ...(below ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }),
        ...(rtl ? { left: r.left } : { right: window.innerWidth - r.right }),
      });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const list = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? []);
    list()[0]?.focus();
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const els = list();
        const i = els.indexOf(document.activeElement as HTMLElement);
        els[e.key === 'ArrowDown' ? (i + 1) % els.length : (i - 1 + els.length) % els.length]?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const itemCls = (danger?: boolean) =>
    `flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-start text-[13px] outline-none hover:bg-elevated focus:bg-elevated sm:min-h-8 ${
      danger ? 'text-red-600 dark:text-red-400' : 'text-ink'
    }`;

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="flex h-11 w-11 items-center justify-center rounded-md text-faint transition-colors hover:bg-elevated hover:text-ink sm:h-7 sm:w-7"
      >
        <Icon name="dots" size={15} />
      </button>
      {open && (
        <div role="menu" style={pos} className="fixed z-[70] w-56 rounded-xl border border-line bg-surface p-1 shadow-lg">
          {items.map((it) => {
            const icon = <Icon name={it.icon} size={14} className={it.danger ? undefined : 'text-faint'} />;
            const body = (
              <>
                {icon} {it.label}
              </>
            );
            return (
              <div key={it.key}>
                {it.separated && <div className="my-1 h-px bg-line" />}
                {it.href ? (
                  <Link role="menuitem" href={it.href} className={itemCls(it.danger)} onClick={() => setOpen(false)}>
                    {body}
                  </Link>
                ) : it.externalHref ? (
                  <a
                    role="menuitem"
                    href={it.externalHref}
                    target="_blank"
                    rel="noreferrer"
                    className={itemCls(it.danger)}
                    onClick={() => {
                      setOpen(false);
                      it.onSelect?.();
                    }}
                  >
                    {body}
                  </a>
                ) : (
                  <button
                    role="menuitem"
                    className={itemCls(it.danger)}
                    onClick={() => {
                      setOpen(false);
                      it.onSelect?.();
                    }}
                  >
                    {body}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
