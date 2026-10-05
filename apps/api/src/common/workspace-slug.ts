/** A workspace's slug: its name in URL form with a short random tail, so two of the same name never clash. */
export function workspaceSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || 'org'}-${suffix}`;
}
