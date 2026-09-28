import { CardsService, mergeTheme } from './cards.service';

/**
 * Several editors write parts of one theme object. None may erase what the
 * others wrote: the Design tab once dropped the card's language this way.
 */
describe('mergeTheme', () => {
  it('lays the new keys over the stored ones and keeps the rest', () => {
    expect(mergeTheme({ accent: '#111', lang: 'ar', links: 'icons' }, { accent: '#222' })).toEqual({
      accent: '#222',
      lang: 'ar',
      links: 'icons',
    });
  });

  it('treats a missing or malformed side as empty', () => {
    expect(mergeTheme(null, { accent: '#222' })).toEqual({ accent: '#222' });
    expect(mergeTheme({ accent: '#111' }, undefined)).toEqual({ accent: '#111' });
    expect(mergeTheme(['x'], 'nope')).toEqual({});
  });
});

describe('CardsService.update', () => {
  function service(stored: Record<string, unknown>) {
    const update = jest.fn(async ({ data }) => ({ id: 'c1', ...data }));
    const prisma = {
      client: {
        card: {
          findFirst: jest.fn().mockResolvedValue({ id: 'c1', ownerId: 'u1', theme: stored }),
          update,
        },
      },
    };
    return { svc: new CardsService(prisma as never, {} as never), update };
  }
  const owner = { orgId: 'o1', userId: 'u1', role: 'EMPLOYEE' } as never;

  it('keeps theme keys the request did not name', async () => {
    const { svc, update } = service({ accent: '#111', mode: 'light', lang: 'ar', links: 'buttons', openInApp: true });
    await svc.update(owner, 'c1', { theme: { accent: '#222', mode: 'dark', cover: 'solid', lang: 'ar' } });
    expect(update.mock.calls[0][0].data.theme).toEqual({
      accent: '#222',
      mode: 'dark',
      cover: 'solid',
      lang: 'ar',
      links: 'buttons',
      openInApp: true,
    });
  });

  it('leaves the theme alone when the request does not touch it', async () => {
    const { svc, update } = service({ accent: '#111' });
    await svc.update(owner, 'c1', { isPublished: true });
    expect(update.mock.calls[0][0].data).toEqual({ isPublished: true });
  });
});
