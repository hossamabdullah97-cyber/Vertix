'use client';

import { setActiveOrgId } from './client';
import { withWorkspace, WORKSPACE_PARAM } from './workspaces';
import { dismissUndo } from './undo';

/**
 * Opening another workspace without reloading the app: the page tree under
 * WorkspaceScope (components/WorkspaceScope.tsx) is mounted again for the new
 * workspace, or the app moves to the address given, which mounts fresh.
 */
export const WORKSPACE_SWITCH = 'vertex:workspace-switch';

export interface WorkspaceSwitch {
  id: string | null;
  /** Where to go, already naming the workspace. */
  href: string;
}

declare global {
  interface Window {
    __vxWorkspaceScope?: boolean;
  }
}

/** Opens workspace `id` at `href` (a path in this app). */
export function openWorkspace(id: string | null, slug: string | null | undefined, href: string) {
  // An undo offered in the workspace being left must not run in the next one.
  dismissUndo();
  setActiveOrgId(id);
  const target = withWorkspace(href, slug ?? id);
  // The address names the workspace too (lib/workspaces.ts): change it now,
  // so nothing read before the move lands back in the old one.
  const here = new URL(window.location.href);
  if (slug ?? id) here.searchParams.set(WORKSPACE_PARAM, (slug ?? id)!);
  else here.searchParams.delete(WORKSPACE_PARAM);
  window.history.replaceState(window.history.state, '', here.pathname + here.search + here.hash);
  if (!window.__vxWorkspaceScope) {
    window.location.href = target;
    return;
  }
  window.dispatchEvent(new CustomEvent<WorkspaceSwitch>(WORKSPACE_SWITCH, { detail: { id, href: target } }));
}
