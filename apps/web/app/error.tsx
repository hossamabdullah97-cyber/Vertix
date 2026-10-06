'use client';

import { ErrorScreen } from '@/components/ErrorScreen';

/** Any page that fails to render shows this instead, inside the app's layout. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen error={error} reset={reset} />;
}
