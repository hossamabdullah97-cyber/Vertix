'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/** Teams now open in a panel on the Team page; old links land there. */
export default function TeamRedirect() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  useEffect(() => {
    router.replace(`/team?team=${encodeURIComponent(id)}`);
  }, [router, id]);
  return null;
}
