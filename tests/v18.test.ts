import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('browser', { runtime: { getURL: (p: string) => p, sendMessage: async () => null }, storage: { local: { get: async () => ({}), set: async () => {} } } });

const { giftTop, waitHTML } = await import('../lib/box');
const { giftScope, groupStores, tableHTML } = await import('../lib/block');
const { rank } = await import('../lib/compare');
const { DEFAULT_SETTINGS } = await import('../lib/types');

const DAY = 86_400_000;
// 2026-11-05: las rebajas de otoño empiezan el 24 de noviembre.
const NOW = new Date('2026-11-05T15:00:00').getTime();
const S = { ...DEFAULT_SETTINGS, currency: 'usd' as const };
const game = { appid: 1, name: 'Crimson Desert', steamUSD: 69.99, isFree: false };
const rates = { EUR: 1, DOP: 60, at: 0, fallback: false };
const raw = [
  { store: 'ig', title: 'Crimson Desert', kind: 'key', regions: ['latam'], regionCheckedByStore: true, price: 25.83, currency: 'USD', url: 'ig' },
  { store: 'eneba', title: 'Crimson Desert Steam Key LATAM', kind: 'key', regions: ['latam'], price: 39.14, currency: 'USD', url: 'en' },
  { store: 'kinguin', title: 'Crimson Desert Steam Gift GLOBAL', kind: 'gift', regions: ['global'], price: 66, currency: 'USD', url: 'kg' },
  { store: 'driffle', title: 'Crimson Desert Steam Key EUROPE', kind: 'key', regions: ['europe'], price: 20, currency: 'USD', url: 'dr' },
] as any;

function cmp(extra: Record<string, unknown> = {}) {
  const offers = rank(game, raw, rates, S, [], undefined, NOW);
  return { game, offers, failed: [], rates, pay: 'card', at: NOW, history: [], verdict: { kind: 'buy', title: 'Compra', detail: '' }, owned: false, ownsBase: null, pending: [], feesChecked: {}, ...extra } as any;
}

describe('1.8 (2): «¿Activa en RD?» en cada fila', () => {
  it('dice si activa y la región en pequeño; lo que no activa sigue plegado', () => {
    const html = tableHTML(cmp(), S, { open: true, showNo: false, chart: false, editions: [] });
    expect(html).toContain('¿Activa en RD?');
    expect(html).toContain('✓ Activa en RD');
    expect(html).toContain('Clave para tu país');
    expect(html).toContain('Clave LATAM, incluye RD');
    expect(html).toContain('Regalo global');
    expect(html).not.toContain('Clave Europa');
    expect(html).toContain('1 oferta no activa en RD');
  });
});

describe('1.8 (5): ya lo tienes, para regalar', () => {
  it('lo que vale en cualquier país va primero, luego la región y al final tu país', () => {
    const c = cmp({ owned: true });
    expect(c.offers.filter((o: any) => o.fit === 'ok').map(giftScope)).toEqual([2, 1, 0]);
    expect(groupStores(c.offers, true).groups.map((g) => g.store)).toEqual(['kinguin', 'eneba', 'ig']);
    expect(giftTop(c)?.store).toBe('kinguin');
    const html = tableHTML(c, S, { open: true, showNo: false, chart: false, editions: [] });
    expect(html).toContain('Para quién');
    expect(html).toContain('Cualquier país');
    expect(html).toContain('Solo si tu amigo es de RD');
    expect(html).toContain('Solo LATAM');
    expect(html).not.toContain('incluye RD');
    expect(html).toContain('Una clave se regala mandando el código');
  });
  it('sin regalar, el orden sigue siendo por precio', () => {
    expect(groupStores(cmp().offers).groups.map((g) => g.store)).toEqual(['ig', 'eneba', 'kinguin']);
  });
});

describe('1.8 (6): un método de pago por tienda', async () => {
  const { cleanPayBy, mergeFees, payFor, payMixed } = await import('../lib/fees');
  const { planCart } = await import('../lib/compare');
  it('cada tienda paga su comisión con su forma de pago; sin la suya, la general', () => {
    const card = rank(game, raw, rates, S, [], undefined, NOW);
    const mix = rank(game, raw, rates, { ...S, payBy: { eneba: 'paypal' } }, [], undefined, NOW);
    const fee = (l: any[], u: string) => l.find((o) => o.url === u).feeUSD;
    // Eneba: tarjeta 5 % + 0,39; PayPal 7 % + 0,39 sobre $39.14.
    expect(fee(card, 'en')).toBe(2.35);
    expect(fee(mix, 'en')).toBe(3.13);
    expect(fee(mix, 'kg')).toBe(fee(card, 'kg'));
    expect(payFor({ pay: 'card', payBy: { eneba: 'paypal' } }, 'kinguin')).toBe('card');
  });
  it('«comprobada» mira la forma de pago de esa tienda', () => {
    const learned = { eneba: { paypal: [{ net: 10, fee: 0.8, at: 5 }] }, kinguin: { paypal: [{ net: 10, fee: 1, at: 6 }] } } as any;
    const m = mergeFees(learned, { pay: 'card', payBy: { eneba: 'paypal' } });
    expect(m.checked.eneba).toBe(5);
    expect(m.checked.kinguin).toBeUndefined();
  });
  it('el carrito suma la comisión de cada tienda con su forma de pago', () => {
    const o = (store: string, p: number) => ({ store, fit: 'ok', priceUSD: p, couponUSD: 0, url: store }) as any;
    const items = [{ appid: 1, name: 'A', steamUSD: 50, offers: [o('eneba', 20)] }];
    expect(planCart(items, { pay: 'card' }).totalUSD).toBeCloseTo(21.39, 2);
    expect(planCart(items, { pay: 'card', payBy: { eneba: 'paypal' } }).totalUSD).toBeCloseTo(21.79, 2);
  });
  it('solo guarda las tiendas que pagan distinto de la general', () => {
    expect(cleanPayBy({ pay: 'paypal', payBy: { eneba: 'paypal', ig: 'card' } })).toEqual({ ig: 'card' });
    expect(payMixed({ pay: 'card', payBy: {} })).toBe(false);
    expect(payMixed({ pay: 'card', payBy: { ig: 'paypal' } })).toBe(true);
  });
});

describe('1.8 (3): «Mejor esperar», con números', () => {
  const wait = { kind: 'wait', title: 'Espera', detail: '' };
  it('con el mínimo histórico, cuánto podrías ahorrar', () => {
    const html = waitHTML(cmp({ verdict: wait, low: { pct: 70, date: new Date('2026-08-28').getTime(), usd: 19.9 } }), S, NOW);
    expect(html).toContain('el mínimo histórico fue de unos <b>$19.90</b>');
    expect(html).toContain('ago. 2026');
    expect(html).toContain('en 19 días');
    expect(html).toContain('$5.93');
  });
  it('sin mínimo de CheapShark usa el historial guardado, y sin historial solo las rebajas', () => {
    const h = [{ t: NOW - 20 * DAY, steam: 69.99, best: 22 }, { t: NOW - 5 * DAY, steam: 69.99, best: 27 }];
    const html = waitHTML(cmp({ verdict: wait, history: h }), S, NOW);
    expect(html).toContain('estuvo a <b>$22.00</b>');
    expect(html).toContain('$3.83');
    const bare = waitHTML(cmp({ verdict: wait }), S, NOW);
    expect(bare).toContain('en 19 días.');
    expect(bare).not.toContain('ahorrar');
  });
  it('nada si el veredicto no es esperar, si ya lo tienes o si faltan tiendas', () => {
    expect(waitHTML(cmp(), S, NOW)).toBe('');
    expect(waitHTML(cmp({ verdict: wait, owned: true }), S, NOW)).toBe('');
    expect(waitHTML(cmp({ verdict: wait, pending: ['eneba'] }), S, NOW)).toBe('');
  });
});

describe('1.8 (11 y 13): estado de las tiendas y registro de fallos', async () => {
  const { errReport, errText, pushErr, storeDown } = await import('../lib/health');
  it('el registro guarda 20 y no repite el mismo fallo seguido', () => {
    let l: any[] = [];
    for (let i = 0; i < 25; i++) l = pushErr(l, { at: i * 120_000, store: 'eneba', game: `G${i}`, what: 'Eneba 503' });
    expect(l.length).toBe(20);
    expect(l[0].game).toBe('G5');
    const again = pushErr(l, { ...l[19], at: l[19].at + 1000 });
    expect(again).toBe(l);
  });
  it('los errores de red se dicen en claro', () => {
    expect(errText(new TypeError('Failed to fetch'))).toBe('Sin respuesta (red o bloqueo)');
    expect(errText(new Error('Kinguin 429'))).toBe('Kinguin 429');
  });
  it('una tienda está mal solo si la última revisión falló hace menos de 26 h', () => {
    const h = { eneba: { ok: false, at: NOW - 3_600_000, ms: 900, n: 0, why: 'Eneba 503' }, ig: { ok: true, at: NOW, ms: 300, n: 2, why: '' }, kinguin: { ok: false, at: NOW - 30 * 3_600_000, ms: 1, n: 0, why: 'x' } } as any;
    expect(storeDown(h, 'eneba', NOW)).toBe(true);
    expect(storeDown(h, 'ig', NOW)).toBe(false);
    expect(storeDown(h, 'kinguin', NOW)).toBe(false);
    expect(storeDown(h, 'driffle', NOW)).toBe(false);
  });
  it('el informe lleva versión, navegador, estado y fallos, y nada más', () => {
    const r = errReport([{ at: NOW, store: 'eneba', game: 'Hades', what: 'Eneba 503' }], { ig: { ok: true, at: NOW, ms: 300, n: 2, why: '' } }, { version: '1.8.0', ua: 'Chrome/140', now: NOW });
    expect(r).toContain('Where is cheap 1.8.0');
    expect(r).toContain('Navegador: Chrome/140');
    expect(r).toContain('Instant Gaming: bien');
    expect(r).toContain('Driffle: sin revisar');
    expect(r).toContain('Eneba · Hades · Eneba 503');
  });
  it('la tabla dice «no la pudimos leer hoy» en vez de esconder la tienda', () => {
    const html = tableHTML(cmp({ down: ['driffle'], failed: [] }), S, { open: true, showNo: false, chart: false, editions: [] });
    expect(html).toContain('No la pudimos leer hoy');
  });
});

describe('1.8 (12): comprobar el precio al llegar', async () => {
  const { pageKey, priceOff, readPagePrice } = await import('../lib/health');
  const doc = (ld: unknown[], item?: { price: string; cur: string }) => ({
    querySelectorAll: (sel: string) => (sel.includes('ld+json') ? ld.map((x) => ({ textContent: typeof x === 'string' ? x : JSON.stringify(x) })) : []),
    querySelector: (sel: string) => (!item ? null : sel.includes('priceCurrency') ? { getAttribute: () => item.cur, textContent: item.cur } : { getAttribute: () => item.price, textContent: item.price }),
  }) as any;
  it('misma página aunque cambien www, parámetros o la barra final', () => {
    expect(pageKey('https://www.eneba.com/steam-hades-key?af=1')).toBe(pageKey('https://eneba.com/steam-hades-key/'));
  });
  it('lee el precio del JSON-LD (offers, AggregateOffer o @graph) y si no, de itemprop', () => {
    expect(readPagePrice(doc([{ '@type': 'Product', offers: { price: '12.49', priceCurrency: 'EUR' } }]))).toEqual({ price: 12.49, currency: 'EUR' });
    expect(readPagePrice(doc([{ '@graph': [{ '@type': 'WebPage' }, { '@type': ['Product'], offers: { '@type': 'AggregateOffer', lowPrice: 9.1, priceCurrency: 'usd' } }] }]))).toEqual({ price: 9.1, currency: 'USD' });
    expect(readPagePrice(doc([{ '@type': 'Product', offers: [{ price: 20, priceCurrency: 'EUR' }, { price: 18, priceCurrency: 'EUR' }] }]))).toEqual({ price: 18, currency: 'EUR' });
    expect(readPagePrice(doc(['{roto'], { price: '7,99', cur: 'EUR' }))).toEqual({ price: 7.99, currency: 'EUR' });
    expect(readPagePrice(doc([]))).toBeNull();
  });
  it('la corrección va a esa oferta, en su moneda, y solo mientras la búsqueda siga dando lo de entonces', async () => {
    const { withSeen } = await import('../lib/health');
    const seen = { [pageKey('https://www.eneba.com/steam-hades-key')]: { price: 30, currency: 'EUR' as const, at: NOW - 3_600_000, from: 25 } };
    const o = (url: string, price: number, currency: 'EUR' | 'USD' = 'EUR') => ({ url, price, currency });
    expect(withSeen([o('https://eneba.com/steam-hades-key/', 25)], seen, NOW)[0].price).toBe(30);
    // La tienda cambió el precio desde entonces: manda la búsqueda.
    expect(withSeen([o('https://eneba.com/steam-hades-key/', 18)], seen, NOW)[0].price).toBe(18);
    // Otra oferta, otra moneda o pasadas 24 h: nada.
    expect(withSeen([o('https://eneba.com/steam-hades-2-key', 25)], seen, NOW)[0].price).toBe(25);
    expect(withSeen([o('https://eneba.com/steam-hades-key', 25, 'USD')], seen, NOW)[0].price).toBe(25);
    expect(withSeen([o('https://eneba.com/steam-hades-key', 25)], seen, NOW + 2 * DAY)[0].price).toBe(25);
  });
  it('avisa con más de un 2 % y más de 25 céntimos', () => {
    expect(priceOff(25.83, 26.0)).toBe(false);
    expect(priceOff(25.83, 26.5)).toBe(true);
    expect(priceOff(5, 5.2)).toBe(false);
    expect(priceOff(5, 4.7)).toBe(true);
  });
});

describe('1.8 (9): ¿Activaste la clave?', async () => {
  const { keyToRemind } = await import('../lib/data');
  const e = (x: Record<string, unknown>) => ({ id: 'a', appid: 10, name: 'Hades', store: 'eneba', paidUSD: 10, steamUSD: 20, at: NOW - 5 * DAY, state: 'pending', ownedAtClick: false, ...x }) as any;
  it('avisa de la que lleva más de 3 días sin aparecer en tu biblioteca, una vez', () => {
    expect(keyToRemind([e({})], [], NOW)?.id).toBe('a');
    expect(keyToRemind([e({ keyAsked: NOW - DAY })], [], NOW)).toBeUndefined();
  });
  it('no avisa si ya está en tu biblioteca, si es reciente o vieja, si lo tenías o si dijiste que no compraste', () => {
    expect(keyToRemind([e({})], [10], NOW)).toBeUndefined();
    expect(keyToRemind([e({ at: NOW - DAY })], [], NOW)).toBeUndefined();
    expect(keyToRemind([e({ at: NOW - 40 * DAY })], [], NOW)).toBeUndefined();
    expect(keyToRemind([e({ ownedAtClick: true })], [], NOW)).toBeUndefined();
    expect(keyToRemind([e({ state: 'skipped' })], [], NOW)).toBeUndefined();
  });
});
