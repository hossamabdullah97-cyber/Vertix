'use client';

import './globals.css';
import { ErrorScreen } from '@/components/ErrorScreen';

/** When the root layout itself fails: the whole document, with nothing from the layout to lean on. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="bg-canvas text-ink antialiased">
        <ErrorScreen error={error} reset={reset} />
      </body>
    </html>
  );
}
