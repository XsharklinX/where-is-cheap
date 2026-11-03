import { describe, expect, it } from 'vitest';
import { couponExpired, gather, rank } from '../lib/compare';
import { editionTitle } from '../lib/editions';
import { FEES, fitFee, mergeFees, plausible } from '../lib/fees';
import { verdict } from '../lib/history';
import { parseLow, toLow, waitWorth } from '../lib/low';
import { fxFromCharge, withFx } from '../lib/rates';
import { regionFit } from '../lib/region';
import { DEFAULT_SETTINGS, type Game, type Rates, type RawOffer } from '../lib/types';

const rates: Rates = { EUR: 0.9, DOP: 60, at: 0, fallback: false };
const game: Game = { appid: 367520, name: 'Hollow Knight', steamUSD: 14.99, steamInitialUSD: 14.99, isFree: false, isDlc: false };
const DAY = 86_400_000;

describe('3: comisiones que se aprenden', () => {
  it('una compra: se mantiene la parte fija y se ajusta el porcentaje', () => {
    // Eneba estimada 5 % + 0,39. Pagó 10,99 por algo de 10: comisión 0,99 → (0,99 − 0,39) / 10 = 6 %.
    expect(fitFee([{ net: 10, fee: 0.99, at: 1 }], FEES.eneba.card)).toEqual({ pct: 6, fixed: 0.39 });
  });
  it('dos compras de precios distintos: calcula las dos partes', () => {
    // Real: 4 % + 0,50. 10 → 0,90; 30 → 1,70.
    expect(fitFee([{ net: 10, fee: 0.9, at: 1 }, { net: 30, fee: 1.7, at: 2 }], FEES.eneba.card)).toEqual({ pct: 4, fixed: 0.5 });
  });
  it('sin comisión real', () => {
    expect(fitFee([{ net: 10, fee: 0, at: 1 }], FEES.eneba.card)).toEqual({ pct: 0, fixed: 0 });
  });
  it('si la parte fija estimada es mayor que lo cobrado, todo es porcentaje', () => {
    expect(fitFee([{ net: 2, fee: 0.2, at: 1 }], FEES.kinguin.card)).toEqual({ pct: 10, fixed: 0 });
  });
  it('descarta totales tecleados mal', () => {
    expect(plausible(10, 10.99)).toBe(true);
    expect(plausible(10, 109.9)).toBe(false);
    expect(plausible(10, 1.09)).toBe(false);
  });
  it('comprobada solo con la forma de pago que usas', () => {
    const learned = { eneba: { paypal: [{ net: 10, fee: 1, at: 5 }] } };
    expect(mergeFees(learned, 'card').checked.eneba).toBeUndefined();
    expect(mergeFees(learned, 'paypal').checked.eneba).toBe(5);
    expect(mergeFees(learned, 'card').table.eneba.paypal.pct).toBe(6.1);
  });
  it('rank usa la tabla aprendida', () => {
    const o: RawOffer = { store: 'eneba', title: 'Hollow Knight Steam Key GLOBAL', kind: 'key', regions: ['global'], price: 10, currency: 'USD', url: 'u' };
    const table = mergeFees({ eneba: { card: [{ net: 10, fee: 0, at: 1 }] } }, 'card').table;
    expect(rank(game, [o], rates, DEFAULT_SETTINGS, [], table)[0].totalUSD).toBe(10);
    expect(rank(game, [o], rates, DEFAULT_SETTINGS)[0].totalUSD).toBe(10.89);
  });
});

describe('5: recargo del banco', () => {
  it('de un cargo real al recargo', () => {
    // 20 $ a 60 serían 1 200; cobraron 1 230 → 2,5 %.
    expect(fxFromCharge(20, 1230, 60)).toBe(2.5);
    expect(fxFromCharge(20, 1200, 60)).toBe(0);
    expect(fxFromCharge(20, 12300, 60)).toBeNull();
    expect(fxFromCharge(0, 1230, 60)).toBeNull();
  });
  it('los RD$ llevan el recargo; la tasa del mercado se guarda aparte', () => {
    const r = withFx(rates, 2.5);
    expect(r.DOP).toBeCloseTo(61.5);
    expect(r.DOPmarket).toBe(60);
    expect(withFx(rates, 0).DOP).toBe(60);
  });
});

describe('2: mínimo histórico', () => {
  const d = { cheapestPriceEver: { price: '3.74', date: 1700000000 }, deals: [{ retailPrice: '14.99' }, { retailPrice: '14.99' }] };
  it('lee el descuento máximo', () => {
    expect(parseLow(d)).toEqual({ pct: 75, date: 1700000000000 });
    expect(parseLow({})).toBeNull();
  });
  it('lo lleva al precio normal de Steam en RD', () => {
    expect(toLow({ pct: 75, date: 1 }, 11.99)).toEqual({ pct: 75, date: 1, usd: 3 });
    expect(toLow({ pct: 75, date: 1 }, null).usd).toBeNull();
  });
  const now = Date.UTC(2026, 9, 1); // 1 oct.: rebajas de otoño a 59 días
  const low = { pct: 75, date: Date.UTC(2025, 5, 30), usd: 3.75 };
  it('compra si está en el mínimo', () => {
    expect(verdict([], 3.8, 0, now, low).kind).toBe('buy');
  });
  it('precio normal si está lejos y no hay rebajas cerca', () => {
    const v = verdict([], 10, 0, now, low);
    expect(v.kind).toBe('none');
    expect(v.detail).toContain('jun. 2025');
  });
  it('espera si hay rebajas en menos de 45 días', () => {
    expect(verdict([], 10, 0, Date.UTC(2026, 10, 3), low).kind).toBe('wait');
  });
  it('sin mínimo histórico, el veredicto de siempre', () => {
    expect(verdict([], 10, 60, now, null).title).toBe('Buen momento');
  });
  it('merece la pena esperar si el mínimo queda un 15 % por debajo de lo de hoy', () => {
    expect(waitWorth({ lastBest: 10, steamUSD: 15 }, low)).toBe(true);
    expect(waitWorth({ lastBest: 4, steamUSD: 15 }, low)).toBe(false);
    expect(waitWorth({ steamUSD: 15 }, null)).toBe(false);
  });
});

describe('4: cupones', () => {
  it('caduca al acabar el día que dice', () => {
    const c = { id: '1', store: 'eneba' as const, code: 'X', pct: 10, checkedAt: 0, expires: Date.UTC(2026, 10, 3) };
    expect(couponExpired(c, Date.UTC(2026, 10, 3, 20))).toBe(false);
    expect(couponExpired(c, Date.UTC(2026, 10, 5))).toBe(true);
    expect(couponExpired({ ...c, expires: undefined }, Date.UTC(2030, 0, 1))).toBe(false);
  });
  it('un cupón caducado no se resta', () => {
    const o: RawOffer = { store: 'eneba', title: 'Hollow Knight', kind: 'key', regions: ['global'], price: 10, currency: 'USD', url: 'u' };
    const c = { id: '1', store: 'eneba' as const, code: 'X', pct: 10, checkedAt: 0, expires: Date.UTC(2026, 0, 1) };
    expect(rank(game, [o], rates, DEFAULT_SETTINGS, [c], FEES, Date.UTC(2025, 11, 1))[0].couponUSD).toBe(1);
    expect(rank(game, [o], rates, DEFAULT_SETTINGS, [c], FEES, Date.UTC(2026, 1, 1))[0].couponUSD).toBe(0);
  });
});

describe('1: tiendas por partes', () => {
  it('avisa al responder cada tienda, con las que faltan', async () => {
    const parts: string[][] = [];
    const later = (ms: number, v: RawOffer[]) => () => new Promise<RawOffer[]>((r) => setTimeout(() => r(v), ms));
    const res = await gather('x', { ig: later(5, []), eneba: later(30, []), kinguin: () => Promise.reject(new Error('no')) }, 'DO', (p) => parts.push(p.pending));
    expect(parts).toEqual([['ig', 'eneba'], ['eneba'], []]);
    expect(res.failed).toEqual(['kinguin']);
  });
});

describe('13: el porqué de la región', () => {
  it('explica cada caso', () => {
    expect(regionFit({ regions: ['Europe'], kind: 'key' }).why).toContain('Europa');
    expect(regionFit({ regions: ['global'], kind: 'key' }).why).toContain('cualquier cuenta');
    expect(regionFit({ regions: ['latam'], kind: 'key' }).why).toContain('LATAM');
    expect(regionFit({ regions: [], kind: 'key', regionCheckedByStore: true, store: 'kinguin' }).why).toContain('Kinguin');
    expect(regionFit({ regions: ['global'], kind: 'account' }).why).toContain('cuenta');
  });
});

describe('10: ediciones de la ficha de Steam', () => {
  it('título del bloque de compra', () => {
    expect(editionTitle('Comprar «ELDEN RING Deluxe Edition»')).toBe('ELDEN RING Deluxe Edition');
    expect(editionTitle('Buy ELDEN RING')).toBe('ELDEN RING');
  });
  // readEditions se prueba en la ficha real de Steam (prueba de navegador), sin DOM simulado.
});
