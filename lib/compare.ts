import { feeFor, FEES, payFor, round2, type FeeTable, type PayPrefs } from './fees';
import { sameGame } from './match';
import { regionFit } from './region';
import type { Compare, Coupon, Game, Offer, Pay, Rates, RawOffer, Settings, StoreId } from './types';
import { STORES } from './types';

/** Convierte, aplica cupones y comisiones, filtra y ordena. Pura: se prueba sin red. */
export function rank(game: Game, raw: RawOffer[], rates: Rates, s: Settings, coupons: Coupon[] = [], fees: FeeTable = FEES, now = Date.now()): Offer[] {
  const offers = raw
    .filter((o) => sameGame(game.name, o.title, game.year))
    .filter((o) => o.dlc === undefined || game.isDlc === undefined || o.dlc === game.isDlc)
    .filter((o) => s.marketplaces || !STORES[o.store].marketplace)
    .filter((o) => !s.hiddenStores?.includes(o.store))
    .filter((o) => s.accounts || o.kind !== 'account')
    .map((o): Offer => {
      const priceUSD = round2(o.currency === 'EUR' ? o.price / rates.EUR : o.price);
      const cp = bestCoupon(coupons, o.store, now);
      const couponUSD = cp ? round2((priceUSD * cp.pct) / 100) : 0;
      const net = round2(priceUSD - couponUSD);
      const feeUSD = feeFor(o.store, payFor(s, o.store), net, fees);
      const { fit, text, why } = regionFit(o);
      return { ...o, priceUSD, couponUSD, coupon: cp?.code, feeUSD, totalUSD: round2(net + feeUSD), fit, fitText: text, fitWhy: why };
    });

  // Una fila por tienda, tipo y región: la más barata.
  const best = new Map<string, Offer>();
  for (const o of offers) {
    const k = `${o.store}|${o.kind}|${o.regions.join(',').toLowerCase()}|${o.regionBlockedByStore ? 'x' : ''}`;
    const cur = best.get(k);
    if (!cur || o.totalUSD < cur.totalUSD) best.set(k, o);
  }
  const list = [...best.values()];
  flagSuspicious(list);
  const order = { ok: 0, warn: 1, no: 2 } as const;
  const w = (o: Offer) => (o.suspicious ? 1 : order[o.fit]);
  return list.sort((a, b) => w(a) - w(b) || order[a.fit] - order[b.fit] || a.totalUSD - b.totalUSD);
}

/** 4: un cupón caducado deja de restarse. Caduca al terminar el día que dice. */
export const couponExpired = (c: Coupon, now = Date.now()) => c.expires != null && now > c.expires + 86_400_000;

function bestCoupon(coupons: Coupon[], store: StoreId, now: number): Coupon | undefined {
  return coupons.filter((c) => c.store === store && c.pct > 0 && c.pct < 90 && !couponExpired(c, now)).sort((a, b) => b.pct - a.pct)[0];
}

/** G: en un marketplace, una clave un 30 % por debajo de la mediana del resto suele ser robada o revocable. */
export function flagSuspicious(list: Offer[]): void {
  const ok = list.filter((o) => o.fit === 'ok').map((o) => o.totalUSD).sort((a, b) => a - b);
  if (ok.length < 3) return;
  const mid = ok.length % 2 ? ok[(ok.length - 1) / 2] : (ok[ok.length / 2 - 1] + ok[ok.length / 2]) / 2;
  for (const o of list) {
    if (o.fit === 'ok' && STORES[o.store].marketplace && o.totalUSD < mid * 0.7) {
      o.suspicious = true;
      o.fit = 'warn';
      o.fitText = 'Precio sospechoso';
      o.fitWhy = 'Mucho más barato que el resto de ofertas: suele ser una clave revendida que pueden revocar. Si la compras, que sea con protección del comprador.';
    }
  }
}

export function savings(c: Pick<Compare, 'offers' | 'game'>): { usd: number; pct: number } | null {
  const top = c.offers.find((o) => o.fit === 'ok');
  if (!top || c.game.steamUSD == null || top.totalUSD >= c.game.steamUSD) return null;
  const usd = round2(c.game.steamUSD - top.totalUSD);
  return { usd, pct: Math.round((usd / c.game.steamUSD) * 100) };
}

export type Searcher = (q: string, country: string) => Promise<RawOffer[]>;

export async function gather(
  name: string,
  searchers: Partial<Record<StoreId, Searcher>>,
  country: string,
  onPart?: (p: { raw: RawOffer[]; failed: StoreId[]; pending: StoreId[] }) => void,
): Promise<{ raw: RawOffer[]; failed: StoreId[] }> {
  // 1: cada tienda se entrega en cuanto responde, sin esperar a la más lenta.
  const ids = Object.keys(searchers) as StoreId[];
  const raw: RawOffer[] = [];
  const failed: StoreId[] = [];
  const pending = new Set(ids);
  await Promise.all(ids.map(async (id) => {
    try { raw.push(...(await searchers[id]!(name, country))); } catch { failed.push(id); }
    pending.delete(id);
    onPart?.({ raw: [...raw], failed: [...failed], pending: [...pending] });
  }));
  return { raw, failed };
}

/* ---------- F: carrito optimizado ---------- */

export interface CartItem { appid: number; name: string; steamUSD: number | null; offers: Offer[] }
export interface CartPlan {
  picks: { appid: number; name: string; store: StoreId | 'steam'; priceUSD: number; url: string }[];
  totalUSD: number;
  separateUSD: number;
  steamUSD: number;
}

/** Elige tienda por juego para que el total sea mínimo, contando que la parte fija de la comisión se paga una vez por pedido. */
export function planCart(items: CartItem[], pay: Pay | PayPrefs, fees: FeeTable = FEES): CartPlan {
  const prefs: PayPrefs = typeof pay === 'string' ? { pay } : pay;
  type Opt = { store: StoreId | 'steam'; net: number; url: string };
  const opts: Opt[][] = items.map((it) => {
    const o: Opt[] = [];
    const seen = new Set<StoreId>();
    for (const x of it.offers) {
      if (x.fit !== 'ok' || seen.has(x.store)) continue;
      seen.add(x.store);
      o.push({ store: x.store, net: round2(x.priceUSD - x.couponUSD), url: x.url });
    }
    if (it.steamUSD != null) o.push({ store: 'steam', net: it.steamUSD, url: `https://store.steampowered.com/app/${it.appid}/` });
    return o.sort((a, b) => a.net - b.net).slice(0, 4);
  });

  const cost = (choice: Opt[]) => {
    const per = new Map<string, number>();
    for (const c of choice) per.set(c.store, (per.get(c.store) ?? 0) + c.net);
    let t = 0;
    for (const [st, sub] of per) {
      if (st === 'steam') { t += sub; continue; }
      const f = fees[st as StoreId][payFor(prefs, st as StoreId)];
      t += sub + (sub * f.pct) / 100 + f.fixed;
    }
    return round2(t);
  };

  // Búsqueda exhaustiva: como mucho 4 opciones por juego y 8 juegos (65 536 combinaciones).
  const n = Math.min(items.length, 8);
  let best: Opt[] = [];
  let bestCost = Infinity;
  const cur: Opt[] = [];
  const walk = (i: number) => {
    if (i === n) {
      const c = cost(cur);
      if (c < bestCost) { bestCost = c; best = [...cur]; }
      return;
    }
    if (!opts[i].length) { walk(i + 1); return; }
    for (const o of opts[i]) { cur.push(o); walk(i + 1); cur.pop(); }
  };
  walk(0);

  const usable = items.slice(0, n).map((it, i) => ({ it, o: opts[i] })).filter((x) => x.o.length);
  const separate = round2(usable.reduce((t, { o }) => t + Math.min(...o.map((x) => cost([x]))), 0));
  const steam = round2(items.slice(0, n).reduce((t, it) => t + (it.steamUSD ?? 0), 0));
  const picks = usable.map(({ it }, k) => ({ appid: it.appid, name: it.name, store: best[k].store, priceUSD: best[k].net, url: best[k].url }));
  return { picks, totalUSD: bestCost === Infinity ? 0 : bestCost, separateUSD: separate, steamUSD: steam };
}
