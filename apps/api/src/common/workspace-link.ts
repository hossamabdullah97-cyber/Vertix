/**
 * A link into the app that opens in the workspace it is about: the web app
 * reads `w` (a workspace's slug or id) and switches to it, or says the person
 * has no access there. Without it a link opens in whichever workspace was
 * last open in that browser.
 */
export function workspaceLink(path: string, workspace: string | null | undefined): string {
  if (!workspace) return path;
  const hash = path.indexOf('#');
  const [base, frag] = hash === -1 ? [path, ''] : [path.slice(0, hash), path.slice(hash)];
  return `${base}${base.includes('?') ? '&' : '?'}w=${encodeURIComponent(workspace)}${frag}`;
}
