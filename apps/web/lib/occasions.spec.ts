import { describe, expect, it } from 'vitest';
import { countDuring, markersFor, occasionOn } from './occasions';

const keys = ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22'];
const expo = { id: 'a', name: 'Cairo ICT', startsOn: '2026-09-19', endsOn: '2026-09-21' };

describe('markersFor', () => {
  it('turns an occasion into the run of chart points it covers', () => {
    expect(markersFor([expo], keys)).toEqual([{ from: 1, to: 3, label: 'Cairo ICT' }]);
  });

  it('cuts an occasion at the edges of the window, and drops ones outside it', () => {
    const early = { id: 'b', name: 'Early', startsOn: '2026-09-10', endsOn: '2026-09-18' };
    const late = { id: 'c', name: 'Late', startsOn: '2026-09-22', endsOn: '2026-10-05' };
    const gone = { id: 'd', name: 'Gone', startsOn: '2026-08-01', endsOn: '2026-08-03' };
    expect(markersFor([late, gone, early], keys)).toEqual([
      { from: 0, to: 0, label: 'Early' },
      { from: 4, to: 4, label: 'Late' },
    ]);
  });

  it('has nothing to mark on an empty window', () => {
    expect(markersFor([expo], [])).toEqual([]);
  });
});

describe('occasionOn', () => {
  it('names the occasion on a day and which of its days it is', () => {
    expect(occasionOn([expo], '2026-09-20')).toEqual({ occasion: expo, day: 2, days: 3 });
    expect(occasionOn([expo], '2026-09-22')).toBeNull();
  });
});

describe('countDuring', () => {
  it('counts what happened on the occasion days, by UTC day', () => {
    expect(
      countDuring(expo, ['2026-09-18T23:59:00Z', '2026-09-19T00:00:00Z', '2026-09-21T22:00:00Z', '2026-09-22T00:00:01Z']),
    ).toBe(2);
  });
});
