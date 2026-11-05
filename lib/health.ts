// 1.8 (11 y 13): el estado de cada tienda (revisión diaria) y el registro de fallos para «Copiar informe».
// Nada de cuenta, lista ni compras: solo qué tienda falló, con qué juego y por qué.
import type { StoreId } from './types';
import { STORE_IDS, STORES } from './types';

export interface ErrEntry { at: number; store: StoreId | 'steam'; game: string; what: string }
export const ERR_MAX = 20;

/** Añade un fallo al registro (anillo de 20). Si el último es igual y de hace menos de un minuto, no se repite. */
export function pushErr(list: ErrEntry[], e: ErrEntry): ErrEntry[] {
  const last = list[list.length - 1];
  if (last && last.store === e.store && last.game === e.game && last.what === e.what && e.at - last.at < 60_000) return list;
  return [...list, e].slice(-ERR_MAX);
}

/** El mensaje de un error, corto y sin nada que no sea del fallo. */
export function errText(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e).replace(/\s+/g, ' ').trim();
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Sin respuesta (red o bloqueo)';
  return m.slice(0, 140) || 'Error sin mensaje';
}

/** Juegos con los que se prueba cada tienda una vez al día; basta con que uno dé ofertas. Dos, porque algún buscador
 *  (Driffle da solo 8 resultados) entierra la versión de Steam de uno de ellos bajo otras plataformas o la secuela. */
export const PROBES = ['Hollow Knight', 'Hades'];

export interface StoreHealth { ok: boolean; at: number; ms: number; n: number; why: string }
export type HealthMap = Partial<Record<StoreId, StoreHealth>>;

/** ¿Hay que decir que esta tienda está mal? Solo si la última revisión falló y es de las últimas 26 h. */
export const storeDown = (h: HealthMap, id: StoreId, now = Date.now()) => {
  const x = h[id];
  return !!x && !x.ok && now - x.at < 26 * 3_600_000;
};

/* ---------- 12: comprobar el precio al llegar a la tienda ---------- */

/** Lo que esperamos ver en la página de una oferta tras pulsar «Ir». */
export interface Expect { url: string; store: StoreId; price: number; currency: 'USD' | 'EUR'; name: string; at: number }
/** Precio visto en la página de una oferta (corrige la búsqueda durante 24 h). from: lo que daba la búsqueda entonces. */
export interface Seen { price: number; currency: 'USD' | 'EUR'; at: number; from: number }
export const SEEN_TTL = 86_400_000;

/** Aplica las correcciones vigentes a las ofertas de la búsqueda: misma página, misma moneda y la búsqueda sigue dando
 *  el precio de entonces (si la tienda cambió el precio desde la búsqueda, manda la búsqueda nueva). */
export function withSeen<T extends { url: string; price: number; currency: 'USD' | 'EUR' }>(raw: T[], seen: Record<string, Seen>, now = Date.now()): T[] {
  return raw.map((o) => {
    const x = seen[pageKey(o.url)];
    return x && now - x.at < SEEN_TTL && x.currency === o.currency && Math.abs(x.from - o.price) < 0.005 ? { ...o, price: x.price } : o;
  });
}

/** La misma página aunque cambien www, parámetros o la barra final. */
export function pageKey(u: string): string {
  try {
    const x = new URL(u);
    return (x.hostname.replace(/^www\./, '') + x.pathname).toLowerCase().replace(/\/+$/, '');
  } catch { return u; }
}

/** ¿Merece la pena avisar? Más de un 2 % y más de 25 céntimos. */
export const priceOff = (expected: number, seen: number) => Math.abs(seen - expected) > Math.max(0.25, expected * 0.02);

/** El precio de la página de producto: JSON-LD (Product → offers) o itemprop="price". null si no se puede leer. */
export function readPagePrice(doc: Document): { price: number; currency: string } | null {
  const num = (v: unknown) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };
  const fromOffer = (o: any): { price: number; currency: string } | null => {
    if (!o) return null;
    if (Array.isArray(o)) { const all = o.map(fromOffer).filter(Boolean) as { price: number; currency: string }[]; return all.sort((a, b) => a.price - b.price)[0] ?? null; }
    const p = num(o.price) ?? num(o.lowPrice);
    return p != null && o.priceCurrency ? { price: p, currency: String(o.priceCurrency).toUpperCase() } : null;
  };
  const visit = (n: any): { price: number; currency: string } | null => {
    if (!n || typeof n !== 'object') return null;
    if (Array.isArray(n)) { for (const x of n) { const r = visit(x); if (r) return r; } return null; }
    const t = [].concat(n['@type'] ?? []).map(String);
    if (t.includes('Product') && n.offers) { const r = fromOffer(n.offers); if (r) return r; }
    return visit(n['@graph']);
  };
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try { const r = visit(JSON.parse(s.textContent ?? '')); if (r) return r; } catch { /* JSON roto: siguiente */ }
  }
  const p = doc.querySelector('[itemprop="price"]');
  const c = doc.querySelector('[itemprop="priceCurrency"]');
  const price = num(p?.getAttribute('content') ?? p?.textContent);
  const cur = c?.getAttribute('content') ?? c?.textContent;
  return price != null && cur ? { price, currency: cur.trim().toUpperCase() } : null;
}

const fmt = (t: number) => new Date(t).toISOString().replace('T', ' ').slice(0, 16);
const nameOf = (s: StoreId | 'steam') => (s === 'steam' ? 'Steam' : STORES[s].name);

/** El texto que se copia para mandar con un fallo. */
export function errReport(list: ErrEntry[], health: HealthMap, meta: { version: string; ua: string; now?: number }): string {
  const now = meta.now ?? Date.now();
  const lines = [`Where is cheap ${meta.version}`, `Navegador: ${meta.ua}`, `Fecha: ${fmt(now)} UTC`, '', 'Estado de las tiendas:'];
  for (const id of STORE_IDS) {
    const h = health[id];
    lines.push(`- ${STORES[id].name}: ${h ? `${h.ok ? 'bien' : `mal (${h.why})`} · ${h.n} ${h.n === 1 ? 'oferta' : 'ofertas'} · ${h.ms} ms · ${fmt(h.at)}` : 'sin revisar'}`);
  }
  lines.push('', list.length ? `Últimos fallos (${list.length}):` : 'Sin fallos guardados.');
  for (const e of [...list].reverse()) lines.push(`- ${fmt(e.at)} · ${nameOf(e.store)} · ${e.game} · ${e.what}`);
  return lines.join('\n');
}
