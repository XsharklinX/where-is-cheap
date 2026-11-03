import { describe, expect, it } from 'vitest';
import { blockCase, groupStores, regionShort } from '../lib/block';
import { DEFAULT_SETTINGS, type Compare, type Offer } from '../lib/types';

const off = (store: Offer['store'], total: number, fit: Offer['fit'] = 'ok', regions = ['global']): Offer => ({
  store, title: 'x', kind: 'key', regions, price: total, currency: 'USD', url: `https://${store}/${total}`,
  priceUSD: total, couponUSD: 0, feeUSD: 0, totalUSD: total, fit, fitText: '', fitWhy: '',
});

const cmp = (offers: Offer[], extra: Partial<Compare> = {}, steam: number | null = 19.99): Compare => ({
  game: { appid: 1, name: 'Juego', steamUSD: steam, isFree: false }, offers, failed: [], rates: { EUR: 0.9, DOP: 60, at: 0, fallback: false },
  pay: 'card', at: 0, history: [], verdict: { kind: 'none', title: '', detail: '' }, owned: false, ownsBase: null, pending: [], feesChecked: {}, ...extra,
});

describe('groupStores (1.2, ideas 2 y 3)', () => {
  it('una fila por tienda con su mejor oferta, y lo que no activa en RD aparte', () => {
    const offers = [off('eneba', 10.98), off('kinguin', 11.18), off('ig', 11.41), off('eneba', 15.88), off('eneba', 10.77, 'no', ['europe']), off('kinguin', 21.62)];
    const { groups, no } = groupStores(offers);
    expect(groups.map((g) => g.store)).toEqual(['eneba', 'kinguin', 'ig']);
    expect(groups[0].top.totalUSD).toBe(10.98);
    expect(groups[0].rest.map((o) => o.totalUSD)).toEqual([15.88]);
    expect(groups[1].rest.map((o) => o.totalUSD)).toEqual([21.62]);
    expect(no.map((o) => o.totalUSD)).toEqual([10.77]);
    // i apunta a la oferta original, para apuntar bien el clic.
    expect(offers[groups[0].rest[0].i].totalUSD).toBe(15.88);
  });
  it('una cuenta o una región dudosa va detrás de las que activan, aunque sea más barata', () => {
    const { groups } = groupStores([off('driffle', 5, 'warn'), off('eneba', 9)]);
    expect(groups[0].store).toBe('eneba');
  });
});

describe('blockCase (1.2, idea 7)', () => {
  const s = DEFAULT_SETTINGS;
  it('sin datos todavía: cargando', () => expect(blockCase(null, s)).toBe('loading'));
  it('más barato fuera', () => expect(blockCase(cmp([off('eneba', 10)]), s)).toBe('best'));
  it('Steam gana si cuesta lo mismo o menos', () => expect(blockCase(cmp([off('eneba', 12)], {}, 9.99), s)).toBe('steam'));
  it('ya lo tienes', () => expect(blockCase(cmp([off('eneba', 10)], { owned: true }), s)).toBe('owned'));
  it('faltan tiendas y aún no hay oferta: cargando', () => expect(blockCase(cmp([], { pending: ['eneba'] }), s)).toBe('loading'));
  it('todo respondió y nada activa en RD', () => expect(blockCase(cmp([off('eneba', 10, 'no')]), s)).toBe('none'));
  it('si no se muestran marketplaces, no espera por ellos', () => expect(blockCase(cmp([], { pending: ['eneba'] }), { ...s, marketplaces: false })).toBe('none'));
});

describe('regionShort', () => {
  it('Global, la región traducida o «Tu país» si la tienda ya lo comprobó', () => {
    expect(regionShort(off('eneba', 1))).toBe('Global');
    expect(regionShort(off('eneba', 1, 'ok', ['latam']))).toBe('LATAM');
    expect(regionShort({ ...off('kinguin', 1, 'ok', ['DO']), regionCheckedByStore: true })).toBe('Tu país');
  });
});
