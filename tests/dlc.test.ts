import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('browser', { runtime: { getURL: (p: string) => p } });
import { dlcBundle, dlcCheapest, dlcExtra, dlcHTML, dlcShort, dlcToPrice, runHTML, type DlcView } from '../lib/block';
import { DEFAULT_SETTINGS, type Compare, type Offer } from '../lib/types';

const s = { ...DEFAULT_SETTINGS, currency: 'usd' as const };
const off = (total: number): Offer => ({
  store: 'ig', title: 'x', kind: 'key', regions: ['global'], price: total, currency: 'USD', url: 'https://ig/x',
  priceUSD: total, couponUSD: 0, feeUSD: 0, totalUSD: total, fit: 'ok', fitText: '', fitWhy: '',
});
const cmp = (extra: Partial<Compare> = {}): Compare => ({
  game: { appid: 1245620, name: 'ELDEN RING', steamUSD: 59.99, isFree: false }, offers: [off(35.81)], failed: [], rates: { EUR: 0.9, DOP: 60, at: 0, fallback: false },
  pay: 'card', at: 0, history: [], verdict: { kind: 'none', title: '', detail: '' }, owned: false, ownsBase: null, pending: [], feesChecked: {}, ...extra,
});
const view = (extra: Partial<DlcView> = {}): DlcView => ({
  open: true, total: 4, ownedKnown: true, prices: {},
  items: [
    { appid: 2, name: 'ELDEN RING Shadow of the Erdtree Premium Bundle', steamUSD: 49.99, soon: false, owned: false },
    { appid: 3, name: 'ELDEN RING Shadow of the Erdtree', steamUSD: 39.99, soon: false, owned: false },
    { appid: 4, name: 'ELDEN RING Tarnished Pack', steamUSD: 4.99, soon: false, owned: false },
    { appid: 5, name: 'ELDEN RING Official Soundtrack', steamUSD: 9.99, soon: false, owned: false },
  ],
  ...extra,
});
const st = { open: false, showNo: false, chart: false, editions: [
  { name: 'ELDEN RING', label: 'Estándar', steamUSD: 59.99, steamInitialUSD: 59.99 },
  { name: 'ELDEN RING Shadow of the Erdtree Edition', label: 'Shadow of the Erdtree Edition', steamUSD: 79.99, steamInitialUSD: 79.99 },
] };
const text = (h: string) => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

describe('DLC (1.3, idea 9)', () => {
  it('quita el nombre del juego y aparta bandas sonoras y packs', () => {
    expect(dlcShort('ELDEN RING Shadow of the Erdtree', 'ELDEN RING')).toBe('Shadow of the Erdtree');
    expect(dlcShort('Cuphead - The Delicious Last Course', 'Cuphead')).toBe('The Delicious Last Course');
    expect(dlcShort('ELDEN RING', 'ELDEN RING')).toBe('ELDEN RING');
    expect(dlcExtra('Cuphead - Official Soundtrack')).toBe(true);
    expect(dlcBundle('Shadow of the Erdtree Premium Bundle')).toBe(true);
    expect(dlcBundle('Tarnished Pack')).toBe(false);
  });
  it('busca fuera de Steam los que faltan, sin bandas sonoras ni los que tienes', () => {
    const v = view();
    v.items[2].owned = true;
    expect(dlcToPrice(v).map((d) => d.appid)).toEqual([2, 3]);
  });
  it('lo más barato de cada uno: la clave si gana a Steam', () => {
    const d = view().items[1];
    expect(dlcCheapest(d, { steamUSD: 39.99, best: { store: 'ig', totalUSD: 36.48, url: '' } })).toBe(36.48);
    expect(dlcCheapest(d, { steamUSD: 39.99, best: null })).toBe(39.99);
    expect(dlcCheapest(d, 'error')).toBe(39.99);
    expect(dlcCheapest(d, 'loading')).toBeNull();
  });
  it('cerrado: cuántos hay y lo que cuestan en Steam, sin packs ni bandas sonoras', () => {
    expect(text(dlcHTML(view({ open: false }), cmp(), s, st))).toContain('4 DLC · $44.98 en Steam');
  });
  it('suma juego + DLC sin el pack y la compara con la edición', () => {
    const v = view({ prices: { 2: { steamUSD: 49.99, best: { store: 'ig', totalUSD: 22.38, url: '' } }, 3: { steamUSD: 39.99, best: { store: 'ig', totalUSD: 36.48, url: '' } }, 4: { steamUSD: 4.99, best: null } } });
    const t = text(dlcHTML(v, cmp(), s, st));
    // 35.81 + 36.48 + 4.99
    expect(t).toContain('Juego + los 2 DLC (sin contar packs ni bandas sonoras), lo más barato de cada uno: $77.28');
    expect(t).toContain('Por separado sale más barato que «Shadow of the Erdtree Edition»');
  });
  it('sin suma mientras falta algún precio, y sin «te faltan» si no sabemos qué tienes', () => {
    const t = text(dlcHTML(view({ ownedKnown: false, prices: { 2: 'loading' } }), cmp(), s, st));
    expect(t).not.toContain('lo más barato de cada uno');
    expect(t).toContain('Buscando…');
    expect(t).toContain('No sabemos cuáles tienes');
  });
  it('si ya tienes el juego, solo lo que falta', () => {
    const v = view({ prices: { 2: 'error', 3: { steamUSD: 39.99, best: { store: 'ig', totalUSD: 36.48, url: '' } }, 4: { steamUSD: 4.99, best: null } } });
    v.items[2].owned = true;
    const t = text(dlcHTML(v, cmp({ owned: true }), s, st));
    expect(t).toContain('El DLC que te falta (sin contar packs ni bandas sonoras), lo más barato de cada uno: $36.48; en Steam, $39.99.');
    expect(t).toContain('tienes 1, te faltan 3');
  });
  it('sin DLC no pinta nada', () => expect(dlcHTML(view({ total: 0, items: [] }), cmp(), s, st)).toBe(''));
});

describe('línea «¿Lo corre mi PC?» (1.3, idea 4)', () => {
  it('cada nivel con su frase', () => {
    const p = (part: 'gpu' | 'cpu' | 'ram', level: 'rec' | 'min' | 'below' | 'unknown', why?: string) => ({ part, mine: 'x', min: 'a', rec: 'b', level, why });
    expect(text(runHTML({ level: 'yes', parts: [p('gpu', 'rec')], integrated: false }))).toContain('Tu PC lo corre bien');
    expect(text(runHTML({ level: 'tight', parts: [p('gpu', 'min'), p('ram', 'min'), p('cpu', 'rec')], integrated: false }))).toContain('la gráfica y la memoria pasan el mínimo');
    expect(text(runHTML({ level: 'no', parts: [p('cpu', 'below')], integrated: true }))).toContain('el procesador no llega');
    expect(runHTML({ level: 'no', parts: [p('cpu', 'below')], integrated: true })).toContain('gráfica integrada');
    expect(text(runHTML({ level: 'unknown', parts: [p('gpu', 'unknown', 'No reconocemos tu gráfica')], integrated: false }))).toContain('No reconocemos tu gráfica. Corregir');
    expect(runHTML({ level: 'unknown', parts: [p('gpu', 'unknown', 'No entendemos lo que pide')], integrated: false })).toBe('');
    expect(runHTML({ level: 'unknown', parts: [], integrated: false })).toBe('');
    expect(text(runHTML({ level: 'nopc', parts: [], integrated: false }))).toContain('Dínoslo en Ajustes');
  });
});

describe('nota del vendedor (1.3, idea 10)', () => {
  const html = '..."price":{"amount":912,"currency":"EUR"},"unitPrice":912,"seller":{"id":1,"name":"SigmaIota","merchantStatistics":{"completedOrders":234620,"merchantRating":0.9950052}},"x":1,'
    + '"price":{"amount":830,"currency":"EUR"},"unitPrice":830,"seller":{"id":2,"name":"Monday \\"Games\\"","merchantStatistics":{"completedOrders":171734,"merchantRating":0.99949926}}...'
    + '"price":{"amount":700,"currency":"EUR"},"unitPrice":700,"seller":{"id":3,"name":"Nuevo","merchantStatistics":{"completedOrders":12,"merchantRating":1}}';
  it('el vendedor de la oferta con ese precio, o el de la más barata', async () => {
    const { parseKinguinSeller } = await import('../lib/stores/kinguin');
    expect(parseKinguinSeller(html, 830)).toEqual({ name: 'Monday "Games"', orders: 171734, rating: 0.99949926 });
    expect(parseKinguinSeller(html)?.name).toBe('Nuevo');
    expect(parseKinguinSeller('<html></html>')).toBeNull();
  });
  it('marca a los que tienen pocas ventas o mala valoración', async () => {
    const { sellerHTML } = await import('../lib/block');
    expect(text(sellerHTML({ name: 'SigmaIota', orders: 234620, rating: 0.995 }))).toBe('SigmaIota · 99,5 % · 235 mil pedidos');
    expect(sellerHTML({ name: 'Nuevo', orders: 12, rating: 1 })).toContain('chip warn');
    expect(text(sellerHTML({ name: 'Malo', orders: 5000, rating: 0.91 }))).toBe('Malo · valoración 91 %');
    expect(sellerHTML(null)).toBe('');
  });
});
