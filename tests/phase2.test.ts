import { describe, expect, it } from 'vitest';
import { planCart, rank, type CartItem } from '../lib/compare';
import { candidates, cleanCandidate } from '../lib/detect';
import { addPoint, nextSale, verdict } from '../lib/history';
import { sameGame } from '../lib/match';
import { parseKinguin } from '../lib/stores/kinguin';
import { DEFAULT_SETTINGS, type Game, type Offer, type Rates, type RawOffer } from '../lib/types';

const rates: Rates = { EUR: 0.9, DOP: 60, at: 0, fallback: false };
const game: Game = { appid: 367520, name: 'Hollow Knight', steamUSD: 14.99, isFree: false, isDlc: false };
const DAY = 86_400_000;

describe('Kinguin', () => {
  const d = { _embedded: { products: [
    { name: 'Hollow Knight PC Steam CD Key', externalId: '34325', price: { lowestOffer: 811 }, attributes: { platform: 2, urlKey: 'hollow-knight', region: { id: 3, activationCountries: ['DO', 'US'], excludedCountries: [] } } },
    { name: 'Hollow Knight PC Steam Account', externalId: '138430', price: { lowestOffer: 190 }, attributes: { platform: 2, region: { id: 3, activationCountries: ['DO'] } } },
    { name: 'Hollow Knight Steam Gift', externalId: '34326', price: { lowestOffer: 1000000 }, attributes: { platform: 2, region: { id: 3 } } },
    { name: 'Hollow Knight GOG CD Key', externalId: '62579', price: { lowestOffer: 975 }, attributes: { platform: 15, region: { id: 3 } } },
    { name: 'Hollow Knight PC Steam Altergift', externalId: '65044', price: { lowestOffer: 1287 }, attributes: { platform: 2, region: { id: 9, activationCountries: ['DE', 'FR'] } } },
  ] } };
  const o = parseKinguin(d, 'DO');
  it('solo Steam con oferta, y la región sale de la lista de países', () => {
    expect(o.map((x) => x.kind)).toEqual(['key', 'account', 'gift']);
    expect(o[0]).toMatchObject({ price: 8.11, currency: 'EUR', regionCheckedByStore: true, url: 'https://www.kinguin.net/category/34325/hollow-knight' });
    expect(o[2]).toMatchObject({ regionBlockedByStore: true });
  });
  it('los títulos de Kinguin emparejan', () => {
    expect(sameGame('Hollow Knight', 'Hollow Knight PC Steam CD Key')).toBe(true);
    expect(sameGame('Hollow Knight', 'Hollow Knight PC Steam Altergift')).toBe(true);
    expect(sameGame('Hollow Knight', 'Hollow Knight: Voidheart Edition PS4 Account')).toBe(false);
  });
  it('lo bloqueado por país queda como «no activa»', () => {
    const r = rank(game, o, rates, DEFAULT_SETTINGS);
    expect(r.find((x) => x.kind === 'gift')?.fit).toBe('no');
    expect(r[0].store).toBe('kinguin');
  });
});

describe('G: precio sospechoso y cupones', () => {
  const mk = (store: RawOffer['store'], price: number, url: string): RawOffer => ({ store, title: 'Hollow Knight Steam Key GLOBAL', kind: 'key', regions: ['global'], price, currency: 'USD', url });
  it('una clave de marketplace un 30 % por debajo de la mediana se marca y no sale primero', () => {
    const r = rank(game, [mk('eneba', 4, 'cheap'), mk('driffle', 10, 'b'), mk('kinguin', 10.5, 'c'), mk('eneba', 11, 'd')], rates, DEFAULT_SETTINGS);
    const sus = r.find((x) => x.url === 'cheap')!;
    expect(sus.suspicious).toBe(true);
    expect(sus.fit).toBe('warn');
    expect(r[0].url).not.toBe('cheap');
  });
  it('con dos ofertas no se marca nada', () => {
    const r = rank(game, [mk('eneba', 4, 'a'), mk('driffle', 10, 'b')], rates, DEFAULT_SETTINGS);
    expect(r.some((x) => x.suspicious)).toBe(false);
  });
  it('el cupón se resta antes de la comisión', () => {
    const r = rank(game, [mk('eneba', 10, 'a')], rates, DEFAULT_SETTINGS, [{ id: '1', store: 'eneba', code: 'EN10', pct: 10, checkedAt: 0 }]);
    expect(r[0].couponUSD).toBe(1);
    expect(r[0].feeUSD).toBe(0.84); // 5 % de 9 = 0.45 + 0.39
    expect(r[0].totalUSD).toBe(9.84);
    expect(r[0].coupon).toBe('EN10');
  });
  it('DLC y juego base no se mezclan', () => {
    const dlc = { ...mk('eneba', 3, 'dlc'), dlc: true };
    expect(rank(game, [dlc], rates, DEFAULT_SETTINGS)).toHaveLength(0);
    expect(rank({ ...game, isDlc: true }, [dlc], rates, DEFAULT_SETTINGS)).toHaveLength(1);
  });
});

describe('D: historial y veredicto', () => {
  it('junta los puntos de la misma ventana de 6 h guardando el más bajo', () => {
    let h = addPoint([], { t: 0, steam: 15, best: 9 });
    h = addPoint(h, { t: 3_600_000, steam: 15, best: 8.5 });
    h = addPoint(h, { t: 7 * 3_600_000, steam: 15, best: 9.2 });
    expect(h).toHaveLength(2);
    expect(h[0].best).toBe(8.5);
  });
  it('próximas rebajas', () => {
    expect(nextSale(Date.UTC(2026, 10, 3))).toEqual({ name: 'Rebajas de invierno', days: 45 });
    expect(nextSale(Date.UTC(2026, 11, 20)).name).toBe('Rebajas de primavera');
  });
  it('compra si es el mínimo de un historial largo', () => {
    const now = Date.UTC(2026, 6, 1);
    const h = [30, 20, 10, 5].map((d, i) => ({ t: now - d * DAY, steam: 15, best: 10 + i }));
    expect(verdict(h, 9.9, 0, now).kind).toBe('buy');
  });
  it('espera si vienen rebajas y hoy está por encima del mínimo', () => {
    const now = Date.UTC(2026, 10, 10);
    const h = [40, 30, 20, 2].map((d) => ({ t: now - d * DAY, steam: 15, best: 8 }));
    const v = verdict(h, 11, 0, now);
    expect(v.kind).toBe('wait');
    expect(v.detail).toContain('invierno');
  });
  it('sin historial no inventa un mínimo', () => {
    expect(verdict([], 10, 0, Date.UTC(2026, 7, 1)).title).toBe('Historial en marcha');
  });
  it('una rebaja fuerte en Steam es buen momento', () => {
    expect(verdict([], 7, 60, Date.UTC(2026, 7, 1)).kind).toBe('buy');
  });
});

describe('F: carrito', () => {
  const off = (store: Offer['store'], price: number): Offer => ({ store, title: '', kind: 'key', regions: ['global'], price, currency: 'USD', url: store, priceUSD: price, couponUSD: 0, feeUSD: 0, totalUSD: price, fit: 'ok', fitText: '' });
  it('junta pedidos en la tienda con comisión fija por pedido cuando sale más barato', () => {
    const items: CartItem[] = [
      { appid: 1, name: 'A', steamUSD: 20, offers: [off('eneba', 8), off('kinguin', 7.9)] },
      { appid: 2, name: 'B', steamUSD: 20, offers: [off('eneba', 8), off('kinguin', 7.9)] },
    ];
    const p = planCart(items, 'card');
    // Eneba: 16 + 5 % + 0.39 una vez = 17.19; Kinguin: 15.8 + 6 % + 0.5 = 17.25; mezclar paga dos fijos.
    expect(p.picks.map((x) => x.store)).toEqual(['eneba', 'eneba']);
    expect(p.totalUSD).toBe(17.19);
    expect(p.steamUSD).toBe(40);
    expect(p.separateUSD).toBeGreaterThanOrEqual(p.totalUSD);
  });
  it('si Steam es más barato, se queda en Steam', () => {
    const p = planCart([{ appid: 1, name: 'A', steamUSD: 5, offers: [off('eneba', 6)] }], 'card');
    expect(p.picks[0].store).toBe('steam');
  });
});

describe('ediciones entre paréntesis', () => {
  it('la edición entre paréntesis cuenta; la plataforma y la región no', () => {
    expect(sameGame('Hollow Knight', 'Hollow Knight (Definitive Edition) Steam Key GLOBAL')).toBe(false);
    expect(sameGame('Hollow Knight', 'Hollow Knight (Global) (PC / Mac) - Steam Gift')).toBe(true);
    expect(sameGame('Hollow Knight', 'Hollow Knight [PC] Steam Key')).toBe(true);
    expect(sameGame('Hades', 'Hades (Soundtrack) Steam Key')).toBe(false);
  });
});

describe('C: nombres sacados de páginas', () => {
  it('limpia títulos de vídeos y páginas', () => {
    expect(cleanCandidate('Hollow Knight: Silksong - Official Launch Trailer')).toBe('Hollow Knight: Silksong');
    expect(cleanCandidate('ELDEN RING - Gameplay Reveal (4K)')).toBe('ELDEN RING');
    expect(cleanCandidate('Hades - YouTube')).toBe('Hades');
    expect(cleanCandidate('Baldur\'s Gate 3 Review | IGN')).toBe('Baldur\'s Gate 3');
  });
});

describe('C: solo páginas de videojuegos', () => {
  const fakeDoc = (title: string, infobox = '', ld = '') => ({
    title,
    querySelectorAll: (sel: string) => (sel.includes('ld+json') && ld ? [{ textContent: ld }] : []),
    querySelector: (sel: string) => (sel === '.infobox' && infobox ? { textContent: infobox } : null),
  }) as unknown as Document;
  it('el título de una página cualquiera no sale del navegador', () => {
    expect(candidates(fakeDoc('Pago de factura - david@x.com - Gmail'), 'https://mail.google.com/mail/u/0/')).toEqual([]);
    expect(candidates(fakeDoc('Hollow Knight - Mi banco'), 'https://banco.example.com/')).toEqual([]);
  });
  it('Wikipedia: solo fichas de videojuego', () => {
    expect(candidates(fakeDoc('Hollow Knight - Wikipedia', 'Developer(s) Team Cherry Publisher(s) Team Cherry Platform(s) Windows'), 'https://en.wikipedia.org/wiki/Hollow_Knight')).toEqual(['Hollow Knight']);
    expect(candidates(fakeDoc('Rust (programming language) - Wikipedia', 'Paradigm Multi-paradigm Developer Rust Team'), 'https://en.wikipedia.org/wiki/Rust_(programming_language)')).toEqual([]);
  });
  it('webs de juegos y datos VideoGame sí', () => {
    expect(candidates(fakeDoc('Hades Review - IGN'), 'https://www.ign.com/articles/hades-review')).toContain('Hades');
    expect(candidates(fakeDoc('Cualquier cosa', '', JSON.stringify({ '@type': 'VideoGame', name: 'Celeste' })), 'https://blog.example.com/')).toEqual(['Celeste']);
  });
});

describe('F: «por separado» honesto', () => {
  it('con un solo juego no hay ahorro por agrupar', () => {
    const o = (store: Offer['store'], price: number): Offer => ({ store, title: '', kind: 'key', regions: ['global'], price, currency: 'USD', url: store, priceUSD: price, couponUSD: 0, feeUSD: 0, totalUSD: price, fit: 'ok', fitText: '' });
    const p = planCart([{ appid: 1, name: 'A', steamUSD: 20, offers: [o('kinguin', 9.6), o('ig', 10)] }], 'card');
    expect(p.totalUSD).toBe(10);
    expect(p.separateUSD).toBe(10);
  });
});
