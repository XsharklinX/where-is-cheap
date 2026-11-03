// 7 (fase D): juegos gratis. Los de Epic (el juego de la semana) y los de Steam que regalan para siempre.
// Se enseñan en la ventana y el background avisa si sale alguno de tu lista de deseos.

export interface FreeGame {
  name: string;
  url: string;
  img: string;
  store: 'epic' | 'steam';
  /** Cuándo deja de estar gratis (Epic). null si es para siempre (Steam). */
  until: number | null;
  /** appid de Steam, solo para los de Steam (para saber si está en tu lista). */
  appid?: number;
  /** El juego está en tu lista de deseos de Steam. */
  inWishlist?: boolean;
}

/** Los juegos de Epic que están gratis ahora mismo (las promos futuras o pasadas no cuentan). */
export function parseEpic(json: any, now = Date.now()): FreeGame[] {
  const elements: any[] = json?.data?.Catalog?.searchStore?.elements ?? [];
  const out: FreeGame[] = [];
  for (const el of elements) {
    if (!/base_game|bundle/i.test(String(el?.offerType ?? ''))) continue;
    const promo = el?.promotions?.promotionalOffers?.[0]?.promotionalOffers?.[0];
    if (!promo) continue;
    const start = Date.parse(promo.startDate);
    const end = Date.parse(promo.endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (now < start || now > end) continue;
    const name = String(el.title ?? '').trim();
    const slug = String(el.productSlug ?? '').trim();
    if (!name || !slug) continue;
    const img = (el.keyImages ?? []).find((k: any) => k?.type === 'Thumbnail')?.url ?? (el.keyImages ?? []).find((k: any) => k?.url)?.url ?? '';
    out.push({ name, url: `https://store.epicgames.com/es-ES/p/${encodeURIComponent(slug)}`, img: String(img), store: 'epic', until: end });
  }
  return out;
}

/** Los de Steam que ahora mismo salen gratis para quedártelos (maxprice=free con descuento del 100 %). */
export function parseSteamFree(json: any): FreeGame[] {
  const items: any[] = json?.items ?? [];
  const out: FreeGame[] = [];
  for (const it of items) {
    const name = String(it?.name ?? '').trim();
    const id = Number(it?.id);
    if (!name || !id) continue;
    out.push({ name, url: `https://store.steampowered.com/app/${id}/`, img: String(it?.logo ?? ''), store: 'steam', until: null, appid: id });
  }
  return out;
}
