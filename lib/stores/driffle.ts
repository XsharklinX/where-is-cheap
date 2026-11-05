import type { Kind, RawOffer } from '../types';

// Buscador de Driffle. «platform» dice si es clave, regalo o cuenta.
// Moneda: desde fuera responde en EUR (el «mrp» coincide con el precio de Steam en euros).
// Pendiente comprobar en el navegador desde RD que no cambia a USD por la cookie de país.
// 1.8.1: el buscador devuelve solo 8 resultados y no tiene páginas. Con «Elden Ring» salen 8 de Nightreign y el juego
// base no aparece; con «Haven», Haven Park y otros. Se busca también «<nombre> Steam Key» y «<nombre> Global», y se juntan.
async function driffleQuery(q: string): Promise<any[]> {
  const r = await fetch(`https://search.driffle.com/search?q=${encodeURIComponent(q)}`, { credentials: 'omit' });
  if (!r.ok) throw new Error(`Driffle ${r.status}`);
  const d = await r.json();
  return Array.isArray(d?.data) ? d.data : [];
}

export async function searchDriffle(query: string): Promise<RawOffer[]> {
  const parts = await Promise.allSettled([query, `${query} Steam Key`, `${query} Global`].map(driffleQuery));
  // Si falla la búsqueda principal, falla la tienda (para el registro y el estado); las otras dos solo suman.
  if (parts[0].status === 'rejected') throw parts[0].reason;
  const seen = new Set<string>();
  const list = parts.flatMap((p) => (p.status === 'fulfilled' ? p.value : [])).filter((p) => {
    const k = String(p.slug ?? p.productId);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
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
