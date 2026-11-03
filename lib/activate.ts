// 5 (fase D): detectar claves de Steam en las páginas de pedido de las tiendas de claves y dar un botón para
// activarlas en Steam con un clic. Las claves son alfanuméricas en grupos de 5 separados por guiones: tres grupos
// (las de ahora) o cinco (las antiguas). Solo texto visible: lo lee el content script de document.body.innerText.

const STEAM_KEY = /(?:^|[^A-Z0-9-])([A-Z0-9]{5}(?:-[A-Z0-9]{5}){2}(?:(?:-[A-Z0-9]{5}){2})?)(?=$|[^A-Z0-9-])/gi;

/** Claves de Steam que aparecen en un texto, en mayúsculas y sin repetidas (en el orden en que salen). */
export function findKeys(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(STEAM_KEY)) {
    const k = m[1].toUpperCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/** Página de activación de Steam con la clave ya puesta. */
export const activationURL = (key: string) => `https://store.steampowered.com/account/registerkey?key=${encodeURIComponent(key)}`;
