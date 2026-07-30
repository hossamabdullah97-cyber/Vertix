import { applyMapping, vertexFieldValue, DEFAULT_HUBSPOT_MAPPING } from './field-mapping';

/**
 * Field mapping turns a Vertex lead into the CRM's property payload. A wrong
 * mapping writes data into the wrong CRM field or overwrites it with blanks, so
 * the derivation and the blank-skipping are pinned here.
 */

const lead = {
  name: 'Sara Malik',
  email: 'sara@acme.co',
  phone: '+201001234567',
  company: 'Acme Signs',
  source: 'nfc',
  temperature: 'HOT',
};

describe('vertexFieldValue', () => {
  it('splits a full name into first and last', () => {
    expect(vertexFieldValue(lead, 'firstName')).toBe('Sara');
    expect(vertexFieldValue(lead, 'lastName')).toBe('Malik');
    expect(vertexFieldValue(lead, 'fullName')).toBe('Sara Malik');
  });

  it('handles a single-word name (no last name)', () => {
    expect(vertexFieldValue({ name: 'Cher' }, 'firstName')).toBe('Cher');
    expect(vertexFieldValue({ name: 'Cher' }, 'lastName')).toBeUndefined();
  });

  it('reads the simple fields', () => {
    expect(vertexFieldValue(lead, 'email')).toBe('sara@acme.co');
    expect(vertexFieldValue(lead, 'company')).toBe('Acme Signs');
    expect(vertexFieldValue(lead, 'source')).toBe('nfc');
  });

  it('is undefined for a missing value or unknown field', () => {
    expect(vertexFieldValue({ email: null }, 'email')).toBeUndefined();
    expect(vertexFieldValue(lead, 'nope')).toBeUndefined();
  });
});

describe('applyMapping', () => {
  it('produces the CRM property object under the default HubSpot mapping', () => {
    expect(applyMapping(lead, DEFAULT_HUBSPOT_MAPPING)).toEqual({
      firstname: 'Sara',
      lastname: 'Malik',
      email: 'sara@acme.co',
      phone: '+201001234567',
      company: 'Acme Signs',
    });
  });

  it('honours a custom mapping', () => {
    const mapping = { fullName: 'full_name', source: 'lead_source' };
    expect(applyMapping(lead, mapping)).toEqual({
      full_name: 'Sara Malik',
      lead_source: 'nfc',
    });
  });

  it('omits fields with no value — never overwrites a CRM field with a blank', () => {
    const partial = { name: 'Solo', email: null, phone: '', company: 'X' };
    expect(applyMapping(partial, DEFAULT_HUBSPOT_MAPPING)).toEqual({
      firstname: 'Solo',
      company: 'X',
    });
  });

  it('returns an empty object when nothing maps', () => {
    expect(applyMapping({ email: null }, DEFAULT_HUBSPOT_MAPPING)).toEqual({});
  });
});
