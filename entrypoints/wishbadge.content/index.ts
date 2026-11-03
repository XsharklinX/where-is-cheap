import { call } from '@/lib/api';
import type { StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';

// 9 y 1: el mejor precio fuera de Steam en los listados de Steam.
// - Lista de deseos y búsqueda: píldora junto al nombre; lo que no se conoce se busca en vivo («Buscando precio…»).
// - Portada, categorías, carruseles y recomendaciones: una etiqueta pequeña en la esquina de la cápsula. Solo se busca
//   en vivo lo que se queda a la vista un momento, y como mucho 40 juegos por página, para no cargar a las tiendas.
type Badge = { best: number | null; store: StoreId | null; url: string | null; steamUSD: number | null };

const CSS = `
.wic-badge { display: flex; align-items: center; gap: 6px; margin: 6px 0 2px; font: 600 12px "Segoe UI", system-ui, sans-serif; background: #18151b;
  border: 1px solid rgba(255,181,71,.5); color: #f3eee8 !important; border-radius: 99px; padding: 2px 10px 2px 3px; text-decoration: none !important; line-height: 18px; width: max-content; }
.wic-badge:hover { border-color: #ffb547; }
.wic-badge img { width: 18px; height: 18px; border-radius: 50%; display: block; }
.wic-badge b { font-family: "Cascadia Mono", ui-monospace, Consolas, monospace; color: #ffb547; }
.wic-badge .p { background: #45d69b; color: #0d2a1d; border-radius: 4px; padding: 0 4px; font-size: 11px; }
.wic-badge.st { border-color: #3a3440; color: #a69ea6 !important; padding-left: 10px; }
.wic-badge.wait { font-weight: 400; font-style: italic; }
.wic-cap { position: absolute !important; left: 6px; top: 6px; z-index: 5; margin: 0; padding: 1px 7px 1px 2px; font-size: 11px; line-height: 16px; box-shadow: 0 4px 12px rgba(0,0,0,.5); pointer-events: auto; }
.wic-cap img { width: 16px; height: 16px; }
`;

const usd = (n: number) => `$${n.toFixed(2)}`;
const appidOf = (href: string | null | undefined) => Number(href?.match(/\/app\/(\d+)/)?.[1]) || 0;

export default defineContentScript({
  matches: ['https://store.steampowered.com/*'],
  runAt: 'document_idle',
  async main() {
    // null: ya se buscó y no hay nada que enseñar (gratis, ya lo tienes o Steam no respondió).
    let data: Record<number, Badge | null> = {};
    try { data = await call<Record<number, Badge>>('wishBadges'); } catch { return; }
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);

    const onWishlist = location.pathname.startsWith('/wishlist/');
    const onSearch = location.pathname.startsWith('/search');
    const onApp = /^\/app\/(\d+)/.exec(location.pathname)?.[1];

    const waiting = (appid: number) => {
      const s = document.createElement('span');
      s.className = 'wic-badge st wait';
      s.dataset.wic = String(appid);
      s.dataset.wait = '1';
      s.textContent = 'Buscando precio…';
      return s;
    };

    const badge = (appid: number, small: boolean): HTMLElement | null => {
      const d = data[appid];
      if (!d) return null;
      const a = document.createElement('a');
      a.dataset.wic = String(appid);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      if (d.best != null && d.store && d.url && (d.steamUSD == null || d.best < d.steamUSD)) {
        const pct = d.steamUSD ? Math.round((1 - d.best / d.steamUSD) * 100) : 0;
        a.className = small ? 'wic-badge wic-cap' : 'wic-badge';
        a.href = d.url;
        a.title = `Lo más barato que vio Where is cheap: ${usd(d.best)} en ${STORES[d.store].name}`;
        const img = document.createElement('img');
        img.src = browser.runtime.getURL(`/stores/${d.store}.png` as any);
        img.alt = '';
        const b = document.createElement('b');
        b.textContent = usd(d.best);
        a.append(img, b);
        if (!small) a.append(` en ${STORES[d.store].name}`);
        if (pct > 0) { const p = document.createElement('span'); p.className = 'p'; p.textContent = `−${pct}%`; a.append(p); }
      } else if (d.steamUSD != null) {
        // En las cápsulas no se pone nada si Steam gana: sería ruido encima de la imagen.
        if (small) return null;
        a.className = 'wic-badge st';
        a.href = `https://store.steampowered.com/app/${appid}/`;
        a.textContent = 'Steam es lo más barato';
      } else return null;
      // Que el clic abra la oferta y no la fila o la cápsula de Steam.
      a.addEventListener('click', (e) => e.stopPropagation());
      return a;
    };

    /* ---------- búsqueda en vivo ---------- */
    const queue: number[] = [];
    const asked = new Set<number>();
    let running = 0;
    let budget = onWishlist || onSearch ? Infinity : 40;
    const stillShown = (appid: number) => !!document.querySelector(`[data-wic-want="${appid}"]`);
    const pump = () => {
      while (running < 2 && queue.length) {
        const appid = queue.shift()!;
        // Si al llegar su turno ya no se ve (hiciste scroll), se suelta y se vuelve a pedir cuando reaparezca.
        if (!stillShown(appid)) { asked.delete(appid); continue; }
        running++;
        budget--;
        call<Badge | null>('badgeFor', { appid })
          .then((r) => { data[appid] = r; }, () => { data[appid] = null; })
          .finally(() => { running--; scan(); pump(); });
      }
    };
    const want = (appid: number) => {
      if (appid in data || asked.has(appid) || budget <= 0) return;
      asked.add(appid);
      queue.push(appid);
    };

    /* ---------- dónde va cada píldora ---------- */
    /** El enlace con el nombre del juego: lleva a /app/, no tiene imagen y no es el precio. */
    const titleLink = (row: Element) => [...row.querySelectorAll<HTMLAnchorElement>('a[href*="/app/"]')]
      .find((a) => !a.dataset.wic && !a.querySelector('img') && a.textContent!.trim() && !/^([\s$€£¥\d.,%−-]+|free( to play)?|gratis|gratuito)$/i.test(a.textContent!.trim()));

    /** Pone (o cambia, si la fila se recicló) la píldora de appid dentro de host. */
    const place = (host: HTMLElement, appid: number, put: (b: HTMLElement) => void, small: boolean, live: boolean) => {
      const have = host.querySelector<HTMLElement>('[data-wic]');
      if (have && Number(have.dataset.wic) === appid && !(have.dataset.wait && appid in data)) return;
      if (have) have.replaceWith();
      host.dataset.wicWant = String(appid);
      if (appid in data) {
        const b = badge(appid, small);
        if (b) put(b);
      } else if (live) {
        if (!small) put(waiting(appid));
        want(appid);
      }
    };

    // Las cápsulas solo se buscan en vivo si se quedan a la vista un momento (no al pasar de largo con el scroll).
    const timers = new Map<Element, number>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        if (e.isIntersecting) timers.set(el, window.setTimeout(() => { timers.delete(el); el.dataset.wicVisible = '1'; scan(); }, 900));
        else { clearTimeout(timers.get(el)); timers.delete(el); delete el.dataset.wicVisible; }
      }
    });
    const watched = new WeakSet<Element>();

    const scan = () => {
      if (onWishlist) {
        for (const row of document.querySelectorAll<HTMLElement>('[data-index]')) {
          const t = titleLink(row);
          const appid = appidOf(t?.href);
          if (!t || !appid) continue;
          place(row, appid, (b) => t.after(b), false, true);
        }
        pump();
        return;
      }
      if (onSearch) {
        for (const row of document.querySelectorAll<HTMLAnchorElement>('a.search_result_row[data-ds-appid]')) {
          const appid = Number(row.dataset.dsAppid);
          const name = row.querySelector('.search_name');
          if (!appid || !name) continue;
          place(row, appid, (b) => name.append(b), false, true);
        }
      }
      // Cápsulas: enlaces a /app/ con imagen y de un tamaño razonable (no iconos pequeños).
      for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href*="/app/"]')) {
        if (a.matches('.search_result_row') || a.dataset.wic || !a.querySelector('img')) continue;
        const appid = appidOf(a.getAttribute('href'));
        if (!appid || String(appid) === onApp) continue;
        if (a.getBoundingClientRect().width < 120) continue;
        if (!watched.has(a)) { watched.add(a); io.observe(a); }
        if (getComputedStyle(a).position === 'static') a.style.position = 'relative';
        place(a, appid, (b) => a.append(b), true, a.dataset.wicVisible === '1');
      }
      pump();
    };
    let queued = 0;
    new MutationObserver(() => { if (!queued) queued = window.setTimeout(() => { queued = 0; scan(); }, 250); }).observe(document.body, { childList: true, subtree: true });
    scan();
  },
});
