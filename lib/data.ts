// Todo lo que se guarda en el navegador. Nada sale de aquí salvo el nombre del juego que se busca.
import type { Learned } from './fees';
import type { Coupon, HistoryPoint, Pay, StoreId } from './types';

async function get<T>(key: string, def: T): Promise<T> {
  const v = (await browser.storage.local.get(key))[key];
  return (v as T) ?? def;
}
const set = (key: string, v: unknown) => browser.storage.local.set({ [key]: v });

/* Q y E: lo que dice Steam de tu cuenta (se lee al visitar la tienda con sesión iniciada). */
export interface SteamUser { wishlist: number[]; owned: number[]; at: number }
export const getUser = () => get<SteamUser>('steamUser', { wishlist: [], owned: [], at: 0 });
export const setUser = (u: SteamUser) => set('steamUser', u);
/** Resultado de la última lectura de la cuenta, para explicar en la interfaz por qué no hay lista. */
export interface SteamStatus { status: 'ok' | 'empty' | 'logged-out' | 'error'; at: number; error?: string; source?: string; wishlist?: number; owned?: number }
export const getSteamStatus = () => get<SteamStatus | null>('steamStatus', null);
export const setSteamStatus = (s: SteamStatus) => set('steamStatus', s);

/* D: historial por juego. */
export const getHistory = (appid: number) => get<HistoryPoint[]>(`hist:${appid}`, []);
export const setHistory = (appid: number, h: HistoryPoint[]) => set(`hist:${appid}`, h);

/* E: lista de deseos con límites y último precio visto. */
export interface WishItem { appid: number; name?: string; target?: number; lastBest?: number; lastStore?: StoreId; lastUrl?: string; steamUSD?: number | null; steamInitialUSD?: number | null; steamDiscount?: number; checkedAt?: number; notifiedAt?: number; notifiedPrice?: number }
export const getWish = () => get<Record<number, WishItem>>('wish', {});
export const setWish = (w: Record<number, WishItem>) => set('wish', w);

/* L: cupones que al usuario le funcionaron. */
export const getCoupons = () => get<Coupon[]>('coupons', []);
export const setCoupons = (c: Coupon[]) => set('coupons', c);

/* O: compras hechas desde «Ir». pending: se pulsó Ir, falta confirmar; bought: confirmado. */
export interface LedgerEntry {
  id: string; appid: number; name: string; store: StoreId; paidUSD: number; steamUSD: number | null; at: number; state: 'pending' | 'bought' | 'skipped';
  /** 3: para aprender la comisión. Precio sin comisión (ya con cupón) en la moneda de la tienda, esa moneda y con qué se pagó. */
  net?: number; currency?: 'USD' | 'EUR'; pay?: Pay;
  /** true si el total lo escribió el usuario (y no es la estimación). */
  paidConfirmed?: boolean;
  /** 1.4: si ya tenías el juego cuando pulsaste «Ir». false = no lo tenías (se puede auto-confirmar si luego aparece en tu biblioteca). */
  ownedAtClick?: boolean;
  /** 1.8 (9): cuándo se preguntó «¿Activaste la clave?» (una vez por entrada). */
  keyAsked?: number;
}
export const getLedger = () => get<LedgerEntry[]>('ledger', []);
export const setLedger = (l: LedgerEntry[]) => set('ledger', l);

/** 1.4: compras que se dan por hechas solas: las que no tenías al pulsar «Ir» y ahora están en tu biblioteca. */
export const autoBoughtIds = (ledger: LedgerEntry[], owned: number[]) =>
  ledger.filter((e) => e.state === 'pending' && e.ownedAtClick === false && owned.includes(e.appid)).map((e) => e.id);

/** 1.8 (9): una clave que fuiste a comprar hace más de 3 días y que sigue sin estar en tu biblioteca. Una vez por entrada. */
export function keyToRemind(ledger: LedgerEntry[], owned: number[], now = Date.now()): LedgerEntry | undefined {
  const DAYMS = 86_400_000;
  return ledger.find((x) => x.ownedAtClick === false && x.state !== 'skipped' && !x.keyAsked
    && now - x.at > 3 * DAYMS && now - x.at < 30 * DAYMS && !owned.includes(x.appid));
}

/* Nombres de juegos ya consultados. */
export const getNames = () => get<Record<number, string>>('names', {});
export const setNames = (n: Record<number, string>) => set('names', n);

/* 3: compras confirmadas con su total real, para calcular la comisión de cada tienda. */
export const getLearned = () => get<Learned>('feesLearned', {});
export const setLearned = (l: Learned) => set('feesLearned', l);
