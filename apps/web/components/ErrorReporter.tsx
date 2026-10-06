'use client';

import { useEffect } from 'react';
import { watchErrors } from '@/lib/report-error';

/** Sends what no page caught to the API's error list (lib/report-error.ts). On every page. */
export function ErrorReporter() {
  useEffect(() => watchErrors(), []);
  return null;
}
