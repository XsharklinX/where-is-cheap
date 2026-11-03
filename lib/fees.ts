import type { Pay, StoreId } from './types';

// Comisiones ESTIMADAS (2026-11-02), sin verificar con un carrito real. La interfaz dice «comisión est.».
// pct: porcentaje sobre el precio; fixed: importe fijo en USD por pedido.
// Pendiente: comprobar cada una con un carrito de verdad y anotar la fecha aquí.
export const FEES_CHECKED = false;

export const FEES: Record<StoreId, Record<Pay, { pct: number; fixed: number }>> = {
  ig: { card: { pct: 0, fixed: 0 }, paypal: { pct: 0, fixed: 0 } },
  eneba: { card: { pct: 5, fixed: 0.39 }, paypal: { pct: 7, fixed: 0.39 } },
  driffle: { card: { pct: 4, fixed: 0 }, paypal: { pct: 6, fixed: 0 } },
  kinguin: { card: { pct: 6, fixed: 0.5 }, paypal: { pct: 8, fixed: 0.5 } },
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function feeFor(store: StoreId, pay: Pay, priceUSD: number): number {
  const f = FEES[store][pay];
  return round2((priceUSD * f.pct) / 100 + f.fixed);
}
