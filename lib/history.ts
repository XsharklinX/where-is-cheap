import type { HistLow, HistoryPoint, Verdict } from './types';

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

/** n-ésimo día de la semana (0 = domingo) de un mes, en UTC; n = -1 es el último. */
function nthWeekday(y: number, m: number, wd: number, n: number): number {
  if (n > 0) {
    const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
    return Date.UTC(y, m, 1 + ((wd - first + 7) % 7) + (n - 1) * 7);
  }
  const lastDay = new Date(Date.UTC(y, m + 1, 0));
  return Date.UTC(y, m, lastDay.getUTCDate() - ((lastDay.getUTCDay() - wd + 7) % 7));
}

/**
 * Las grandes rebajas de Steam de un año, con su fecha habitual. Las de otoño son la semana del Black Friday:
 * empiezan el martes antes de Acción de Gracias (cuarto jueves de noviembre). Steam no publica el calendario con
 * mucha antelación: son aproximadas por uno o dos días.
 */
export function steamSales(y: number): { name: string; start: number; days: number; bf?: boolean }[] {
  return [
    { name: 'Rebajas de primavera', start: nthWeekday(y, 2, 4, 2), days: 7 },
    { name: 'Rebajas de verano', start: nthWeekday(y, 5, 4, -1), days: 14 },
    { name: 'Rebajas de otoño (Black Friday)', start: nthWeekday(y, 10, 4, 4) - 2 * DAY, days: 7, bf: true },
    { name: 'Rebajas de invierno', start: nthWeekday(y, 11, 4, 3), days: 14 },
  ];
}

export interface SaleInfo { name: string; days: number; live: boolean; endsIn: number; start: number; bf: boolean }

/** Las rebajas en marcha (live, endsIn = días que faltan) o, si no hay, las siguientes (days = días que faltan). */
export function nextSale(now: number): SaleInfo {
  const d = new Date(now);
  let best: SaleInfo | null = null;
  for (const y of [d.getFullYear() - 1, d.getFullYear(), d.getFullYear() + 1]) {
    for (const s of steamSales(y)) {
      const end = s.start + s.days * DAY;
      if (now >= s.start && now < end) return { name: s.name, days: 0, live: true, endsIn: Math.max(1, Math.ceil((end - now) / DAY)), start: s.start, bf: !!s.bf };
      const days = Math.ceil((s.start - now) / DAY);
      if (days > 0 && (!best || days < best.days)) best = { name: s.name, days, live: false, endsIn: 0, start: s.start, bf: !!s.bf };
    }
  }
  return best!;
}

/** «Rebajas de otoño (Black Friday) en unos 21 días» o «… en marcha: terminan en 3 días». */
export function saleText(s: SaleInfo): string {
  return s.live ? `${s.name} en marcha: ${s.endsIn === 1 ? 'termina mañana' : `terminan en ${s.endsIn} días`}` : `${s.name} en ${s.days === 1 ? '1 día' : `unos ${s.days} días`}`;
}

const MONTHS = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sept.', 'oct.', 'nov.', 'dic.'];
export const monthYear = (t: number) => { const d = new Date(t); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

export function verdict(list: HistoryPoint[], current: number | null, steamDiscount: number, now = Date.now(), hl?: HistLow | null): Verdict {
  const sale = nextSale(now);
  if (current == null) return { kind: 'none', title: 'Sin oferta que active en RD', detail: `${saleText(sale)}.` };
  // 2: con el mínimo histórico de las tiendas oficiales, el veredicto no depende de cuánto tiempo lleves mirando el juego.
  if (hl?.usd != null && hl.usd > 0 && hl.pct > 0) {
    const when = monthYear(hl.date);
    const ref = `−${hl.pct}% en ${when}, unos $${hl.usd.toFixed(2)} aquí`;
    if (current <= hl.usd * 1.05) return { kind: 'buy', title: 'Compra', detail: `Igual o por debajo del mínimo histórico (${ref}).` };
    if (!sale.live && sale.days <= 45) return { kind: 'wait', title: 'Espera', detail: `${saleText(sale)}. El mínimo histórico fue ${ref}.` };
    return { kind: 'none', title: 'Precio normal', detail: `El mínimo histórico fue ${ref}. Hoy está un ${Math.round((current / hl.usd - 1) * 100)}% por encima.` };
  }
  const past = list.filter((p) => p.best != null && now - p.t > DAY);
  const span = past.length ? (now - past[0].t) / DAY : 0;
  const low = past.reduce((m, p) => Math.min(m, p.best!), Infinity);
  if (steamDiscount >= 50) return { kind: 'buy', title: 'Buen momento', detail: `Steam tiene un −${steamDiscount}% ahora.` };
  if (past.length >= 3 && span >= 14) {
    if (current <= low * 1.03) return { kind: 'buy', title: 'Compra', detail: `Es el precio más bajo en ${Math.round(span)} días de historial.` };
    if (!sale.live && sale.days <= 45) return { kind: 'wait', title: 'Espera', detail: `${saleText(sale)}. Llegó a $${low.toFixed(2)}.` };
    return { kind: 'none', title: 'Precio normal', detail: `El mínimo visto fue $${low.toFixed(2)}; hoy está ${Math.round((current / low - 1) * 100)}% por encima.` };
  }
  if (!sale.live && sale.days <= 21) return { kind: 'wait', title: 'Espera', detail: `${saleText(sale)}.` };
  return { kind: 'none', title: 'Historial en marcha', detail: `Guardamos el precio cada vez que miras el juego. ${saleText(sale)}.` };
}
