'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { gated } from '@/components/AccessGate';

/** Teams now open in a panel on the Team page; old links land there. */
function TeamRedirect() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  useEffect(() => {
    router.replace(`/team?team=${encodeURIComponent(id)}`);
  }, [router, id]);
  return null;
}

// Only for the roles that include it (lib/permissions canOpen).
export default gated(TeamRedirect, '/workspace/teams', (t) => t('items.team'));
