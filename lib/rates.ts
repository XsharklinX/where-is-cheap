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
