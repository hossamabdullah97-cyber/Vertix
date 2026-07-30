import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookService } from './webhook.service';

/**
 * Drives outbound webhook delivery on an interval. Work lives entirely in the
 * database (WebhookDelivery rows), so this is restart-safe: on boot it simply
 * resumes picking up whatever is due — nothing is held in memory, no event is
 * lost if the process dies mid-flight.
 *
 * This is a single-instance poller. Running multiple API instances would want a
 * queue with row-level claim (SELECT … FOR UPDATE SKIP LOCKED) to avoid double
 * delivery; the `isRunning` guard only serialises ticks within one process.
 */
@Injectable()
export class WebhookDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDispatcher.name);
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly intervalMs: number;
  private readonly enabled: boolean;

  constructor(
    private readonly webhooks: WebhookService,
    config: ConfigService,
  ) {
    this.intervalMs = Number(config.get('WEBHOOK_POLL_MS')) || 15_000;
    // Disabled under tests so a poller never races the test's own DB writes.
    this.enabled = config.get('NODE_ENV') !== 'test';
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    // Do not keep the process alive solely for the poller.
    this.timer.unref?.();
    this.logger.log(`Webhook dispatcher started (every ${this.intervalMs}ms).`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.isRunning) return; // never overlap ticks
    this.isRunning = true;
    try {
      const n = await this.webhooks.deliverDue();
      if (n > 0) this.logger.debug(`Delivered/attempted ${n} webhook(s).`);
    } catch (err) {
      this.logger.warn(`Webhook tick failed: ${(err as Error).message}`);
    } finally {
      this.isRunning = false;
    }
  }
}
