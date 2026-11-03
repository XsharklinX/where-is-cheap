// 2: mínimo histórico de un juego en tiendas oficiales (CheapShark: Steam, Humble, Fanatical, GOG, GMG…).
// CheapShark da precios de EE. UU.; para llevarlo a RD se usa el descuento: si llegó a −75 % del precio normal,
// en RD habría sido −75 % del precio normal de Steam en RD. Sin clave ni servidor propio.
// Se guarda una semana por juego y, si CheapShark responde 429, se deja de preguntar una hora.
import type { HistLow } from './types';

const API = 'https://www.cheapshark.com/api/1.0';
const WEEK = 7 * 86_400_000;
const DAY = 86_400_000;
const GAP = 1500;

/** Lo que se guarda por juego. none: CheapShark no lo tiene. */
export interface LowCache { pct: number; date: number; at: number; none?: boolean }

/** De la respuesta de /games?id= al descuento máximo visto. Pura: se prueba sin red. */
export function parseLow(d: any): { pct: number; date: number } | null {
  const ever = Number(d?.cheapestPriceEver?.price);
  const date = Number(d?.cheapestPriceEver?.date) * 1000;
  const retail = Math.max(0, ...((d?.deals ?? []) as any[]).map((x) => Number(x.retailPrice) || 0));
  if (!(ever >= 0) || !(retail > 0) || !(date > 0)) return null;
  const pct = Math.round((1 - ever / retail) * 100);
  return pct >= 0 && pct <= 100 ? { pct, date } : null;
}

/** El descuento histórico aplicado al precio normal de Steam en RD. */
export function toLow(c: Pick<LowCache, 'pct' | 'date'>, steamInitialUSD: number | null | undefined): HistLow {
  return { pct: c.pct, date: c.date, usd: steamInitialUSD ? Math.round(steamInitialUSD * (100 - c.pct)) / 100 : null };
}

let queue: Promise<unknown> = Promise.resolve();
let queued = 0;
let blockedUntil = 0;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Con más de 4 juegos en cola no se pide más: lo que falte se completa en la siguiente revisión. */
const MAX_QUEUE = 4;

async function getJSON(url: string): Promise<any> {
  // Una petición cada 1,5 s como mucho: CheapShark bloquea a quien pregunta demasiado.
  queued++;
  const run = queue.then(async () => {
    if (Date.now() < blockedUntil) throw new Error('CheapShark en pausa');
    const r = await fetch(url, { credentials: 'omit' });
    if (r.status === 429) { blockedUntil = Date.now() + 3_600_000; throw new Error('CheapShark 429'); }
    if (!r.ok) throw new Error(`CheapShark ${r.status}`);
    return r.json();
  });
  queue = run.catch(() => {}).then(() => wait(GAP));
  return run.finally(() => { queued--; });
}

/** Mínimo histórico guardado o recién pedido. null si no se sabe (sin datos o CheapShark no responde). */
export async function getLow(appid: number, opts: { fetch: boolean } = { fetch: true }): Promise<LowCache | null> {
  const key = `low:${appid}`;
  const saved = (await browser.storage.local.get(key))[key] as LowCache | undefined;
  if (saved && Date.now() - saved.at < (saved.none ? DAY * 3 : WEEK)) return saved.none ? null : saved;
  if (!opts.fetch || Date.now() < blockedUntil || queued >= MAX_QUEUE) return saved && !saved.none ? saved : null;
  try {
    const list = await getJSON(`${API}/games?steamAppID=${appid}`);
    const id = Array.isArray(list) && list[0]?.gameID;
    const low = id ? parseLow(await getJSON(`${API}/games?id=${encodeURIComponent(id)}`)) : null;
    const c: LowCache = low ? { ...low, at: Date.now() } : { pct: 0, date: 0, at: Date.now(), none: true };
    await browser.storage.local.set({ [key]: c });
    return low ? c : null;
  } catch {
    return saved && !saved.none ? saved : null;
  }
}

/**
 * 11 y 6: ¿merece la pena esperar? Sí si el mínimo histórico, llevado a RD, queda al menos un 15 % por debajo
 * de lo más barato que hay hoy (la mejor oferta o Steam).
 */
export function waitWorth(w: { lastBest?: number | null; steamUSD?: number | null }, low: HistLow | null): boolean {
  if (!low || low.usd == null) return false;
  const today = Math.min(w.lastBest ?? Infinity, w.steamUSD ?? Infinity);
  return Number.isFinite(today) && low.usd < today * 0.85;
}
