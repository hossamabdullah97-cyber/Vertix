import { describe, expect, it } from 'vitest';
import { activeMention, insertMention, keptMentions, matchMembers, splitMentions } from './mentions';

describe('typing @ in a note', () => {
  it('finds the name being typed, but not an email address', () => {
    expect(activeMention('Call @Ra', 8)).toEqual({ start: 5, query: 'Ra' });
    expect(activeMention('@', 1)).toEqual({ start: 0, query: '' });
    expect(activeMention('ask @Mona Ad', 12)).toEqual({ start: 4, query: 'Mona Ad' });
    expect(activeMention('mail mona@x.co', 14)).toBeNull();
    expect(activeMention('@Rami\nnext', 10)).toBeNull();
    // Once the sentence goes on past the name, the list closes.
    expect(activeMention('ask @Mona Adel ? Thanks', 23)).toBeNull();
    expect(activeMention('ask @Mona Adel and then some', 28)).toBeNull();
  });

  it('puts the name in, with the caret after it', () => {
    expect(insertMention('Call @Ra today', 5, 8, 'Rami Adel')).toEqual({ text: 'Call @Rami Adel  today', caret: 16 });
  });

  it('keeps only the people still named in the text', () => {
    const picked = [{ id: 'u1', name: 'Rami' }, { id: 'u2', name: 'Mona' }, { id: 'u1', name: 'Rami' }];
    expect(keptMentions('Thanks @Rami', picked)).toEqual([{ id: 'u1', name: 'Rami' }]);
  });

  it('suggests teammates by any word of their name, or their email', () => {
    const members = [
      { id: '1', name: 'Mona Adel', email: 'mona@x.co' },
      { id: '2', name: 'Omar Saeed', email: 'omar@x.co' },
      { id: '3', name: 'منى خالد', email: 'mona.k@x.co' },
    ];
    expect(matchMembers(members, 'ad').map((m) => m.id)).toEqual(['1']);
    expect(matchMembers(members, 'mona').map((m) => m.id)).toEqual(['1', '3']);
    expect(matchMembers(members, 'من').map((m) => m.id)).toEqual(['3']);
    expect(matchMembers(members, '')).toHaveLength(3);
  });

  it('marks the named people when the note is shown, the longest name first', () => {
    const parts = splitMentions('Ask @Mona Adel and @Mona', [
      { id: '2', name: 'Mona' },
      { id: '1', name: 'Mona Adel' },
    ]);
    expect(parts).toEqual([{ text: 'Ask ' }, { text: '@Mona Adel', mention: { id: '1', name: 'Mona Adel' } }, { text: ' and ' }, { text: '@Mona', mention: { id: '2', name: 'Mona' } }]);
    expect(splitMentions('plain', [])).toEqual([{ text: 'plain' }]);
  });
});
