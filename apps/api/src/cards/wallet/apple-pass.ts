import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as forge from 'node-forge';
import { zipSync } from 'fflate';
import { WALLET_LABELS, inkOn, rgb, type WalletCard } from './wallet-card';

/**
 * Apple Wallet signing material. A pass is signed with a Pass Type ID
 * certificate from the owner's Apple Developer account, and carries Apple's
 * WWDR intermediate certificate so the phone can check it.
 */
export interface AppleSigner {
  passTypeId: string;
  teamId: string;
  cert: forge.pki.Certificate;
  key: forge.pki.PrivateKey;
  wwdr: forge.pki.Certificate;
}

/** A PEM value from the environment, given as the PEM itself or base64 of it. */
export function pemFrom(value: string): string {
  const v = value.trim();
  if (v.includes('-----BEGIN')) return v.replace(/\\n/g, '\n');
  return Buffer.from(v, 'base64').toString('utf8');
}

/** Reads the signer from the environment; null when Apple Wallet is not set up. */
export function appleSignerFrom(env: Record<string, string | undefined>): AppleSigner | null {
  const { APPLE_PASS_TYPE_ID, APPLE_TEAM_ID, APPLE_PASS_CERT, APPLE_PASS_KEY, APPLE_WWDR_CERT, APPLE_PASS_KEY_PASSPHRASE } = env;
  if (!APPLE_PASS_TYPE_ID || !APPLE_TEAM_ID || !APPLE_PASS_CERT || !APPLE_PASS_KEY || !APPLE_WWDR_CERT) return null;
  const keyPem = pemFrom(APPLE_PASS_KEY);
  const key = APPLE_PASS_KEY_PASSPHRASE
    ? forge.pki.decryptRsaPrivateKey(keyPem, APPLE_PASS_KEY_PASSPHRASE)
    : forge.pki.privateKeyFromPem(keyPem);
  if (!key) throw new Error('APPLE_PASS_KEY could not be read (wrong passphrase?)');
  return {
    passTypeId: APPLE_PASS_TYPE_ID,
    teamId: APPLE_TEAM_ID,
    cert: forge.pki.certificateFromPem(pemFrom(APPLE_PASS_CERT)),
    key,
    wwdr: forge.pki.certificateFromPem(pemFrom(APPLE_WWDR_CERT)),
  };
}

// The pass's icon ships with the API; a pass without one is refused.
const ASSETS = join(__dirname, '../../../assets/wallet');
let icons: Record<string, Uint8Array> | null = null;
function iconFiles(): Record<string, Uint8Array> {
  icons ??= Object.fromEntries(['icon.png', 'icon@2x.png', 'icon@3x.png'].map((f) => [f, new Uint8Array(readFileSync(join(ASSETS, f)))]));
  return icons;
}

/** The pass.json of a card: a generic pass whose code opens the card. */
export function passJson(card: WalletCard, signer: Pick<AppleSigner, 'passTypeId' | 'teamId'>) {
  const l = WALLET_LABELS[card.lang];
  const field = (key: string, label: string, value: string) => (value ? [{ key, label, value }] : []);
  return {
    formatVersion: 1,
    passTypeIdentifier: signer.passTypeId,
    teamIdentifier: signer.teamId,
    serialNumber: card.serial,
    organizationName: card.company || 'Vertex Connect',
    description: `${card.name} · ${l.description}`,
    logoText: card.company || undefined,
    backgroundColor: rgb(card.accent),
    foregroundColor: rgb(inkOn(card.accent)),
    labelColor: rgb(inkOn(card.accent)),
    generic: {
      primaryFields: [{ key: 'name', label: l.name, value: card.name }],
      secondaryFields: field('title', l.title, card.title),
      auxiliaryFields: [...field('company', l.company, card.company)],
      backFields: [
        ...field('phone', l.phone, card.phone),
        ...field('email', l.email, card.email),
        { key: 'card', label: l.card, value: card.url },
      ],
    },
    barcodes: [{ format: 'PKBarcodeFormatQR', message: card.url, messageEncoding: 'iso-8859-1', altText: card.url.replace(/^https?:\/\//, '') }],
  };
}

/** Signs the manifest as Apple asks: PKCS#7, detached, with the WWDR certificate. */
export function signManifest(manifest: Uint8Array, signer: Pick<AppleSigner, 'cert' | 'key' | 'wwdr'>, now = new Date()): Uint8Array {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(Buffer.from(manifest).toString('binary'));
  p7.addCertificate(signer.cert);
  p7.addCertificate(signer.wwdr);
  p7.addSigner({
    key: signer.key as forge.pki.rsa.PrivateKey,
    certificate: signer.cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: now as unknown as string },
    ],
  });
  p7.sign({ detached: true });
  return new Uint8Array(Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary'));
}

/**
 * The .pkpass file: pass.json, the icons and the photo (PNG only, which is
 * what Wallet shows), a manifest of their SHA-1 hashes, and its signature.
 */
export function buildPkpass(card: WalletCard, signer: AppleSigner, photo?: { type: 'PNG' | 'JPEG'; bytes: Uint8Array } | null): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'pass.json': new Uint8Array(Buffer.from(JSON.stringify(passJson(card, signer)))),
    ...iconFiles(),
  };
  if (photo?.type === 'PNG') {
    files['thumbnail.png'] = photo.bytes;
    files['thumbnail@2x.png'] = photo.bytes;
  }
  const manifest = Object.fromEntries(Object.entries(files).map(([name, data]) => [name, createHash('sha1').update(data).digest('hex')]));
  const manifestBytes = new Uint8Array(Buffer.from(JSON.stringify(manifest)));
  return zipSync({ ...files, 'manifest.json': manifestBytes, signature: signManifest(manifestBytes, signer) });
}
