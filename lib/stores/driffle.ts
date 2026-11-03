import type { Kind, RawOffer } from '../types';

// Buscador de Driffle. «platform» dice si es clave, regalo o cuenta.
// Moneda: desde fuera responde en EUR (el «mrp» coincide con el precio de Steam en euros).
// Pendiente comprobar en el navegador desde RD que no cambia a USD por la cookie de país.
export async function searchDriffle(query: string): Promise<RawOffer[]> {
  const r = await fetch(`https://search.driffle.com/search?q=${encodeURIComponent(query)}`, { credentials: 'omit' });
  if (!r.ok) throw new Error(`Driffle ${r.status}`);
  const d = await r.json();
  const list: any[] = Array.isArray(d?.data) ? d.data : [];
  return list
    .filter((p) => /^steam\b/i.test(p.platform ?? '') && Number(p.price) > 0 && !p.isPreReleased)
    .map((p): RawOffer => {
      const plat = String(p.platform).toLowerCase();
      const kind: Kind = plat.includes('account') ? 'account' : plat.includes('gift') ? 'gift' : 'key';
      return {
        store: 'driffle',
        title: String(p.title ?? ''),
        kind,
        regions: p.regionName ? [String(p.regionName)] : [],
        price: Number(p.price),
        currency: 'EUR',
        url: `https://driffle.com/${p.slug}`,
      };
    });
}
