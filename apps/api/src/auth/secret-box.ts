import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Encrypts the two-step verification secrets at rest (AES-256-GCM), so a
 * copy of the database alone does not give anyone the codes. The key is
 * TOTP_ENCRYPTION_KEY (32 bytes, base64) when set, otherwise one derived
 * from JWT_SECRET; changing whichever is used disables existing
 * authenticator setups (recovery codes still work, being only hashed).
 */
export class SecretBox {
  private readonly key: Buffer;

  /** `purpose` keeps a key derived for one use from opening another's boxes. */
  constructor(dedicatedKey: string | undefined, jwtSecret: string, purpose = 'totp-secret-v1') {
    const raw = dedicatedKey?.trim() ? Buffer.from(dedicatedKey.trim(), 'base64') : null;
    this.key = raw && raw.length === 32 ? raw : Buffer.from(hkdfSync('sha256', jwtSecret, 'vertex', purpose, 32));
  }

  seal(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join('.');
  }

  open(sealed: string): string {
    const [v, iv, tag, body] = sealed.split('.');
    if (v !== 'v1' || !iv || !tag || !body) throw new Error('Unreadable secret');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
  }
}
