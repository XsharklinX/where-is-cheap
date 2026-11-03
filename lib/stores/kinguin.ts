import type { Kind, RawOffer } from '../types';

// Buscador de Kinguin. Desde fuera del navegador lo bloquea Akamai; desde la extensión responde.
// Da la lista exacta de países donde activa cada producto (attributes.region.activationCountries).
// Moneda: se asume EUR (la API de Kinguin trabaja en euros). Pendiente confirmarlo desde RD.
const NO_OFFER = 1_000_000;

function regionFromTitle(t: string): string[] {
  const m: [RegExp, string][] = [[/\bLATAM\b/i, 'latam'], [/\b(EU|EUROPE)\b/i, 'europe'], [/\b(US|USA|NA)\b/, 'north america'], [/\bROW\b/, 'row'], [/\bRU\b|\bCIS\b/, 'cis'], [/\bASIA\b/i, 'asia'], [/\bTR\b|TURKEY/i, 'turkey'], [/\bUK\b/, 'united kingdom']];
  const hit = m.find(([r]) => r.test(t));
  return hit ? [hit[1]] : [];
}

export function parseKinguin(d: any, country: string): RawOffer[] {
  const list: any[] = d?._embedded?.products ?? [];
  return list
    .filter((p) => p?.attributes?.platform === 2 && p.price?.lowestOffer > 0 && p.price.lowestOffer < NO_OFFER)
    .filter((p) => !/\b(ps[45]|xbox|switch|origin|ea app|gog|epic|uplay|ubisoft)\b/i.test(p.name ?? ''))
    .map((p): RawOffer => {
      const name = String(p.name ?? '');
      const kind: Kind = /\baccount\b/i.test(name) ? 'account' : /\b(alter)?gift\b/i.test(name) ? 'gift' : 'key';
      const reg = p.attributes.region ?? {};
      const act: string[] = reg.activationCountries ?? [];
      const exc: string[] = reg.excludedCountries ?? [];
      const known = act.length > 0 || exc.length > 0;
      const ok = act.length ? act.includes(country) && !exc.includes(country) : exc.length ? !exc.includes(country) : false;
      return {
        store: 'kinguin',
        title: name,
        kind,
        regions: reg.id === 3 ? ['global'] : regionFromTitle(name),
        regionCheckedByStore: known && ok,
        regionBlockedByStore: known && !ok,
        dlc: p.attributes.marketingProductType ? p.attributes.marketingProductType === 'DLC' : undefined,
        price: p.price.lowestOffer / 100,
        currency: 'EUR',
        url: `https://www.kinguin.net/category/${p.externalId}/${p.attributes.urlKey ?? ''}`,
      };
    });
}

export async function searchKinguin(query: string, country: string): Promise<RawOffer[]> {
  const r = await fetch(`https://www.kinguin.net/services/library/api/v1/products/search?phrase=${encodeURIComponent(query)}&size=25`);
  if (!r.ok) throw new Error(`Kinguin ${r.status}`);
  return parseKinguin(await r.json(), country);
}

/** 10: un vendedor de Kinguin, tal como sale en la página del producto. */
export interface SellerNote { name: string; orders: number; rating: number }

/**
 * 10: la página del producto trae cada oferta con su vendedor («completedOrders», «merchantRating» de 0 a 1).
 * Devuelve el de la oferta con ese precio (en céntimos de euro) o, si no está, el de la más barata.
 */
export function parseKinguinSeller(html: string, cents?: number): SellerNote | null {
  const re = /"price":\{"amount":(\d+),"currency":"(\w+)"\},"unitPrice":\d+,"seller":\{"id":\d+,"name":"((?:[^"\\]|\\.)*)","merchantStatistics":\{"completedOrders":(\d+),"merchantRating":([\d.]+)\}/g;
  const list: (SellerNote & { amount: number })[] = [];
  for (let m = re.exec(html); m; m = re.exec(html)) {
    let name = m[3];
    try { name = JSON.parse(`"${m[3]}"`); } catch { /* se deja tal cual */ }
    list.push({ amount: Number(m[1]), name, orders: Number(m[4]), rating: Number(m[5]) });
  }
  if (!list.length) return null;
  const hit = (cents != null ? list.find((x) => x.amount === cents) : undefined) ?? list.reduce((a, b) => (b.amount < a.amount ? b : a));
  return { name: hit.name, orders: hit.orders, rating: hit.rating };
}
