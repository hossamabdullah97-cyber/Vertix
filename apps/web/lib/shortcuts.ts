'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Single-key shortcuts, as in Linear or Gmail. The shell handles the ones that
 * work everywhere (? for the list, / for search, G then a letter to go to a
 * page); a page adds its own with useShortcut (N for "new" on the leads page,
 * the cards page…), and the list shows whichever the current page offers.
 *
 * None of them fire while typing in a field, with a modifier held (so the
 * browser's own ⌘/Ctrl shortcuts are untouched), or while a dialog is open.
 */
export interface PageShortcut {
  key: string;
  label: string;
}

const actions = new Map<string, { label: string; run: () => void }>();
const listeners = new Set<() => void>();
let list: PageShortcut[] = [];
const publish = () => {
  list = [...actions.entries()].map(([key, a]) => ({ key, label: a.label }));
  listeners.forEach((l) => l());
};

/** Offers `key` on this page while it is mounted; the list shows it with `label`. */
export function useShortcut(key: string, label: string, run: () => void, enabled = true) {
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    if (!enabled) return;
    const k = key.toLowerCase();
    actions.set(k, { label, run: () => latest.current() });
    publish();
    return () => {
      if (actions.get(k)?.label === label) actions.delete(k);
      publish();
    };
  }, [key, label, enabled]);
}

/** Runs the page's shortcut for `key`, if it offers one. */
export function runPageShortcut(key: string): boolean {
  const a = actions.get(key.toLowerCase());
  if (!a) return false;
  a.run();
  return true;
}

export function usePageShortcuts(): PageShortcut[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => list,
    () => list,
  );
}

/** Whether a key press belongs to something else: a field being typed in, a modifier, an open dialog. */
export function notForShortcuts(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return true;
  const el = e.target as HTMLElement | null;
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return true;
  return !!document.querySelector('[role=dialog], [role=alertdialog]');
}

/** Where G then a letter goes. */
export const GO_TO: { key: string; href: string; labelKey: string }[] = [
  { key: 'h', href: '/dashboard', labelKey: 'items.dashboard' },
  { key: 'c', href: '/cards', labelKey: 'items.cards' },
  { key: 'l', href: '/leads', labelKey: 'items.leads' },
  { key: 'a', href: '/analytics', labelKey: 'items.analytics' },
  { key: 'n', href: '/notifications', labelKey: 'items.notifications' },
  { key: 't', href: '/team', labelKey: 'items.team' },
  { key: 's', href: '/workspace', labelKey: 'items.settings' },
];
