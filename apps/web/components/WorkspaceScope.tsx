'use client';

import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WORKSPACE_SWITCH, type WorkspaceSwitch } from '@/lib/switch';

/**
 * Holds the app's pages, and mounts them again when the workspace changes,
 * so every page reads the new one from the start: no reload, no download,
 * the sidebar drawn from what it last knew while the page fills in.
 */
export function WorkspaceScope({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    window.__vxWorkspaceScope = true;
    const onSwitch = (e: Event) => {
      const { href } = (e as CustomEvent<WorkspaceSwitch>).detail;
      const target = new URL(href, window.location.origin);
      if (target.pathname === window.location.pathname) {
        // The same page, for the other workspace: mount it again.
        router.replace(target.pathname + target.search + target.hash);
        setGeneration((g) => g + 1);
      } else {
        // Another page mounts fresh, already in the new workspace.
        router.push(target.pathname + target.search + target.hash);
      }
    };
    window.addEventListener(WORKSPACE_SWITCH, onSwitch);
    return () => {
      window.removeEventListener(WORKSPACE_SWITCH, onSwitch);
      window.__vxWorkspaceScope = false;
    };
  }, [router]);

  return <Fragment key={generation}>{children}</Fragment>;
}
