// Todo lo que se guarda en el navegador. Nada sale de aquí salvo el nombre del juego que se busca.
import type { Coupon, HistoryPoint, StoreId } from './types';

async function get<T>(key: string, def: T): Promise<T> {
  const v = (await browser.storage.local.get(key))[key];
  return (v as T) ?? def;
}
const set = (key: string, v: unknown) => browser.storage.local.set({ [key]: v });

/* Q y E: lo que dice Steam de tu cuenta (se lee al visitar la tienda con sesión iniciada). */
export interface SteamUser { wishlist: number[]; owned: number[]; at: number }
export const getUser = () => get<SteamUser>('steamUser', { wishlist: [], owned: [], at: 0 });
export const setUser = (u: SteamUser) => set('steamUser', u);

/* D: historial por juego. */
export const getHistory = (appid: number) => get<HistoryPoint[]>(`hist:${appid}`, []);
export const setHistory = (appid: number, h: HistoryPoint[]) => set(`hist:${appid}`, h);

/* E: lista de deseos con límites y último precio visto. */
export interface WishItem { appid: number; name?: string; target?: number; lastBest?: number; lastStore?: StoreId; lastUrl?: string; steamUSD?: number | null; checkedAt?: number; notifiedAt?: number; notifiedPrice?: number }
export const getWish = () => get<Record<number, WishItem>>('wish', {});
export const setWish = (w: Record<number, WishItem>) => set('wish', w);

/* L: cupones que al usuario le funcionaron. */
export const getCoupons = () => get<Coupon[]>('coupons', []);
export const setCoupons = (c: Coupon[]) => set('coupons', c);

/* O: compras hechas desde «Ir». pending: se pulsó Ir, falta confirmar; bought: confirmado. */
export interface LedgerEntry { id: string; appid: number; name: string; store: StoreId; paidUSD: number; steamUSD: number | null; at: number; state: 'pending' | 'bought' | 'skipped' }
export const getLedger = () => get<LedgerEntry[]>('ledger', []);
export const setLedger = (l: LedgerEntry[]) => set('ledger', l);

/* Nombres de juegos ya consultados. */
export const getNames = () => get<Record<number, string>>('names', {});
export const setNames = (n: Record<number, string>) => set('names', n);
