/**
 * Links that carry their workspace. The address holds `w` (a workspace's slug,
 * or its id in links the server writes), so a link opens in the workspace it
 * is about instead of whichever one was last open in this browser.
 *
 * The slugs this browser has seen are kept so that the right workspace can be
 * chosen before the page asks for anything: otherwise the page would load from
 * the old workspace first and then switch.
 */

export const WORKSPACE_PARAM = 'w';
const SLUGS_KEY = 'vertex_org_slugs';

function read(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(SLUGS_KEY) ?? '{}');
    return v && typeof v === 'object' ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Whether this browser last knew the person to be in the workspace a value names. */
export function wasKnown(w: string): boolean {
  const map = read();
  return !!map[w] || Object.values(map).includes(w);
}

/** The same address without a workspace in it. */
export function dropWorkspaceFromAddress() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(WORKSPACE_PARAM)) return;
  url.searchParams.delete(WORKSPACE_PARAM);
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

const NAMES_KEY = 'vertex_org_names';

/** Remembers the workspaces this person is in: slug → id, and each one's name. */
export function rememberWorkspaces(orgs: { id: string; slug?: string | null; name?: string | null }[]) {
  const map: Record<string, string> = {};
  const names: Record<string, string> = {};
  for (const o of orgs) {
    if (o.slug) map[o.slug] = o.id;
    if (o.name) names[o.id] = o.name;
  }
  try {
    localStorage.setItem(SLUGS_KEY, JSON.stringify(map));
    localStorage.setItem(NAMES_KEY, JSON.stringify(names));
  } catch {
    /* storage unavailable: the switch then happens once the list loads */
  }
}

/** The names of the workspaces this person is in, by id. */
export function workspaceNames(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(NAMES_KEY) ?? '{}');
    return v && typeof v === 'object' ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function forgetWorkspaces() {
  try {
    localStorage.removeItem(SLUGS_KEY);
    localStorage.removeItem(NAMES_KEY);
  } catch {
    /* nothing to forget */
  }
}

/** The workspace the address asks for, as written. */
export function requestedWorkspace(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location?.search ?? '').get(WORKSPACE_PARAM);
}

/** The id the address asks for, when this browser already knows it. */
export function knownRequestedId(): string | null {
  const w = requestedWorkspace();
  if (!w) return null;
  const map = read();
  if (map[w]) return map[w]!;
  return Object.values(map).includes(w) ? w : null;
}

/** Which of these workspaces a value names, by slug or id. */
export function matchWorkspace<T extends { id: string; slug?: string | null }>(orgs: T[], w: string): T | null {
  return orgs.find((o) => o.id === w || (!!o.slug && o.slug === w)) ?? null;
}

/** The same address, saying which workspace it is in. */
export function withWorkspace(href: string, workspace: string | null | undefined): string {
  if (!workspace) return href;
  const url = new URL(href, 'http://x');
  url.searchParams.set(WORKSPACE_PARAM, workspace);
  return url.pathname + url.search + url.hash;
}
