/**
 * The last page the person was on outside the help center, kept by AppShell
 * for this tab, so a message to support says where they were stuck. Its own
 * module so every page can keep it without loading the help articles.
 */
export const LAST_PAGE_KEY = 'vx:last-page';

export function rememberPage(pathname: string) {
  if (pathname.startsWith('/help')) return;
  try {
    sessionStorage.setItem(LAST_PAGE_KEY, pathname);
  } catch {}
}

export function lastPage(): string | undefined {
  try {
    return sessionStorage.getItem(LAST_PAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}
