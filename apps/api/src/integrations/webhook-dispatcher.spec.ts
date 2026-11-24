import { WebhookDispatcher } from './webhook-dispatcher.service';
import { webhookQueued } from './webhook-queue';

/** A dispatcher over a fake WebhookService, outside test mode so it runs. */
function setup(nextDue: () => Date | null = () => null) {
  const webhooks = {
    deliverDue: jest.fn().mockResolvedValue(0),
    nextDueAt: jest.fn().mockImplementation(async () => nextDue()),
  };
  const config = { get: (k: string) => (k === 'NODE_ENV' ? 'production' : undefined) };
  const dispatcher = new WebhookDispatcher(webhooks as never, config as never);
  return { dispatcher, webhooks };
}

/** Lets the pass's awaited calls settle. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('WebhookDispatcher', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('looks once at start for what was waiting, then leaves the database alone while nothing is', async () => {
    const { dispatcher, webhooks } = setup();
    dispatcher.onModuleInit();
    await jest.advanceTimersByTimeAsync(5_000);
    await settle();
    expect(webhooks.deliverDue).toHaveBeenCalledTimes(1);
    // A whole day with nothing queued: not a single query.
    await jest.advanceTimersByTimeAsync(24 * 60 * 60_000);
    expect(webhooks.deliverDue).toHaveBeenCalledTimes(1);
    expect(webhooks.nextDueAt).toHaveBeenCalledTimes(1);
    dispatcher.onModuleDestroy();
  });

  it('sends as soon as a delivery is queued', async () => {
    const { dispatcher, webhooks } = setup();
    dispatcher.onModuleInit();
    await jest.advanceTimersByTimeAsync(5_000);
    webhooks.deliverDue.mockClear();
    webhookQueued();
    await jest.advanceTimersByTimeAsync(0);
    await settle();
    expect(webhooks.deliverDue).toHaveBeenCalledTimes(1);
    dispatcher.onModuleDestroy();
  });

  it('wakes when a retry falls due, and not before', async () => {
    const start = Date.now();
    let due: Date | null = new Date(start + 5_000 + 10 * 60_000);
    const { dispatcher, webhooks } = setup(() => due);
    dispatcher.onModuleInit();
    await jest.advanceTimersByTimeAsync(5_000);
    await settle();
    expect(webhooks.deliverDue).toHaveBeenCalledTimes(1);
    due = null;
    await jest.advanceTimersByTimeAsync(9 * 60_000);
    expect(webhooks.deliverDue).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(60_000);
    await settle();
    expect(webhooks.deliverDue).toHaveBeenCalledTimes(2);
    dispatcher.onModuleDestroy();
  });

  it('keeps sending while full batches come back', async () => {
    const { dispatcher, webhooks } = setup();
    webhooks.deliverDue.mockResolvedValueOnce(25).mockResolvedValueOnce(25).mockResolvedValue(3);
    dispatcher.onModuleInit();
    await jest.advanceTimersByTimeAsync(5_000);
    await settle();
    expect(webhooks.deliverDue).toHaveBeenCalledTimes(3);
    dispatcher.onModuleDestroy();
  });
});
