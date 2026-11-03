import type { HistoryPoint, Verdict } from './types';

// D: historial guardado en el navegador cada vez que se compara un juego (como mucho un punto cada 6 h)
// y veredicto «compra o espera». Sin servidor: el historial empieza el día que instalas la extensión.

const GAP = 6 * 60 * 60 * 1000;
const KEEP = 400;
const DAY = 86_400_000;

export function addPoint(list: HistoryPoint[], p: HistoryPoint): HistoryPoint[] {
  const last = list[list.length - 1];
  if (last && p.t - last.t < GAP) {
    // Dentro de la misma ventana se guarda el más bajo.
    const merged = { ...last, t: p.t, steam: p.steam ?? last.steam, best: minN(last.best, p.best), store: (p.best ?? Infinity) <= (last.best ?? Infinity) ? p.store : last.store };
    return [...list.slice(0, -1), merged];
  }
  return [...list, p].slice(-KEEP);
}

const minN = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.min(a, b));

/** Fechas aproximadas de las grandes rebajas de Steam (mes, día de inicio habitual). */
const SALES: { name: string; m: number; d: number }[] = [
  { name: 'Rebajas de primavera', m: 2, d: 19 },
  { name: 'Rebajas de verano', m: 5, d: 26 },
  { name: 'Rebajas de otoño', m: 8, d: 29 },
  { name: 'Rebajas de invierno', m: 11, d: 18 },
];

export function nextSale(now: number): { name: string; days: number } {
  const d = new Date(now);
  let best = { name: '', days: Infinity };
  for (const y of [d.getFullYear(), d.getFullYear() + 1]) {
    for (const s of SALES) {
      const days = Math.ceil((Date.UTC(y, s.m, s.d) - now) / DAY);
      if (days >= 0 && days < best.days) best = { name: s.name, days };
    }
  }
  return best;
}

export function verdict(list: HistoryPoint[], current: number | null, steamDiscount: number, now = Date.now()): Verdict {
  const sale = nextSale(now);
  if (current == null) return { kind: 'none', title: 'Sin oferta que active en RD', detail: `${sale.name} en unos ${sale.days} días.` };
  const past = list.filter((p) => p.best != null && now - p.t > DAY);
  const span = past.length ? (now - past[0].t) / DAY : 0;
  const low = past.reduce((m, p) => Math.min(m, p.best!), Infinity);
  if (steamDiscount >= 50) return { kind: 'buy', title: 'Buen momento', detail: `Steam tiene un −${steamDiscount}% ahora.` };
  if (past.length >= 3 && span >= 14) {
    if (current <= low * 1.03) return { kind: 'buy', title: 'Compra', detail: `Es el precio más bajo en ${Math.round(span)} días de historial.` };
    if (sale.days <= 45) return { kind: 'wait', title: 'Espera', detail: `${sale.name} en unos ${sale.days} días. Llegó a $${low.toFixed(2)}.` };
    return { kind: 'none', title: 'Precio normal', detail: `El mínimo visto fue $${low.toFixed(2)}; hoy está ${Math.round((current / low - 1) * 100)}% por encima.` };
  }
  if (sale.days <= 21) return { kind: 'wait', title: 'Espera', detail: `${sale.name} en unos ${sale.days} días.` };
  return { kind: 'none', title: 'Historial en marcha', detail: `Guardamos el precio cada vez que miras el juego. ${sale.name} en unos ${sale.days} días.` };
}
