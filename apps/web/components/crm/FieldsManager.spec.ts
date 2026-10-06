import { describe, expect, it } from 'vitest';
import { parseOptions } from './FieldsManager';

describe('choices for a choice field', () => {
  it('are one per line or comma, each once, without blanks', () => {
    expect(parseOptions('Retail, Real estate\nretail\n\n،تجزئة')).toEqual(['Retail', 'Real estate', 'تجزئة']);
  });
});
