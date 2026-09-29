import { createSign } from 'node:crypto';
import { WALLET_LABELS, type WalletCard } from './wallet-card';

/** A Google Wallet issuer and the service account that signs its passes. */
export interface GoogleIssuer {
  issuerId: string;
  clientEmail: string;
  privateKey: string;
}

/**
 * Reads the issuer from the environment; null when Google Wallet is not set
 * up. The service account key is its JSON file, raw or base64.
 */
export function googleIssuerFrom(env: Record<string, string | undefined>): GoogleIssuer | null {
  const { GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_SERVICE_ACCOUNT } = env;
  if (!GOOGLE_WALLET_ISSUER_ID || !GOOGLE_WALLET_SERVICE_ACCOUNT) return null;
  const raw = GOOGLE_WALLET_SERVICE_ACCOUNT.trim();
  const json = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')) as { client_email?: string; private_key?: string };
  if (!json.client_email || !json.private_key) throw new Error('GOOGLE_WALLET_SERVICE_ACCOUNT has no client_email or private_key');
  return { issuerId: GOOGLE_WALLET_ISSUER_ID, clientEmail: json.client_email, privateKey: json.private_key };
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url');

/** Google ids take letters, digits, dots, dashes and underscores only. */
const idPart = (v: string) => v.replace(/[^\w.-]/g, '_');

/** The pass: a generic card with the name, title and company, and a code to the card. */
export function genericObject(card: WalletCard, issuerId: string) {
  const l = WALLET_LABELS[card.lang];
  const text = (value: string) => ({ defaultValue: { language: card.lang, value } });
  return {
    id: `${issuerId}.${idPart(card.serial)}`,
    classId: `${issuerId}.vertex_card`,
    state: 'ACTIVE',
    cardTitle: text(card.company || 'Vertex Connect'),
    header: text(card.name),
    ...(card.title ? { subheader: text(card.title) } : {}),
    hexBackgroundColor: card.accent,
    barcode: { type: 'QR_CODE', value: card.url, alternateText: card.url.replace(/^https?:\/\//, '') },
    textModulesData: [
      ...(card.phone ? [{ id: 'phone', header: l.phone, body: card.phone }] : []),
      ...(card.email ? [{ id: 'email', header: l.email, body: card.email }] : []),
    ],
    linksModuleData: { uris: [{ id: 'card', uri: card.url, description: l.card }] },
    ...(card.avatar && /^https:\/\//.test(card.avatar) ? { logo: { sourceUri: { uri: card.avatar } } } : {}),
  };
}

/**
 * The "Save to Google Wallet" link: a signed JWT that carries the pass (and
 * its class), so nothing has to be created ahead of time with Google.
 */
export function googleSaveUrl(card: WalletCard, issuer: GoogleIssuer, origin: string, now = Date.now()): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: issuer.clientEmail,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(now / 1000),
    origins: [origin],
    payload: {
      genericClasses: [{ id: `${issuer.issuerId}.vertex_card` }],
      genericObjects: [genericObject(card, issuer.issuerId)],
    },
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(issuer.privateKey);
  return `https://pay.google.com/gp/v/save/${unsigned}.${b64url(signature)}`;
}
