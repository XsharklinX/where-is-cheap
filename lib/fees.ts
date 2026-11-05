import type { Pay, StoreId } from './types';

// Comisiones ESTIMADAS (2026-11-02), sin verificar con un carrito real. La interfaz dice «est.» hasta que
// David confirma una compra con lo que pagó de verdad: entonces se calcula la comisión real de esa tienda
// (3: comisiones que se aprenden) y se guarda en el navegador.
// pct: porcentaje sobre el precio; fixed: importe fijo en USD por pedido.
export interface Fee { pct: number; fixed: number }
export type FeeTable = Record<StoreId, Record<Pay, Fee>>;

export const FEES: FeeTable = {
  ig: { card: { pct: 0, fixed: 0 }, paypal: { pct: 0, fixed: 0 } },
  eneba: { card: { pct: 5, fixed: 0.39 }, paypal: { pct: 7, fixed: 0.39 } },
  driffle: { card: { pct: 4, fixed: 0 }, paypal: { pct: 6, fixed: 0 } },
  kinguin: { card: { pct: 6, fixed: 0.5 }, paypal: { pct: 8, fixed: 0.5 } },
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** 1.8 (6): cómo pagas en cada tienda; la que no tiene la suya usa la forma de pago general. */
export type PayBy = Partial<Record<StoreId, Pay>>;
export interface PayPrefs { pay: Pay; payBy?: PayBy }
export const payFor = (p: PayPrefs, store: StoreId): Pay => p.payBy?.[store] ?? p.pay;
/** ¿Pagas distinto en unas tiendas que en otras? */
export const payMixed = (p: PayPrefs): boolean => new Set((Object.keys(FEES) as StoreId[]).map((id) => payFor(p, id))).size > 1;
/** Quita las tiendas que pagan igual que la forma general (para no guardar ruido). */
export function cleanPayBy(p: PayPrefs): PayBy {
  const out: PayBy = {};
  for (const id of Object.keys(FEES) as StoreId[]) if (p.payBy?.[id] && p.payBy[id] !== p.pay) out[id] = p.payBy[id];
  return out;
}

export function feeFor(store: StoreId, pay: Pay, priceUSD: number, table: FeeTable = FEES): number {
  const f = table[store][pay];
  return round2((priceUSD * f.pct) / 100 + f.fixed);
}

/** Una compra confirmada: precio sin comisión y comisión pagada, en USD. */
export interface FeeSample { net: number; fee: number; at: number }
/** Lo aprendido por tienda y forma de pago. */
export type Learned = Partial<Record<StoreId, Partial<Record<Pay, FeeSample[]>>>>;

/** ¿Es creíble esta compra para aprender de ella? Descarta errores al teclear el total. */
export function plausible(net: number, paid: number): boolean {
  const fee = paid - net;
  return net > 0 && fee >= -0.02 && fee <= net * 0.25 + 2;
}

/**
 * Comisión a partir de compras reales. Con una sola compra (o todas del mismo precio) se mantiene la parte fija
 * estimada y se ajusta el porcentaje; con precios distintos se calculan las dos por mínimos cuadrados.
 */
export function fitFee(samples: FeeSample[], est: Fee): Fee {
  const s = samples.filter((x) => x.net > 0);
  if (!s.length) return est;
  const n = s.length;
  const mx = s.reduce((t, x) => t + x.net, 0) / n;
  const my = s.reduce((t, x) => t + x.fee, 0) / n;
  const sxx = s.reduce((t, x) => t + (x.net - mx) ** 2, 0);
  if (n >= 2 && sxx > 1) {
    const slope = s.reduce((t, x) => t + (x.net - mx) * (x.fee - my), 0) / sxx;
    const fixed = my - slope * mx;
    if (slope >= 0 && fixed >= -0.01) return { pct: Math.round(slope * 1000) / 10, fixed: round2(Math.max(0, fixed)) };
  }
  if (my <= 0.005) return { pct: 0, fixed: 0 };
  const fixed = est.fixed < my ? est.fixed : 0;
  return { pct: Math.max(0, Math.round(((my - fixed) / mx) * 1000) / 10), fixed };
}

/** Tabla de comisiones con lo aprendido encima de lo estimado, y desde cuándo está comprobada cada tienda. */
export function mergeFees(learned: Learned, pay: Pay | PayPrefs): { table: FeeTable; checked: Partial<Record<StoreId, number>> } {
  const prefs: PayPrefs = typeof pay === 'string' ? { pay } : pay;
  const table = structuredClone(FEES);
  const checked: Partial<Record<StoreId, number>> = {};
  for (const store of Object.keys(FEES) as StoreId[]) {
    for (const p of ['card', 'paypal'] as Pay[]) {
      const s = learned[store]?.[p];
      if (!s?.length) continue;
      table[store][p] = fitFee(s, FEES[store][p]);
      // Comprobada con la forma de pago que usas ahora; se muestra la compra más reciente.
      if (p === payFor(prefs, store)) checked[store] = Math.max(...s.map((x) => x.at));
    }
  }
  return { table, checked };
}
