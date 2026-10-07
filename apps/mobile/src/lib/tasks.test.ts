import { describe, expect, it } from '@jest/globals';
import { dueAt, groupTasks } from './tasks';

const at = (s: string) => new Date(s);

describe('dueAt', () => {
  it('puts today at the end of the working day, or an hour on once that has passed', () => {
    expect(dueAt('today', at('2026-10-07T10:00:00'))).toEqual(at('2026-10-07T18:00:00'));
    expect(dueAt('today', at('2026-10-07T20:30:00'))).toEqual(at('2026-10-07T21:30:00'));
  });
  it('puts the later days at nine in the morning', () => {
    expect(dueAt('tomorrow', at('2026-10-07T22:00:00'))).toEqual(at('2026-10-08T09:00:00'));
    expect(dueAt('in3', at('2026-10-07T10:00:00'))).toEqual(at('2026-10-10T09:00:00'));
    expect(dueAt('nextWeek', at('2026-10-30T10:00:00'))).toEqual(at('2026-11-06T09:00:00'));
    expect(dueAt('none')).toBeNull();
  });
});

describe('groupTasks', () => {
  const now = at('2026-10-07T12:00:00');
  const task = (dueDate: string | null, completed = false, completedAt: string | null = null) => ({ dueDate: dueDate && at(dueDate).toISOString(), completed, completedAt });
  it('sorts tasks into late, today, later, whenever and done', () => {
    const g = groupTasks(
      [
        task('2026-10-09T09:00:00'),
        task('2026-10-07T18:00:00'),
        task('2026-10-07T09:00:00'),
        task('2026-10-01T09:00:00'),
        task(null),
        task('2026-10-01T09:00:00', true, '2026-10-02T09:00:00'),
        task(null, true, '2026-10-05T09:00:00'),
      ],
      now,
    );
    expect(g.overdue.map((t) => t.dueDate)).toEqual([at('2026-10-01T09:00:00').toISOString(), at('2026-10-07T09:00:00').toISOString()]);
    expect(g.today).toHaveLength(1);
    expect(g.upcoming).toHaveLength(1);
    expect(g.someday).toHaveLength(1);
    expect(g.done.map((t) => t.completedAt)).toEqual(['2026-10-05T09:00:00', '2026-10-02T09:00:00']);
  });
});
