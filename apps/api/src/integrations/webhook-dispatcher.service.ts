import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookService } from './webhook.service';
import { onWebhookQueued } from './webhook-queue';

/** A batch of deliveries sent per pass; a full one means more may be waiting. */
const BATCH = 25;
/** When the database cannot be read, the next look comes after this. */
const RETRY_MS = 5 * 60_000;

/**
 * Drives outbound webhook delivery. Work lives entirely in the database
 * (WebhookDelivery rows), so this is restart-safe: on boot it looks once for
 * whatever is due, and nothing is lost if the process dies mid-flight.
 *
 * It does not poll. A queued delivery rings it (webhook-queue) and it sends at
 * once; after each pass it sleeps until the next retry falls due, and when
 * nothing is waiting it sleeps until something is queued. The database is
 * billed for the time it is awake, and a poll every few seconds kept it awake
 * all day.
 *
 * This is a single-instance dispatcher. Running multiple API instances would
 * want a queue with row-level claim (SELECT … FOR UPDATE SKIP LOCKED) to avoid
 * double delivery; the `isRunning` guard only serialises passes within one
 * process.
 */
@Injectable()
export class WebhookDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDispatcher.name);
  private timer: NodeJS.Timeout | null = null;
  /** When the timer fires, so a nearer wake-up can replace it and a later one cannot. */
  private wakeAt = Infinity;
  private isRunning = false;
  /** Rung while a pass was running: look again when it ends. */
  private again = false;
  private stopListening: (() => void) | null = null;
  private readonly enabled: boolean;

  constructor(
    private readonly webhooks: WebhookService,
    config: ConfigService,
  ) {
    // Disabled under tests so the dispatcher never races the test's own DB writes.
    this.enabled = config.get('NODE_ENV') !== 'test';
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    this.stopListening = onWebhookQueued(() => this.wake(0));
    // Whatever was waiting when the process last stopped.
    this.wake(5_000);
    this.logger.log('Webhook dispatcher started (sends when a delivery is queued or due).');
  }

  onModuleDestroy(): void {
    this.stopListening?.();
    if (this.timer) clearTimeout(this.timer);
  }

  /** Runs a pass in `ms`, unless one is already set to run sooner. */
  private wake(ms: number): void {
    const at = Date.now() + Math.max(0, ms);
    if (this.timer && this.wakeAt <= at) return;
    if (this.timer) clearTimeout(this.timer);
    this.wakeAt = at;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.wakeAt = Infinity;
      void this.tick();
    }, at - Date.now());
    // Do not keep the process alive solely for the dispatcher.
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    if (this.isRunning) {
      this.again = true;
      return;
    }
    this.isRunning = true;
    try {
      let n: number;
      do {
        n = await this.webhooks.deliverDue(BATCH);
        if (n > 0) this.logger.debug(`Delivered/attempted ${n} webhook(s).`);
      } while (n === BATCH);
      // Sleep until the next retry, or until something is queued.
      const next = await this.webhooks.nextDueAt();
      if (next) this.wake(Math.max(1_000, next.getTime() - Date.now()));
    } catch (err) {
      this.logger.warn(`Webhook pass failed: ${(err as Error).message}`);
      this.wake(RETRY_MS);
    } finally {
      this.isRunning = false;
      if (this.again) {
        this.again = false;
        this.wake(0);
      }
    }
  }
}
