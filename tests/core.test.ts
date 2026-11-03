import { describe, expect, it } from 'vitest';
import { rank, savings } from '../lib/compare';
import { cleanOfferTitle, sameGame } from '../lib/match';
import { regionFit } from '../lib/region';
import { parseEnebaHtml } from '../lib/stores/eneba';
import { DEFAULT_SETTINGS, type Game, type Rates, type RawOffer } from '../lib/types';

describe('emparejado de títulos (títulos reales de las tiendas)', () => {
  it('limpia plataforma, región y tipo', () => {
    expect(cleanOfferTitle('Hades (Global) (PC / Mac) - Steam Gift')).toBe('hades');
    expect(cleanOfferTitle('Hadean Tactics: Deluxe Edition Steam Key (PC) GLOBAL')).toBe('hadean tactics deluxe edition');
    expect(cleanOfferTitle('Dark Souls 3: The Fire Fades Edition Steam Key EUROPE')).toBe('dark souls 3 the fire fades edition');
  });
  it('mismo juego', () => {
    expect(sameGame('Hades', 'Hades (Global) (PC / Mac) - Steam Account')).toBe(true);
    expect(sameGame('Hades', 'Hades')).toBe(true);
    expect(sameGame('DARK SOULS™ III: The Fire Fades™ Edition', 'Dark Souls 3: The Fire Fades Edition Steam Key GLOBAL')).toBe(true);
    expect(sameGame('Hades II', 'Hades 2 Steam Key GLOBAL')).toBe(true);
  });
  it('rechaza secuelas, ediciones y juegos parecidos', () => {
    expect(sameGame('Hades', 'Hades II (Global) (PC) - Steam Gift')).toBe(false);
    expect(sameGame('Hades', 'Hadean Tactics Steam Key GLOBAL')).toBe(false);
    expect(sameGame('Hadean Tactics', 'Hadean Tactics: Deluxe Edition Steam Key (PC) GLOBAL')).toBe(false);
    expect(sameGame('Warhammer Underworlds', 'Warhammer Underworlds - Shadespire Edition  (PC) Steam Key GLOBAL')).toBe(false);
  });
  it('la edición estándar cuenta como el juego base', () => {
    expect(sameGame('Elden Ring', 'ELDEN RING Standard Edition Steam Key GLOBAL')).toBe(true);
  });
});

describe('región para una cuenta de RD', () => {
  it('global y LATAM activan, Europa y EE. UU. no', () => {
    expect(regionFit({ regions: ['global'], kind: 'key' }).fit).toBe('ok');
    expect(regionFit({ regions: ['latam'], kind: 'key' }).fit).toBe('ok');
    expect(regionFit({ regions: ['Europe'], kind: 'gift' }).fit).toBe('no');
    expect(regionFit({ regions: ['united_states'], kind: 'key' }).fit).toBe('no');
  });
  it('las cuentas avisan aunque sean globales', () => {
    expect(regionFit({ regions: ['Global'], kind: 'account' }).fit).toBe('warn');
  });
  it('sin región, aviso', () => {
    expect(regionFit({ regions: [], kind: 'key' }).fit).toBe('warn');
  });
});

describe('orden por precio final', () => {
  const game: Game = { appid: 1145360, name: 'Hades', steamUSD: 24.99, isFree: false };
  const rates: Rates = { EUR: 0.9, DOP: 60, at: 0, fallback: false };
  const raw: RawOffer[] = [
    { store: 'driffle', title: 'Hades (Europe) (PC / Mac) - Steam Gift', kind: 'gift', regions: ['Europe'], price: 9, currency: 'EUR', url: 'd1' },
    { store: 'driffle', title: 'Hades (Global) (PC / Mac) - Steam Account', kind: 'account', regions: ['Global'], price: 1.09, currency: 'EUR', url: 'd2' },
    { store: 'eneba', title: 'Hades Steam Key GLOBAL', kind: 'key', regions: ['global'], price: 12.47, currency: 'USD', url: 'e1' },
    { store: 'eneba', title: 'Hades Steam Key GLOBAL', kind: 'key', regions: ['global'], price: 13.5, currency: 'USD', url: 'e2' },
    { store: 'ig', title: 'Hades', kind: 'key', regions: ['worldwide'], regionCheckedByStore: true, price: 11.88, currency: 'EUR', url: 'i1' },
    { store: 'ig', title: 'Hades II', kind: 'key', regions: ['worldwide'], regionCheckedByStore: true, price: 5, currency: 'EUR', url: 'i2' },
  ];

  it('convierte EUR, suma comisiones, quita secuelas y cuentas, y deja lo que no activa al final', () => {
    const o = rank(game, raw, rates, DEFAULT_SETTINGS);
    expect(o.map((x) => x.url)).toEqual(['i1', 'e1', 'd1']);
    expect(o[0].totalUSD).toBe(13.2); // 11.88 € / 0.9, sin comisión
    expect(o[1].totalUSD).toBe(13.48); // 12.47 + 5 % + 0.39 = 12.47 + 1.01
    expect(o[2].fit).toBe('no');
  });

  it('con PayPal la comisión sube', () => {
    const o = rank(game, raw, rates, { ...DEFAULT_SETTINGS, pay: 'paypal' });
    expect(o[1].feeUSD).toBe(1.26); // 7 % de 12.47 = 0.87 + 0.39
  });

  it('las cuentas solo salen si se piden, y nunca primero', () => {
    const o = rank(game, raw, rates, { ...DEFAULT_SETTINGS, accounts: true });
    expect(o.find((x) => x.url === 'd2')?.fit).toBe('warn');
    expect(o[0].url).toBe('i1');
  });

  it('sin marketplaces solo queda Instant Gaming', () => {
    const o = rank(game, raw, rates, { ...DEFAULT_SETTINGS, marketplaces: false });
    expect(o.map((x) => x.store)).toEqual(['ig']);
  });

  it('ahorro frente a Steam', () => {
    const offers = rank(game, raw, rates, DEFAULT_SETTINGS);
    expect(savings({ game, offers })).toEqual({ usd: 11.79, pct: 47 });
    expect(savings({ game: { ...game, steamUSD: 10 }, offers })).toBeNull();
  });
});

describe('página de Eneba', () => {
  it('lee el estado de Algolia y se queda con lo de Steam en stock', () => {
    const state = {
      responses: {
        q: {
          results: [{
            hits: [
              { drmName: 'steam', productType: 'game', stockAvailable: true, productRegions: ['global'], lowestPrice: { USD: 1247 }, slug: 'steam-hades-steam-key-global', translations: { en_US: { name: 'Hades Steam Key GLOBAL' } } },
              { drmName: 'xbox', productType: 'game', stockAvailable: true, productRegions: ['argentina'], lowestPrice: { USD: 869 }, slug: 'x', translations: { en_US: { name: 'Hades XBOX LIVE Key ARGENTINA' } } },
              { drmName: 'steam', productType: 'game', stockAvailable: false, productRegions: ['global'], slug: 'y', translations: { en_US: { name: 'Hades Steam Gift GLOBAL' } } },
            ],
          }],
        },
      },
    };
    const html = `<html><script id="__ALGOLIA_STATE__" type="application/json">${JSON.stringify(state)}</script></html>`;
    const o = parseEnebaHtml(html);
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ price: 12.47, currency: 'USD', kind: 'key', url: 'https://www.eneba.com/steam-hades-steam-key-global' });
  });
  it('si cambia la página, falla en claro', () => {
    expect(() => parseEnebaHtml('<html></html>')).toThrow('Eneba cambió su página');
  });
});
