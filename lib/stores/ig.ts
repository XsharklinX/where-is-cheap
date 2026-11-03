import type { RawOffer } from '../types';

// Búsqueda pública de Instant Gaming (Algolia). La clave es de solo lectura y exige el Referer de su web,
// que pone public/rules.json.
const APP = 'QKNHP8TC3Y';
const KEY = '93946b91c013211f842ddf1819ea880b';

export async function searchIG(query: string, country: string): Promise<RawOffer[]> {
  const filters = `(country_whitelist:"${country}" OR country_whitelist:"worldwide" OR country_whitelist:"WW") AND (NOT country_blacklist:"${country}")`;
  const params = new URLSearchParams({ query, hitsPerPage: '20', filters }).toString();
  const r = await fetch(`https://${APP.toLowerCase()}-dsn.algolia.net/1/indexes/produits_en/query`, {
    method: 'POST',
    headers: { 'X-Algolia-Application-Id': APP, 'X-Algolia-API-Key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ params }),
  });
  if (!r.ok) throw new Error(`Instant Gaming ${r.status}`);
  const d = await r.json();
  return (d.hits ?? [])
    .filter((h: any) => h.type === 'Steam' && !h.is_prepaid && !h.is_subscription && Number(h.price) > 0)
    .map(
      (h: any): RawOffer => ({
        store: 'ig',
        title: String(h.name ?? h.small_name ?? ''),
        kind: 'key',
        regions: h.country_whitelist ?? [String(h.region ?? '')],
        regionCheckedByStore: true,
        dlc: !!h.is_dlc,
        price: Number(h.price),
        currency: 'EUR',
        url: `https://www.instant-gaming.com/en/${h.prod_id}-buy-${h.seo_name}/`,
      }),
    );
}
