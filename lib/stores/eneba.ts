import type { Kind, RawOffer } from '../types';

// Eneba pinta su búsqueda en el servidor y deja los resultados de Algolia en <script id="__ALGOLIA_STATE__">.
// El país y la moneda salen de la propia petición (desde RD: DO y USD).
export function parseEnebaHtml(html: string): RawOffer[] {
  const m = html.match(/<script id="__ALGOLIA_STATE__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Eneba cambió su página');
  const state = JSON.parse(m[1]);
  const first: any = Object.values(state.responses ?? {})[0];
  const hits: any[] = first?.results?.[0]?.hits ?? [];
  return hits
    .filter((h) => h.drmName === 'steam' && (h.productType === 'game' || h.productType === 'dlc') && h.stockAvailable && h.lowestPrice?.USD > 0)
    .map((h): RawOffer => {
      const title: string = h.translations?.en_US?.name ?? h.translations?.en?.name ?? '';
      const kind: Kind = /\bgift\b/i.test(title) ? 'gift' : /\baccount\b/i.test(title) ? 'account' : 'key';
      return {
        store: 'eneba',
        title,
        kind,
        regions: h.productRegions ?? [],
        dlc: h.productType === 'dlc',
        price: h.lowestPrice.USD / 100,
        currency: 'USD',
        url: `https://www.eneba.com/${h.slug}`,
      };
    });
}

async function enebaQuery(query: string, extra = ''): Promise<RawOffer[]> {
  const r = await fetch(`https://www.eneba.com/store/all?drms%5B%5D=steam&text=${encodeURIComponent(query)}${extra}`);
  if (!r.ok) throw new Error(`Eneba ${r.status}`);
  return parseEnebaHtml(await r.text());
}

// 1.8.1: la búsqueda da 20 resultados, mezclando DLC, ediciones y regiones que no activan en RD (Europa, Asia…).
// Una segunda, solo con las regiones que sirven (LATAM y global), saca las claves que se quedaban fuera. Se juntan.
export async function searchEneba(query: string): Promise<RawOffer[]> {
  const [main, rd] = await Promise.allSettled([enebaQuery(query), enebaQuery(query, '&regions%5B%5D=latam&regions%5B%5D=global')]);
  if (main.status === 'rejected') throw main.reason;
  const seen = new Set<string>();
  return [...main.value, ...(rd.status === 'fulfilled' ? rd.value : [])].filter((o) => !seen.has(o.url) && !!seen.add(o.url));
}
