'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { gated } from '@/components/AccessGate';

/** Departments are edited from the Team page's Teams view; old links land there. */
function DepartmentRedirect() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  useEffect(() => {
    router.replace(`/team?department=${encodeURIComponent(id)}`);
  }, [router, id]);
  return null;
}

// Only for the roles that include it (lib/permissions canOpen).
export default gated(DepartmentRedirect, '/workspace/departments', (t) => t('items.team'));
