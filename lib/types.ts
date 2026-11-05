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
  /** 13: por qué la región sirve o no, para el globo de ayuda. */
  fitWhy: string;
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
  /** Steam tiene otro juego con exactamente el mismo nombre: las ofertas no se pueden atribuir con seguridad. */
  twin?: boolean;
}

export interface Rates {
  /** Unidades de cada moneda por 1 USD. */
  EUR: number;
  /** Pesos por dólar que pagas de verdad: la tasa del mercado más el recargo de tu banco. */
  DOP: number;
  /** Tasa del mercado, sin recargo. */
  DOPmarket?: number;
  /** Recargo aplicado a DOP, en %. */
  fxPct?: number;
  /** 1.4: monedas locales por 1 USD para mostrarlas en la que elijas (ARS, VES, MXN…). Incluye DOP. */
  fx?: Record<string, number>;
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
  /** 1: tiendas que aún no han respondido (la comparación llega por partes). */
  pending: StoreId[];
  /** 2: mínimo histórico de las tiendas oficiales, llevado al precio de Steam en RD. */
  low?: HistLow | null;
  /** 3: tiendas cuya comisión ya se comprobó con una compra real (fecha). */
  feesChecked: Partial<Record<StoreId, number>>;
  /** 10: nombre de la edición que se compara, si no es la estándar. */
  edition?: string;
  /** 1.5: fecha del último dato conocido si este resultado es una caché vieja que se está refrescando. */
  staleAt?: number;
}

/** 2: mínimo histórico (CheapShark, tiendas oficiales de EE. UU.) expresado como descuento. */
export interface HistLow {
  /** Descuento máximo visto sobre el precio normal, en %. */
  pct: number;
  /** Fecha del mínimo. */
  date: number;
  /** El mismo descuento aplicado al precio normal de Steam en RD, en USD. */
  usd: number | null;
}

export interface Coupon {
  id: string;
  store: StoreId;
  code: string;
  pct: number;
  /** Fecha en que el usuario dijo que le funcionó. */
  checkedAt: number;
  /** 4: fecha de caducidad, si la tiene. */
  expires?: number;
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
  /** Como mucho un aviso de bajadas generales cada tantas horas (6, 24 o 168). Los límites avisan al momento. */
  alertEvery: number;
  /** Avisos silenciados hasta esta fecha (0 = no). */
  mutedUntil: number;
  /** Detección de juegos fuera de Steam (pide permiso aparte). */
  detectAnywhere: boolean;
  /** 5: recargo del banco sobre la tasa del mercado al pagar en dólares con una tarjeta en pesos (%). 0 = tarjeta en dólares. */
  fxPct: number;
  /** 1.4: moneda local en que ver los precios (código ISO; por defecto DOP). */
  localCurrency: string;
  /** 1.7: tiendas que no quieres ver (menú «…» de cada fila). */
  hiddenStores: StoreId[];
  /** 1.7: vendedores de Kinguin que no quieres ver, por nombre. */
  hiddenSellers: string[];
  /** 1.7: ya pasó por los tres pasos de bienvenida. */
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  country: 'DO',
  pay: 'card',
  currency: 'both',
  marketplaces: true,
  accounts: false,
  dropAlerts: true,
  dropPct: 60,
  alertEvery: 24,
  mutedUntil: 0,
  detectAnywhere: false,
  fxPct: 0,
  localCurrency: 'DOP',
  hiddenStores: [],
  hiddenSellers: [],
  onboarded: false,
};

export const STORES: Record<StoreId, { name: string; short: string; color: string; marketplace: boolean }> = {
  ig: { name: 'Instant Gaming', short: 'IG', color: '#e5532e', marketplace: false },
  eneba: { name: 'Eneba', short: 'EN', color: '#6b4fe0', marketplace: true },
  driffle: { name: 'Driffle', short: 'DR', color: '#239e63', marketplace: true },
  kinguin: { name: 'Kinguin', short: 'KG', color: '#c9822a', marketplace: true },
};

export const STORE_IDS = Object.keys(STORES) as StoreId[];

/** 1.4: dónde ver los cupones vigentes de cada tienda (agregador externo, se abre en una pestaña). */
export const COUPON_URLS: Record<StoreId, string> = {
  ig: 'https://gg.deals/vouchers/instant-gaming',
  eneba: 'https://gg.deals/vouchers/eneba',
  driffle: 'https://gg.deals/vouchers/driffle',
  kinguin: 'https://gg.deals/vouchers/kinguin',
};

/** 1.4: monedas locales que se pueden elegir en Ajustes (código ISO, símbolo y nombre). */
export const CURRENCIES: Record<string, { symbol: string; name: string }> = {
  DOP: { symbol: 'RD$', name: 'Peso dominicano' },
  ARS: { symbol: 'AR$', name: 'Peso argentino' },
  VES: { symbol: 'Bs.', name: 'Bolívar venezolano' },
  MXN: { symbol: 'MX$', name: 'Peso mexicano' },
  COP: { symbol: 'COL$', name: 'Peso colombiano' },
  CLP: { symbol: 'CL$', name: 'Peso chileno' },
  PEN: { symbol: 'S/', name: 'Sol peruano' },
  UYU: { symbol: '$U', name: 'Peso uruguayo' },
  GTQ: { symbol: 'Q', name: 'Quetzal guatemalteco' },
  HNL: { symbol: 'L', name: 'Lempira hondureño' },
  NIO: { symbol: 'C$', name: 'Córdoba nicaragüense' },
  CRC: { symbol: '₡', name: 'Colón costarricense' },
  PYG: { symbol: '₲', name: 'Guaraní paraguayo' },
  BOB: { symbol: 'Bs', name: 'Boliviano' },
  PAB: { symbol: 'B/.', name: 'Balboa panameño' },
};

/** 10: otra edición del mismo juego, tal como la vende Steam en la ficha. */
export interface Edition { name: string; label: string; steamUSD: number | null; steamInitialUSD: number | null }

/** 7: resultado del buscador. */
export interface SearchHit { appid: number; name: string; img: string; steamUSD: number | null }

/** 9: cada juego de un pack, con su mejor precio suelto (fuera o en Steam). */
export interface BundleItem { appid: number; name: string; owned: boolean; store: StoreId | 'steam' | null; priceUSD: number | null; url: string }
