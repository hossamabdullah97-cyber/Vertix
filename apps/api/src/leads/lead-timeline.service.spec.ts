import { NotFoundException } from '@nestjs/common';
import { LeadTimelineService, cardLabel, groupVisits } from './lead-timeline.service';

const T0 = new Date('2026-10-01T10:00:00Z').getTime();
const at = (min: number) => new Date(T0 + min * 60_000);
const ev = (id: string, type: string, min: number, extra: Partial<{ cardId: string; tagId: string; metadata: unknown }> = {}) => ({
  id,
  type,
  cardId: extra.cardId ?? 'c1',
  tagId: extra.tagId ?? null,
  metadata: extra.metadata ?? null,
  createdAt: at(min),
});
const card = (id: string | null) => (id ? { id, name: id === 'c1' ? 'Omar' : 'Mona' } : null);

describe('groupVisits', () => {
  it('a tap, its view and what they did after are one visit', () => {
    const visits = groupVisits(
      [ev('1', 'NFC_SCAN', 0, { tagId: 't1' }), ev('2', 'VIEW', 0.1), ev('3', 'CLICK', 2, { metadata: { kind: 'link', type: 'WHATSAPP' } }), ev('4', 'SAVE', 3)],
      at(60),
      card,
    );
    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({ tapped: true, returning: false, card: { name: 'Omar' }, endedAt: at(3).toISOString() });
    expect(visits[0]!.actions).toEqual([
      { type: 'CLICK', at: at(2).toISOString(), action: 'WHATSAPP' },
      { type: 'SAVE', at: at(3).toISOString() },
    ]);
  });

  it('half an hour away, or another card, starts a new visit; after the details were left it is a return', () => {
    const visits = groupVisits([ev('1', 'VIEW', 0), ev('2', 'VIEW', 45), ev('3', 'VIEW', 46, { cardId: 'c2' }), ev('4', 'VIEW', 3000)], at(10), card);
    expect(visits.map((v) => [v.card?.name, v.returning])).toEqual([
      ['Omar', false],
      ['Omar', true],
      ['Mona', true],
      ['Omar', true],
    ]);
  });
});

describe('cardLabel', () => {
  it('is the person on the card, else its address', () => {
    expect(cardLabel({ slug: 'omar-1', vcardData: { fullName: ' Omar Adel ' } })).toBe('Omar Adel');
    expect(cardLabel({ slug: 'omar-1', vcardData: null })).toBe('omar-1');
  });
});

describe('LeadTimelineService', () => {
  function make(lead: Record<string, unknown> | null, events: unknown[] = []) {
    const findMany = jest.fn(async () => [...events].reverse());
    const db = {
      lead: { findFirst: jest.fn(async () => lead) },
      event: { findMany },
      card: { findMany: jest.fn(async () => [{ id: 'c1', slug: 'omar', vcardData: { fullName: 'Omar' } }]) },
    };
    const notes = { authors: jest.fn(async () => new Map([['u1', { id: 'u1', name: 'Sara', avatarUrl: null }]])) };
    return { service: new LeadTimelineService({ client: db } as never, notes as never), db, findMany };
  }

  const viewer = { orgId: 'o1', userId: 'u1', role: 'EMPLOYEE' as const };
  const base = {
    id: 'l1',
    createdAt: at(5),
    source: 'card_form',
    visitorId: 'v1',
    cardId: 'c1',
    tag: null,
    activities: [
      { id: 'a2', type: 'CALL', metadata: { by: 'u1', note: 'Called' }, createdAt: at(200) },
      { id: 'a1', type: 'STAGE_CHANGE', metadata: { by: 'u1', from: 's1', to: 's2' }, createdAt: at(100) },
    ],
    tasks: [{ id: 't1', title: 'Send offer', dueDate: at(-10), completed: false, completedAt: null, createdAt: at(150), assignedTo: 'u1' }],
  };

  it('puts the visits, conversations, tasks and pipeline moves in one list, newest first', async () => {
    const { service } = make(base, [ev('e1', 'VIEW', 0), ev('e2', 'VIEW', 300)]);
    const { items, summary } = await service.timeline(viewer, 'l1');
    expect(items.map((i) => i.kind + ':' + i.id)).toEqual(['visit:visit-e2', 'activity:a2', 'task:task-t1', 'activity:a1', 'created:created-l1', 'visit:visit-e1']);
    expect(items.find((i) => i.id === 'a2')).toMatchObject({ author: { name: 'Sara' } });
    expect(summary).toMatchObject({ visits: 2, returns: 1, contacts: 1, openTasks: 1, overdueTasks: 1, lastContactAt: at(200).toISOString() });
  });

  it('only for a lead the person may see', async () => {
    const { service } = make(null);
    await expect(service.timeline(viewer, 'l1')).rejects.toThrow(NotFoundException);
  });

  it('a lead with no device has no visits, and none are looked up', async () => {
    const { service, findMany } = make({ ...base, visitorId: null });
    const { summary } = await service.timeline(viewer, 'l1');
    expect(findMany).not.toHaveBeenCalled();
    expect(summary.visits).toBe(0);
  });
});
