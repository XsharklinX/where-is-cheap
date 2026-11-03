// C: posibles nombres de juego en una página. Solo se usan señales de que la página trata de un videojuego:
// nunca el título de una página cualquiera (correo, banco…), que no debe salir del navegador.

const JUNK = /\b(official|trailer|teaser|gameplay|walkthrough|review|análisis|analisis|reseña|let'?s play|part \d+|parte \d+|episode \d+|ep\.? ?\d+|4k|1080p|60fps|pc|ps5|ps4|xbox|switch|guide|guía|tips|news|update|launch|announcement|reveal|dlc|patch|vs\.?)\b/gi;

/** Webs dedicadas a videojuegos: en ellas el título de la página sí es una señal. */
const GAME_SITES = /(^|\.)(metacritic\.com|opencritic\.com|ign\.com|gamespot\.com|pcgamer\.com|rockpapershotgun\.com|eurogamer\.(net|es)|3djuegos\.com|vandal\.elespanol\.com|meristation\.as\.com|howlongtobeat\.com|igdb\.com|protondb\.com|steamdb\.info|pcgamingwiki\.com|isthereanydeal\.com|gg\.deals|backloggd\.com)$/;

export function cleanCandidate(s: string): string {
  return s
    .replace(/\s*[-|–—:•·]\s*(youtube|twitch|reddit|ign|metacritic|steam|wikipedia).*$/i, '')
    .split(/\s[-|–—•·]\s|\s\(|\s\[|[!?¡¿]/)[0]
    .replace(JUNK, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ficha de Wikipedia de un videojuego: la tabla lateral tiene «Plataforma» y «Distribuidora/Publisher». */
function isWikipediaGame(doc: Document, host: string): boolean {
  if (!/(^|\.)wikipedia\.org$/.test(host)) return false;
  const box = doc.querySelector('.infobox')?.textContent ?? '';
  return /platform/i.test(box) && /(publisher|distribuidora|editor)/i.test(box) || /plataforma/i.test(box) && /(distribuidora|editor)/i.test(box);
}

export function candidates(doc: Document, url: string): string[] {
  const out: string[] = [];
  const push = (v?: string | null) => {
    const c = v ? cleanCandidate(v) : '';
    if (c.length >= 3 && c.length <= 60 && !out.includes(c)) out.push(c);
  };

  // 1. Datos estructurados: VideoGame en JSON-LD.
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      const walk = (n: any) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(walk);
        const t = [].concat(n['@type'] ?? []).join(' ');
        if (/VideoGame/.test(t) && typeof n.name === 'string') push(n.name);
        if (n['@graph']) walk(n['@graph']);
      };
      walk(JSON.parse(s.textContent ?? ''));
    } catch { /* JSON roto en la página */ }
  });

  const host = new URL(url).hostname;
  // 2. Sitios con el juego marcado: tarjeta de juego de YouTube, categoría de Twitch.
  if (/(^|\.)youtube\.com$/.test(host)) push(doc.querySelector('ytd-rich-metadata-renderer #title')?.textContent);
  if (/(^|\.)twitch\.tv$/.test(host)) push(doc.querySelector('[data-a-target="stream-game-link"]')?.textContent);

  // 3. Título de la página, solo en webs de videojuegos o en fichas de videojuego de Wikipedia.
  if (GAME_SITES.test(host) || isWikipediaGame(doc, host)) {
    push(doc.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content);
    push(doc.title);
  }
  return out;
}
