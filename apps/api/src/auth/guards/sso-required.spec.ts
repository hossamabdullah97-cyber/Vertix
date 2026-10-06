import { ssoRequired } from './tenant.guard';

const org = (enforced: boolean, tested = true) => ({
  ssoConnection: { enforced, testedAt: tested ? new Date() : null },
  ssoDomains: [{ domain: 'acme.com' }],
});

describe('ssoRequired', () => {
  it('holds members with an address on a verified domain to it', () => {
    expect(ssoRequired(org(true), 'EMPLOYEE', 'Sara@ACME.com')).toBe(true);
    expect(ssoRequired(org(true), 'ADMIN', 'sara@acme.com')).toBe(true);
  });

  it('leaves out owners, outside addresses, and a workspace not requiring it', () => {
    expect(ssoRequired(org(true), 'OWNER', 'sara@acme.com')).toBe(false);
    expect(ssoRequired(org(true), 'EMPLOYEE', 'guest@partner.com')).toBe(false);
    expect(ssoRequired(org(false), 'EMPLOYEE', 'sara@acme.com')).toBe(false);
    expect(ssoRequired(org(true, false), 'EMPLOYEE', 'sara@acme.com')).toBe(false);
    expect(ssoRequired({ ssoConnection: null, ssoDomains: [] }, 'EMPLOYEE', 'sara@acme.com')).toBe(false);
  });
});
