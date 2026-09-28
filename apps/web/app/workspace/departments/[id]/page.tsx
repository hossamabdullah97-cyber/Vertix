'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/** Departments are edited from the Team page's Teams view; old links land there. */
export default function DepartmentRedirect() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  useEffect(() => {
    router.replace(`/team?department=${encodeURIComponent(id)}`);
  }, [router, id]);
  return null;
}
