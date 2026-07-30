/**
 * Derives an integration's health from its recent delivery record (section 17).
 * A pure function so the thresholds are testable without a database, and so the
 * status shown to users is computed the same way everywhere.
 */
export type HealthStatus = 'healthy' | 'warning' | 'degraded' | 'error' | 'idle';

export interface HealthInput {
  /** Deliveries attempted in the health window. */
  total: number;
  /** Of those, how many succeeded. */
  succeeded: number;
  /** Whether the most recent delivery failed (a fresh blip downgrades health). */
  latestFailed: boolean;
}

export function deliveryHealth({ total, succeeded, latestFailed }: HealthInput): HealthStatus {
  if (total === 0) return 'idle';
  const rate = succeeded / total;
  if (rate < 0.5) return 'error';
  if (rate < 0.8) return 'degraded';
  if (rate < 0.95 || latestFailed) return 'warning';
  return 'healthy';
}

/** Success rate as a 0–100 integer; 0 when there is nothing to measure. */
export function successRate(total: number, succeeded: number): number {
  if (total === 0) return 0;
  return Math.round((succeeded / total) * 100);
}
