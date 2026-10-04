import { base32Decode, base32Encode, hashRecoveryCode, newRecoveryCodes, otpauthUrl, totpCode, verifyTotp } from './totp';
import { SecretBox } from './secret-box';

// RFC 6238 appendix B: the ASCII secret "12345678901234567890", SHA-1.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP', () => {
  it('matches the RFC 6238 test vectors', () => {
    expect(totpCode(RFC_SECRET, Math.floor(59 / 30))).toBe('287082');
    expect(totpCode(RFC_SECRET, Math.floor(1111111109 / 30))).toBe('081804');
    expect(totpCode(RFC_SECRET, Math.floor(1234567890 / 30))).toBe('005924');
    expect(totpCode(RFC_SECRET, Math.floor(2000000000 / 30))).toBe('279037');
  });

  it('round-trips base32', () => {
    const b = Buffer.from([0, 1, 2, 250, 255, 7, 9]);
    expect(base32Decode(base32Encode(b))).toEqual(b);
  });

  it('accepts a code from a step either side, but not further, and never twice', () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30000);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step), now)).toBe(step);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step), now, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, '12345', now)).toBeNull();
  });

  it('makes recovery codes that are kept only as hashes, forgiving case and dashes', () => {
    const { codes, hashes } = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(codes[0]).toMatch(/^[a-z2-7]{4}-[a-z2-7]{4}$/);
    expect(hashRecoveryCode(codes[0]!.toUpperCase().replace('-', ' '))).toBe(hashes[0]);
  });

  it('builds the URL authenticator apps scan', () => {
    expect(otpauthUrl('ABC', 'mona@x.com')).toBe('otpauth://totp/Vertex%20Connect%3Amona%40x.com?secret=ABC&issuer=Vertex%20Connect&algorithm=SHA1&digits=6&period=30');
  });

  it('keeps secrets sealed, readable only with the same key', () => {
    const box = new SecretBox(undefined, 'jwt-secret-one');
    const sealed = box.seal('JBSWY3DPEHPK3PXP');
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(box.open(sealed)).toBe('JBSWY3DPEHPK3PXP');
    expect(() => new SecretBox(undefined, 'jwt-secret-two').open(sealed)).toThrow();
  });
});
