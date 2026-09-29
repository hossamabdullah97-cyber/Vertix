import { createHash, createVerify, generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as forge from 'node-forge';
import { unzipSync } from 'fflate';
import { appleSignerFrom, buildPkpass, passJson } from './apple-pass';
import { genericObject, googleIssuerFrom, googleSaveUrl } from './google-pass';
import { inkOn, rgb, walletCardOf, type WalletCard } from './wallet-card';

/** A throwaway certificate, standing in for Apple's Pass Type ID certificate. */
function selfSigned(cn: string) {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  cert.setSubject([{ name: 'commonName', value: cn }]);
  cert.setIssuer([{ name: 'commonName', value: cn }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { certPem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(keys.privateKey) };
}

const card: WalletCard = {
  serial: 'card1',
  name: 'Mariam Khaled',
  title: 'Sales Director',
  company: 'Vertex Build',
  phone: '+201005550142',
  email: 'mariam@vertex.build',
  accent: '#2563eb',
  lang: 'en',
  url: 'https://vertex.app/c/mariam',
  avatar: null,
};

describe('walletCardOf', () => {
  it('reads the identity the card shows, and falls back to the workspace name', () => {
    const w = walletCardOf(
      { id: 'c1', slug: 'mariam', theme: { accent: '#0f766e', lang: 'ar' }, vcardData: { fullName: 'Mariam', org: 'Director' }, brand: { name: 'Nile Studio' } },
      { appUrl: 'https://vertex.app/', p: 'sales key' },
    );
    expect(w).toMatchObject({ name: 'Mariam', title: 'Director', company: 'Nile Studio', accent: '#0f766e', lang: 'ar', serial: 'c1-sales key' });
    expect(w.url).toBe('https://vertex.app/c/mariam?p=sales%20key');
  });

  it('leaves the workspace out when the owner hid it', () => {
    const w = walletCardOf({ id: 'c1', slug: 's', theme: { brand: false }, vcardData: {}, brand: { name: 'Nile' } }, { appUrl: 'https://v.app' });
    expect(w.company).toBe('');
    expect(w.name).toBe('s');
    expect(w.accent).toBe('#2563eb');
  });

  it('picks readable text for the pass colour', () => {
    expect(rgb('#2563eb')).toBe('rgb(37, 99, 235)');
    expect(inkOn('#2563eb')).toBe('#ffffff');
    expect(inkOn('#fbbf24')).toBe('#17171a');
  });
});

describe('Apple Wallet', () => {
  it('is off until every credential is set', () => {
    expect(appleSignerFrom({})).toBeNull();
    expect(appleSignerFrom({ APPLE_PASS_TYPE_ID: 'pass.x', APPLE_TEAM_ID: 'T' })).toBeNull();
  });

  it('builds a pass whose code opens the card', () => {
    const json = passJson(card, { passTypeId: 'pass.app.vertex', teamId: 'TEAM123' });
    expect(json).toMatchObject({ passTypeIdentifier: 'pass.app.vertex', teamIdentifier: 'TEAM123', serialNumber: 'card1', organizationName: 'Vertex Build' });
    expect(json.barcodes[0]).toMatchObject({ format: 'PKBarcodeFormatQR', message: 'https://vertex.app/c/mariam' });
    expect(json.generic.primaryFields[0]!.value).toBe('Mariam Khaled');
    expect(json.generic.backFields.map((f) => f.key)).toEqual(['phone', 'email', 'card']);
  });

  it('signs a manifest of every file, and the signature checks out', () => {
    const passCert = selfSigned('Pass Type ID: pass.app.vertex');
    const wwdr = selfSigned('Apple WWDR');
    const signer = appleSignerFrom({
      APPLE_PASS_TYPE_ID: 'pass.app.vertex',
      APPLE_TEAM_ID: 'TEAM123',
      APPLE_PASS_CERT: Buffer.from(passCert.certPem).toString('base64'),
      APPLE_PASS_KEY: passCert.keyPem,
      APPLE_WWDR_CERT: wwdr.certPem,
    })!;
    const png = new Uint8Array([137, 80, 78, 71]);
    const files = unzipSync(buildPkpass(card, signer, { type: 'PNG', bytes: png }));

    expect(Object.keys(files).sort()).toEqual(
      ['icon.png', 'icon@2x.png', 'icon@3x.png', 'manifest.json', 'pass.json', 'signature', 'thumbnail.png', 'thumbnail@2x.png'].sort(),
    );
    const manifest = JSON.parse(Buffer.from(files['manifest.json']!).toString()) as Record<string, string>;
    for (const [name, hash] of Object.entries(manifest)) {
      expect(createHash('sha1').update(files[name]!).digest('hex')).toBe(hash);
    }

    // The same check a phone makes: the detached signature over manifest.json.
    const dir = mkdtempSync(join(tmpdir(), 'pkpass-'));
    writeFileSync(join(dir, 'manifest.json'), files['manifest.json']!);
    writeFileSync(join(dir, 'signature'), files['signature']!);
    writeFileSync(join(dir, 'ca.pem'), passCert.certPem);
    const out = execFileSync(
      'openssl',
      ['cms', '-verify', '-inform', 'DER', '-in', join(dir, 'signature'), '-content', join(dir, 'manifest.json'), '-binary', '-noverify', '-out', join(dir, 'out')],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    expect(out).toBeDefined();
  });

  it('leaves out a photo Wallet would not show', () => {
    const passCert = selfSigned('p');
    const signer = appleSignerFrom({ APPLE_PASS_TYPE_ID: 'p', APPLE_TEAM_ID: 't', APPLE_PASS_CERT: passCert.certPem, APPLE_PASS_KEY: passCert.keyPem, APPLE_WWDR_CERT: passCert.certPem })!;
    const files = unzipSync(buildPkpass(card, signer, { type: 'JPEG', bytes: new Uint8Array([1]) }));
    expect(files['thumbnail.png']).toBeUndefined();
  });
});

describe('Google Wallet', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
  const account = JSON.stringify({ client_email: 'wallet@proj.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });

  it('is off until the issuer and key are set', () => {
    expect(googleIssuerFrom({})).toBeNull();
    expect(googleIssuerFrom({ GOOGLE_WALLET_ISSUER_ID: '338' })).toBeNull();
  });

  it('reads the service account as JSON or base64', () => {
    expect(googleIssuerFrom({ GOOGLE_WALLET_ISSUER_ID: '338', GOOGLE_WALLET_SERVICE_ACCOUNT: account })?.clientEmail).toBe('wallet@proj.iam.gserviceaccount.com');
    expect(googleIssuerFrom({ GOOGLE_WALLET_ISSUER_ID: '338', GOOGLE_WALLET_SERVICE_ACCOUNT: Buffer.from(account).toString('base64') })?.issuerId).toBe('338');
  });

  it('gives a pass with safe ids and the card code', () => {
    const o = genericObject({ ...card, serial: 'c1-sales key' }, '338');
    expect(o.id).toBe('338.c1-sales_key');
    expect(o.classId).toBe('338.vertex_card');
    expect(o.barcode.value).toBe(card.url);
    expect(o.header.defaultValue.value).toBe('Mariam Khaled');
  });

  it('signs the save link so Google can check it', () => {
    const issuer = googleIssuerFrom({ GOOGLE_WALLET_ISSUER_ID: '338', GOOGLE_WALLET_SERVICE_ACCOUNT: account })!;
    const url = googleSaveUrl(card, issuer, 'https://vertex.app', 1_700_000_000_000);
    expect(url.startsWith('https://pay.google.com/gp/v/save/')).toBe(true);
    const [h, c, s] = url.split('/').pop()!.split('.');
    expect(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s!, 'base64url'))).toBe(true);
    const claims = JSON.parse(Buffer.from(c!, 'base64url').toString());
    expect(claims).toMatchObject({ iss: 'wallet@proj.iam.gserviceaccount.com', aud: 'google', typ: 'savetowallet', origins: ['https://vertex.app'] });
    expect(claims.payload.genericObjects[0].id).toBe('338.card1');
  });
});
