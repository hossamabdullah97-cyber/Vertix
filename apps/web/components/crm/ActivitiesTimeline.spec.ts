import { describe, expect, it } from 'vitest';
import { addPage, type FeedItem } from './ActivitiesTimeline';

const item = (id: string): FeedItem => ({ kind: 'returned', id, at: '2026-10-07T10:00:00.000Z', lead: { id: 'l1', name: 'Mona', company: null }, card: null });

describe('the activity feed pages', () => {
  it('meet at a shared moment without showing it twice', () => {
    expect(addPage([item('a'), item('b')], [item('b'), item('c')]).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });
});
