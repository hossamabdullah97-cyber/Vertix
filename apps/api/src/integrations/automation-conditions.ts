/**
 * Condition evaluation for the automation engine. Pure and side-effect-free so
 * the matching logic can be tested exhaustively without a database or events.
 *
 * A rule matches when its conditions combine (ALL = and, ANY = or) to true.
 * Each condition reads a dotted `field` path out of the event payload and
 * compares it with `operator` against `value`.
 */
export type MatchType = 'ALL' | 'ANY';

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'exists'
  | 'not_exists'
  | 'gt'
  | 'lt';

export interface Condition {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}

/** Reads a dotted path (e.g. "data.company") from an object, or undefined. */
export function readPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function evalOne(actual: unknown, op: ConditionOperator, expected: unknown): boolean {
  switch (op) {
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'not_exists':
      return actual === undefined || actual === null;
    case 'equals':
      return String(actual) === String(expected);
    case 'not_equals':
      return String(actual) !== String(expected);
    case 'contains':
      return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    case 'not_contains':
      return !String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    case 'gt':
      return Number(actual) > Number(expected);
    case 'lt':
      return Number(actual) < Number(expected);
    default:
      return false;
  }
}

/**
 * Evaluates a set of conditions against an event payload. An empty condition
 * list always matches (an unconditional automation). ANY with an empty list is
 * treated the same — no conditions means "always".
 */
export function evaluateConditions(
  conditions: Condition[],
  matchType: MatchType,
  payload: unknown,
): boolean {
  if (!conditions || conditions.length === 0) return true;
  const results = conditions.map((c) =>
    evalOne(readPath(payload, c.field), c.operator, c.value),
  );
  return matchType === 'ANY' ? results.some(Boolean) : results.every(Boolean);
}
