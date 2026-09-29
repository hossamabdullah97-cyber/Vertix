import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { appleSignerFrom, buildPkpass, type AppleSigner } from './apple-pass';
import { googleIssuerFrom, googleSaveUrl, type GoogleIssuer } from './google-pass';
import type { WalletCard } from './wallet-card';

/**
 * Apple and Google Wallet passes for public cards. Each is off until its
 * credentials are set (see .env.example), and the card only offers the ones
 * that are on. Credentials that cannot be read turn that wallet off, loudly,
 * rather than failing the card.
 */
@Injectable()
export class WalletService {
  private readonly log = new Logger(WalletService.name);
  private readonly apple: AppleSigner | null;
  private readonly google: GoogleIssuer | null;

  constructor(config: ConfigService) {
    const env = (k: string) => config.get<string>(k);
    const keys = ['APPLE_PASS_TYPE_ID', 'APPLE_TEAM_ID', 'APPLE_PASS_CERT', 'APPLE_PASS_KEY', 'APPLE_PASS_KEY_PASSPHRASE', 'APPLE_WWDR_CERT', 'GOOGLE_WALLET_ISSUER_ID', 'GOOGLE_WALLET_SERVICE_ACCOUNT'];
    const values = Object.fromEntries(keys.map((k) => [k, env(k)]));
    this.apple = this.read('Apple Wallet', () => appleSignerFrom(values));
    this.google = this.read('Google Wallet', () => googleIssuerFrom(values));
  }

  private read<T>(name: string, fn: () => T | null): T | null {
    try {
      return fn();
    } catch (err) {
      this.log.error(`${name} is off: its credentials could not be read (${(err as Error).message})`);
      return null;
    }
  }

  /** Which wallets a card may offer. */
  available() {
    return { apple: this.apple !== null, google: this.google !== null };
  }

  applePass(card: WalletCard, photo?: { type: 'PNG' | 'JPEG'; bytes: Uint8Array } | null): Uint8Array | null {
    return this.apple ? buildPkpass(card, this.apple, photo) : null;
  }

  googleUrl(card: WalletCard, origin: string): string | null {
    return this.google ? googleSaveUrl(card, this.google, origin) : null;
  }
}
