import { ActionsService } from './actions.service';
import { SectionsService } from './sections.service';

/**
 * A button or section added to a card goes after the last one in the same
 * profile. Every new one used to get order 0, so cards showed them in
 * whatever order the database happened to return.
 */
describe('new buttons and sections go at the end', () => {
  const tenant = { orgId: 'o1', userId: 'u1', role: 'OWNER' } as never;
  const cards = { ensureEditable: jest.fn().mockResolvedValue(undefined) };

  function prisma(model: 'cardAction' | 'cardSection', max: number | null) {
    const create = jest.fn(async ({ data }) => data);
    const aggregate = jest.fn().mockResolvedValue({ _max: { order: max } });
    return { db: { client: { [model]: { create, aggregate } } }, create, aggregate };
  }

  it('after the last button, in the same profile', async () => {
    const { db, create, aggregate } = prisma('cardAction', 3);
    await new ActionsService(db as never, cards as never).create(tenant, 'c1', { type: 'WEBSITE', config: { url: 'x.example' } } as never);
    expect(aggregate).toHaveBeenCalledWith({ where: { cardId: 'c1', variantId: null }, _max: { order: true } });
    expect(create.mock.calls[0][0].data.order).toBe(4);
  });

  it('first when there is none, and where it was asked for when it says', async () => {
    const { db, create } = prisma('cardSection', null);
    const svc = new SectionsService(db as never, cards as never);
    await svc.create(tenant, 'c1', { type: 'BIO', content: {} } as never, 'v1');
    expect(create.mock.calls[0][0].data).toMatchObject({ order: 0, variantId: 'v1' });
    await svc.create(tenant, 'c1', { type: 'BIO', content: {}, order: 7 } as never);
    expect(create.mock.calls[1][0].data.order).toBe(7);
  });
});
