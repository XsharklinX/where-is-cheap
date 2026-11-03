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

export async function searchEneba(query: string): Promise<RawOffer[]> {
  const r = await fetch(`https://www.eneba.com/store/all?drms%5B%5D=steam&text=${encodeURIComponent(query)}`);
  if (!r.ok) throw new Error(`Eneba ${r.status}`);
  return parseEnebaHtml(await r.text());
}
