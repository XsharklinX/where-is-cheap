import type { Rates } from './types';

const KEY = 'rates';
const TTL = 12 * 60 * 60 * 1000;
// Tasas del 2026-11-03, solo si el servicio no responde y no hay nada guardado.
const FALLBACK: Rates = { EUR: 0.8933, DOP: 60.67, at: Date.parse('2026-11-03T00:00:00Z'), fallback: true };

export async function getRates(): Promise<Rates> {
  const saved = (await browser.storage.local.get(KEY))[KEY] as Rates | undefined;
  if (saved && Date.now() - saved.at < TTL) return saved;
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD');
    const d = await r.json();
    if (d.result !== 'success' || !d.rates?.EUR || !d.rates?.DOP) throw new Error('tasas incompletas');
    const rates: Rates = { EUR: d.rates.EUR, DOP: d.rates.DOP, at: Date.now(), fallback: false };
    await browser.storage.local.set({ [KEY]: rates });
    return rates;
  } catch {
    return saved ?? FALLBACK;
  }
}

/** 5: los pesos que te cobra el banco: la tasa del mercado más su recargo. */
export function withFx(r: Rates, fxPct: number): Rates {
  const pct = Number.isFinite(fxPct) && fxPct > 0 ? Math.min(fxPct, 20) : 0;
  return { ...r, DOPmarket: r.DOP, fxPct: pct, DOP: r.DOP * (1 + pct / 100) };
}

/** 5: recargo del banco a partir de un cargo real: «un cargo de $X me salió en RD$ Y». */
export function fxFromCharge(usd: number, dop: number, market: number): number | null {
  if (!(usd > 0) || !(dop > 0) || !(market > 0)) return null;
  const pct = (dop / usd / market - 1) * 100;
  // Por debajo de 0 o por encima de 20 es casi seguro un error al teclear (o un día de tasa muy distinta).
  if (pct < -1 || pct > 20) return null;
  return Math.max(0, Math.round(pct * 10) / 10);
}
