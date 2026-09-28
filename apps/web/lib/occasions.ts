import type { Occasion } from '@vertex/shared';

export type { Occasion };

/** An occasion as a run of points on a chart: indexes into its day keys, inclusive. */
export interface ChartMarker {
  from: number;
  to: number;
  label: string;
}

const DAY = 86_400_000;
const at = (key: string) => Date.parse(`${key}T00:00:00Z`);

/**
 * The occasions that touch a window of day keys (YYYY-MM-DD, consecutive), as
 * ranges into it. An occasion running past either end is cut at that end.
 */
export function markersFor(occasions: Occasion[], keys: string[]): ChartMarker[] {
  if (keys.length === 0) return [];
  const first = keys[0];
  const last = keys[keys.length - 1];
  return occasions
    .filter((o) => o.endsOn >= first && o.startsOn <= last)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
    .map((o) => ({
      from: keys.indexOf(o.startsOn < first ? first : o.startsOn),
      to: keys.indexOf(o.endsOn > last ? last : o.endsOn),
      label: o.name,
    }))
    .filter((m) => m.from >= 0 && m.to >= m.from);
}

/** The occasion running on a day, which of its days that is (from 1) and how many it has. */
export function occasionOn(occasions: Occasion[], key: string): { occasion: Occasion; day: number; days: number } | null {
  const o = occasions.find((x) => x.startsOn <= key && key <= x.endsOn);
  if (!o) return null;
  return { occasion: o, day: (at(key) - at(o.startsOn)) / DAY + 1, days: (at(o.endsOn) - at(o.startsOn)) / DAY + 1 };
}

/** How many timestamps fall on the occasion's days, counted in UTC like the charts. */
export function countDuring(o: Occasion, timestamps: string[]): number {
  return timestamps.filter((ts) => {
    const key = new Date(ts).toISOString().slice(0, 10);
    return key >= o.startsOn && key <= o.endsOn;
  }).length;
}
