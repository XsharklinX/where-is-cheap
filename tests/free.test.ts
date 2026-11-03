import { describe, expect, it } from 'vitest';
import { parseEpic, parseSteamFree } from '../lib/free';

const epic = (o: { title: string; slug: string; start: string; end: string }, upcoming = false) => ({
  title: o.title, productSlug: o.slug, offerType: 'BASE_GAME',
  keyImages: [{ type: 'Thumbnail', url: `https://img/${o.slug}.png` }],
  promotions: { promotionalOffers: upcoming ? [] : [{ promotionalOffers: [{ startDate: o.start, endDate: o.end }] }] },
});

describe('juegos gratis (1.3, fase D, idea 7)', () => {
  const now = Date.UTC(2026, 10, 3);
  const json = (els: any[]) => ({ data: { Catalog: { searchStore: { elements: els } } } });

  it('Epic: los que están gratis ahora, con su enlace y hasta cuándo', () => {
    const out = parseEpic(json([
      epic({ title: 'Ahora gratis', slug: 'ahora', start: '2026-10-29T16:00:00Z', end: '2026-11-05T16:00:00Z' }),
      epic({ title: 'Ya pasó', slug: 'paso', start: '2026-10-01T16:00:00Z', end: '2026-10-08T16:00:00Z' }),
    ]), now);
    expect(out.map((g) => g.name)).toEqual(['Ahora gratis']);
    expect(out[0].url).toBe('https://store.epicgames.com/es-ES/p/ahora');
    expect(out[0].store).toBe('epic');
    expect(out[0].until).toBe(Date.parse('2026-11-05T16:00:00Z'));
  });
  it('Epic: lo próximo (upcoming) no cuenta, ni los DLC', () => {
    expect(parseEpic(json([epic({ title: 'Próximo', slug: 'prox', start: '2026-11-05T16:00:00Z', end: '2026-11-12T16:00:00Z' }, true)]), now)).toEqual([]);
    const dlc = { ...epic({ title: 'DLC gratis', slug: 'dlc', start: '2026-10-29T16:00:00Z', end: '2026-11-05T16:00:00Z' }), offerType: 'DLC' };
    expect(parseEpic(json([dlc]), now)).toEqual([]);
  });
  it('Steam: gratis para quedártelos, con su appid', () => {
    expect(parseSteamFree({ items: [{ name: 'Free Game', id: 123, logo: 'https://img/123.jpg' }] }))
      .toEqual([{ name: 'Free Game', url: 'https://store.steampowered.com/app/123/', img: 'https://img/123.jpg', store: 'steam', until: null, appid: 123 }]);
  });
});
