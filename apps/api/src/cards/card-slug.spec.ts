import { isPlaceholderSlug, slugFromName } from './card-slug';

describe('slugFromName', () => {
  it('uses Latin names as written', () => {
    expect(slugFromName('Sarah Chen')).toBe('sarah-chen');
    expect(slugFromName('  José  Álvarez ')).toBe('jose-alvarez');
  });

  it('spells common Arabic names the familiar way', () => {
    expect(slugFromName('سلمى عبد الرحمن')).toBe('salma-abdelrahman');
    expect(slugFromName('محمد أحمد')).toBe('mohamed-ahmed');
    expect(slugFromName('حسام عبد الله')).toBe('hossam-abdallah');
  });

  it('transliterates the rest letter by letter', () => {
    expect(slugFromName('عبد الكريم')).toBe('abdelkarim');
    expect(slugFromName('عبد الفتاح')).toBe('abdelftah');
    expect(slugFromName('كريم السقا')).toBe('karim-elska');
  });

  it('ignores harakat and keeps a mixed name', () => {
    expect(slugFromName('مُحَمَّد Salem')).toBe('mohamed-salem');
  });

  it('returns empty when nothing usable is left', () => {
    expect(slugFromName('   ')).toBe('');
    expect(slugFromName('🙂')).toBe('');
  });
});

describe('isPlaceholderSlug', () => {
  it('matches only the links a nameless card gets', () => {
    expect(isPlaceholderSlug('card')).toBe(true);
    expect(isPlaceholderSlug('card-9uvt')).toBe(true);
    expect(isPlaceholderSlug('card-holder')).toBe(false);
    expect(isPlaceholderSlug('salma')).toBe(false);
  });
});
