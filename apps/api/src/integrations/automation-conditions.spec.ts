import { evaluateConditions, readPath, type Condition } from './automation-conditions';

/**
 * The matcher decides whether an automation fires. A wrong result here either
 * runs actions that should not have (spam, bad CRM writes) or silently drops
 * ones that should — so every operator and both combinators are pinned.
 */

const payload = {
  event: 'lead.created',
  data: { name: 'Sara', company: 'Acme Signs', source: 'nfc', score: 80, email: null },
};

describe('readPath', () => {
  it('reads nested paths and returns undefined for misses', () => {
    expect(readPath(payload, 'data.company')).toBe('Acme Signs');
    expect(readPath(payload, 'data.missing')).toBeUndefined();
    expect(readPath(payload, 'data.company.nope')).toBeUndefined();
  });
});

describe('evaluateConditions — operators', () => {
  const check = (c: Condition) => evaluateConditions([c], 'ALL', payload);

  it('equals / not_equals compare as strings', () => {
    expect(check({ field: 'data.source', operator: 'equals', value: 'nfc' })).toBe(true);
    expect(check({ field: 'data.source', operator: 'equals', value: 'qr' })).toBe(false);
    expect(check({ field: 'data.score', operator: 'equals', value: 80 })).toBe(true);
    expect(check({ field: 'data.source', operator: 'not_equals', value: 'qr' })).toBe(true);
  });

  it('contains / not_contains are case-insensitive substrings', () => {
    expect(check({ field: 'data.company', operator: 'contains', value: 'acme' })).toBe(true);
    expect(check({ field: 'data.company', operator: 'contains', value: 'globex' })).toBe(false);
    expect(check({ field: 'data.company', operator: 'not_contains', value: 'globex' })).toBe(true);
  });

  it('exists / not_exists treat null as absent', () => {
    expect(check({ field: 'data.company', operator: 'exists' })).toBe(true);
    expect(check({ field: 'data.email', operator: 'exists' })).toBe(false); // null
    expect(check({ field: 'data.email', operator: 'not_exists' })).toBe(true);
    expect(check({ field: 'data.missing', operator: 'not_exists' })).toBe(true);
  });

  it('gt / lt compare numerically', () => {
    expect(check({ field: 'data.score', operator: 'gt', value: 50 })).toBe(true);
    expect(check({ field: 'data.score', operator: 'gt', value: 90 })).toBe(false);
    expect(check({ field: 'data.score', operator: 'lt', value: 90 })).toBe(true);
  });
});

describe('evaluateConditions — combinators', () => {
  it('matches with no conditions (unconditional automation)', () => {
    expect(evaluateConditions([], 'ALL', payload)).toBe(true);
  });

  it('ALL requires every condition', () => {
    const conds: Condition[] = [
      { field: 'data.source', operator: 'equals', value: 'nfc' },
      { field: 'data.company', operator: 'contains', value: 'acme' },
    ];
    expect(evaluateConditions(conds, 'ALL', payload)).toBe(true);
    conds[1].value = 'globex';
    expect(evaluateConditions(conds, 'ALL', payload)).toBe(false);
  });

  it('ANY needs just one', () => {
    const conds: Condition[] = [
      { field: 'data.source', operator: 'equals', value: 'qr' }, // false
      { field: 'data.company', operator: 'contains', value: 'acme' }, // true
    ];
    expect(evaluateConditions(conds, 'ANY', payload)).toBe(true);
    conds[1].value = 'globex';
    expect(evaluateConditions(conds, 'ANY', payload)).toBe(false);
  });
});
