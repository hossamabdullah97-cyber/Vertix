import { describe, expect, it } from 'vitest';
import { returnedAt, type LeadActivity, type Task } from './crm';
import { activitiesOf, byDay, entries, isBareCapture, matches, visitActionKey, type CreatedItem, type VisitItem } from './timeline';

const visit = (id: string, at: string, returning = false): VisitItem => ({ kind: 'visit', id, at, endedAt: at, card: null, returning, tapped: false, actions: [] });
const created: CreatedItem = { kind: 'created', id: 'created-l1', at: '2026-10-01T10:00:00.000Z', source: 'card_form', card: null, tag: null };
const act = (id: string, type: LeadActivity['type'], createdAt: string): LeadActivity => ({ id, type, metadata: null, createdAt });
const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'Send offer',
  notes: null,
  priority: 'MEDIUM',
  dueDate: null,
  completed: false,
  completedAt: null,
  leadId: 'l1',
  createdAt: '2026-10-02T09:00:00.000Z',
  lead: null,
  ...over,
});

describe('the lead timeline', () => {
  it('puts visits, activity and tasks together, newest first, the creation last at the same moment', () => {
    const list = entries(
      [visit('v1', '2026-10-01T10:00:00.000Z'), created, visit('v2', '2026-10-03T08:00:00.000Z', true)],
      [act('a1', 'CALL', '2026-10-02T12:00:00.000Z')],
      [task({ completed: true, completedAt: '2026-10-02T15:00:00.000Z' })],
    );
    expect(list.map((e) => e.id)).toEqual(['v2', 'task-done-t1', 'a1', 'task-t1', 'v1', 'created-l1']);
  });

  it('leaves out the empty note a sent form leaves, but keeps what the visitor or the team wrote', () => {
    expect(isBareCapture({ id: 'a', type: 'NOTE', metadata: { intent: 'CONTACT', note: null }, createdAt: 'x' })).toBe(true);
    expect(isBareCapture({ id: 'a', type: 'NOTE', metadata: { intent: 'CONTACT', note: 'Call me after 5' }, createdAt: 'x' })).toBe(false);
    expect(isBareCapture({ id: 'a', type: 'NOTE', metadata: { manual: true, note: 'x', by: 'u1' }, createdAt: 'x' })).toBe(false);
    expect(entries([], [{ id: 'a', type: 'NOTE', metadata: { note: null }, createdAt: 'x' }], [])).toEqual([]);
  });

  it('filters by what happened', () => {
    const list = entries([visit('v1', '2026-10-01T11:00:00.000Z'), created], [act('a1', 'CALL', 'x'), { ...act('a2', 'NOTE', 'x'), metadata: { manual: true, note: 'Wants a demo', by: 'u1' } }, act('a3', 'STAGE_CHANGE', 'x')], [task()]);
    const ids = (f: Parameters<typeof matches>[1]) => list.filter((e) => matches(e, f)).map((e) => e.id).sort();
    expect(ids('conversations')).toEqual(['a1']);
    expect(ids('notes')).toEqual(['a2']);
    expect(ids('visits')).toEqual(['v1']);
    expect(ids('tasks')).toEqual(['task-t1']);
    expect(ids('changes')).toEqual(['a3', 'created-l1']);
    expect(ids('all')).toHaveLength(6);
  });

  it('groups by calendar day in the reader’s zone', () => {
    const days = byDay([{ at: '2026-10-02T21:30:00.000Z' }, { at: '2026-10-02T20:00:00.000Z' }, { at: '2026-10-01T23:00:00.000Z' }], 'Africa/Cairo');
    expect(days.map((d) => [d.day, d.items.length])).toEqual([
      ['2026-10-03', 1],
      ['2026-10-02', 2],
    ]);
  });

  it('takes the activity out of the server’s answer as the drawer keeps it', () => {
    expect(activitiesOf({ items: [{ kind: 'activity', id: 'a1', at: 'x', type: 'NOTE', metadata: { note: 'hi' }, author: null }, created], summary: {} as never })).toEqual([
      { id: 'a1', type: 'NOTE', metadata: { note: 'hi' }, createdAt: 'x', author: null },
    ]);
  });

  it('names what they did on a visit', () => {
    expect(visitActionKey({ type: 'CLICK', at: 'x', action: 'WHATSAPP' })).toBe('timeline.did.WHATSAPP');
    expect(visitActionKey({ type: 'CLICK', at: 'x', platform: 'InstaPay' })).toBe('timeline.did.payment');
    expect(visitActionKey({ type: 'CLICK', at: 'x', action: 'SOMETHING_NEW' })).toBe('timeline.did.link');
    expect(visitActionKey({ type: 'SAVE', at: 'x' })).toBe('timeline.did.save');
  });
});

describe('returnedAt', () => {
  const now = new Date('2026-10-07T12:00:00Z').getTime();
  it('is a visit after the one the details were left on, within the week', () => {
    expect(returnedAt({ createdAt: '2026-10-01T10:00:00Z', lastVisitAt: '2026-10-07T09:00:00Z' }, now)).toBe('2026-10-07T09:00:00Z');
    expect(returnedAt({ createdAt: '2026-10-07T09:00:00Z', lastVisitAt: '2026-10-07T09:05:00Z' }, now)).toBeNull();
    expect(returnedAt({ createdAt: '2026-09-01T10:00:00Z', lastVisitAt: '2026-09-20T09:00:00Z' }, now)).toBeNull();
    expect(returnedAt({ createdAt: '2026-10-01T10:00:00Z', lastVisitAt: null }, now)).toBeNull();
  });
});
