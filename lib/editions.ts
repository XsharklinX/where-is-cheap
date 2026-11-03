// 10: ediciones que vende la ficha de Steam (Estándar, Deluxe, GOTY…), leídas de los bloques de compra.
import { norm } from './match';
import type { Edition } from './types';

/** «Comprar «ELDEN RING Deluxe Edition»» o «Buy ELDEN RING Deluxe Edition» → «ELDEN RING Deluxe Edition». */
export function editionTitle(h: string): string {
  const q = h.match(/«([^»]+)»/);
  if (q) return q[1].trim();
  return h.replace(/^\s*(buy|pre-purchase|pre-order|comprar|reservar|precompra(r)?)\s+/i, '').trim();
}

const SKIP = /\b(soundtrack|ost|artbook|art book|season pass|upgrade|demo|bundle|pack de|dlc)\b/i;

/** Precio de un bloque en USD a partir de sus atributos (centavos) y el texto del precio original. */
function blockPrice(el: Element): { usd: number | null; initial: number | null } {
  const fin = el.querySelector('[data-price-final]')?.getAttribute('data-price-final');
  const usd = fin != null && /^\d+$/.test(fin) ? Number(fin) / 100 : null;
  const orig = el.querySelector('.discount_original_price')?.textContent ?? '';
  const om = orig.match(/(\d+(?:[.,]\d{2})?)/);
  const initial = om ? Number(om[1].replace(',', '.')) : usd;
  return { usd, initial };
}

/**
 * Ediciones del juego en la ficha. La primera es la estándar (label «Estándar»). Solo bloques de paquete
 * (no los packs dinámicos), con precio, cuyo nombre empieza por el del juego. Vacío si solo hay una.
 */
export function readEditions(doc: ParentNode, baseName: string): Edition[] {
  const base = norm(baseName);
  const seen = new Set<string>();
  const out: Edition[] = [];
  for (const el of doc.querySelectorAll('#game_area_purchase .game_area_purchase_game')) {
    if (el.closest('.dynamic_bundle_description')) continue;
    if (!el.querySelector('form[name^="add_to_cart_"]')) continue;
    const name = editionTitle(el.querySelector('h1, h2.title, .title')?.textContent ?? '');
    const n = norm(name);
    if (!n.startsWith(base) || SKIP.test(name) || seen.has(n)) continue;
    const { usd, initial } = blockPrice(el);
    if (usd == null) continue;
    seen.add(n);
    // Lo que va detrás del nombre del juego; si Steam lo escribe distinto (™, mayúsculas), se saca del normalizado.
    const idx = name.toLowerCase().indexOf(baseName.toLowerCase());
    const rest = (idx >= 0 ? name.slice(idx + baseName.length) : n.slice(base.length).replace(/\b\w/g, (c) => c.toUpperCase()))
      .replace(/^[\s:–-]+/, '').trim();
    out.push({ name, label: n === base || !rest ? 'Estándar' : rest, steamUSD: usd, steamInitialUSD: initial });
  }
  // La estándar primero; si no se encuentra, no hay con qué comparar.
  const i = out.findIndex((e) => e.label === 'Estándar');
  if (i < 0 || out.length < 2) return [];
  return [out[i], ...out.filter((_, k) => k !== i)].slice(0, 5);
}
