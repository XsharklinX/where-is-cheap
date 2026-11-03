export type StoreId = 'ig' | 'eneba' | 'driffle' | 'kinguin';
export type Kind = 'key' | 'gift' | 'account';
export type Fit = 'ok' | 'no' | 'warn';
export type Pay = 'card' | 'paypal';

/** Oferta tal como sale de la tienda, sin convertir. */
export interface RawOffer {
  store: StoreId;
  title: string;
  kind: Kind;
  /** Etiquetas de región tal como las da la tienda («global», «Europe», «latam»…). */
  regions: string[];
  /** La tienda ya dijo si activa en el país del usuario (Instant Gaming filtra, Kinguin da la lista de países). */
  regionCheckedByStore?: boolean;
  regionBlockedByStore?: boolean;
  /** true si la tienda dice que es un DLC; undefined si no lo dice. */
  dlc?: boolean;
  price: number;
  currency: 'USD' | 'EUR';
  url: string;
}

export interface Offer extends RawOffer {
  priceUSD: number;
  /** Descuento del cupón del usuario, en USD (0 si no hay). */
  couponUSD: number;
  coupon?: string;
  feeUSD: number;
  totalUSD: number;
  fit: Fit;
  fitText: string;
  /** Mucho más barato que el resto en un marketplace: posible clave robada o revocable. */
  suspicious?: boolean;
}

export interface Game {
  appid: number;
  name: string;
  /** Precio actual en Steam para la región del usuario, en USD. null si no se vende. */
  steamUSD: number | null;
  /** Precio sin rebaja en Steam. */
  steamInitialUSD?: number | null;
  steamDiscount?: number;
  isFree: boolean;
  isDlc?: boolean;
  /** appid del juego base si es un DLC. */
  baseAppid?: number;
}

export interface Rates {
  /** Unidades de cada moneda por 1 USD. */
  EUR: number;
  DOP: number;
  at: number;
  fallback: boolean;
}

export interface HistoryPoint {
  t: number;
  steam: number | null;
  best: number | null;
  store?: StoreId;
}

export interface Verdict {
  kind: 'buy' | 'wait' | 'none';
  title: string;
  detail: string;
}

export interface Compare {
  game: Game;
  offers: Offer[];
  failed: StoreId[];
  rates: Rates;
  pay: Pay;
  at: number;
  history: HistoryPoint[];
  verdict: Verdict;
  owned: boolean;
  /** Para DLC: si el usuario tiene el juego base. null si no se sabe. */
  ownsBase: boolean | null;
}

export interface Coupon {
  id: string;
  store: StoreId;
  code: string;
  pct: number;
  /** Fecha en que el usuario dijo que le funcionó. */
  checkedAt: number;
}

export interface Settings {
  country: 'DO';
  pay: Pay;
  currency: 'both' | 'usd' | 'dop';
  marketplaces: boolean;
  accounts: boolean;
  /** Avisar cuando un juego de la lista de deseos baja mucho (además de los límites puestos a mano). */
  dropAlerts: boolean;
  /** % mínimo de descuento frente a Steam para el aviso general. */
  dropPct: number;
  /** Detección de juegos fuera de Steam (pide permiso aparte). */
  detectAnywhere: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  country: 'DO',
  pay: 'card',
  currency: 'both',
  marketplaces: true,
  accounts: false,
  dropAlerts: true,
  dropPct: 60,
  detectAnywhere: false,
};

export const STORES: Record<StoreId, { name: string; short: string; color: string; marketplace: boolean }> = {
  ig: { name: 'Instant Gaming', short: 'IG', color: '#e5532e', marketplace: false },
  eneba: { name: 'Eneba', short: 'EN', color: '#6b4fe0', marketplace: true },
  driffle: { name: 'Driffle', short: 'DR', color: '#239e63', marketplace: true },
  kinguin: { name: 'Kinguin', short: 'KG', color: '#c9822a', marketplace: true },
};

export const STORE_IDS = Object.keys(STORES) as StoreId[];
