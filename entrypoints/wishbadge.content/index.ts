import { call } from '@/lib/api';
import type { StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';
import { claimPage } from '@/lib/claim';

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
/* 1.7 (6): en la lista de deseos, un bloque de precio con la forma del de Steam, pegado a su precio */
.wic-wl { display: inline-flex; align-items: stretch; height: 34px; margin: 0 8px 0 0; vertical-align: middle; align-self: center; border-radius: 2px; overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(255,181,71,.55); text-decoration: none !important; font-family: "Motiva Sans", Arial, sans-serif; flex: none; }
.wic-wl:hover { box-shadow: inset 0 0 0 1px #ffb547; }
.wic-wl .k { background: rgba(255,181,71,.16); color: #e4c48c; font: 700 9.5px Arial, sans-serif; letter-spacing: .08em; padding: 0 7px; display: flex; align-items: center; gap: 5px; }
.wic-wl .k img { width: 15px; height: 15px; border-radius: 3px; display: block; }
.wic-wl .d { background: #4c6b22; color: #beee11; font-size: 17px; padding: 0 6px; display: flex; align-items: center; }
.wic-wl .v { background: #2a2318; color: #ffb547; font-size: 15px; padding: 0 9px; display: flex; align-items: center; }
.wic-wl.st { box-shadow: inset 0 0 0 1px rgba(103,193,245,.3); }
.wic-wl.st .k { background: rgba(103,193,245,.12); color: #8fb8d6; }
.wic-wl.wait .k { font-style: italic; letter-spacing: 0; font-weight: 400; font-size: 11px; }
/* 1.7 (5): en las sugerencias del buscador de Steam, al lado del precio */
.wic-sg { display: inline-flex; align-items: center; gap: 4px; margin-left: 8px; color: #ffb547 !important; font: 700 12px "Motiva Sans", Arial, sans-serif; text-decoration: none !important; white-space: nowrap; }
.wic-sg img { width: 13px; height: 13px; border-radius: 3px; }
/* 1.8 (8): la campana del aviso de precio, junto al bloque */
.wic-wlw { position: relative; display: inline-flex; align-items: center; gap: 4px; margin: 0 8px 0 0; vertical-align: middle; align-self: center; flex: none; }
.wic-wlw .wic-wl { margin: 0; }
.wic-bell { width: 30px; height: 34px; display: grid; place-items: center; border: 0; border-radius: 2px; background: rgba(103,193,245,.12); color: #8fb8d6; cursor: pointer; padding: 0; }
.wic-bell:hover { background: rgba(103,193,245,.25); color: #fff; }
.wic-bell.on { background: rgba(255,181,71,.18); color: #ffb547; }
.wic-pop { position: absolute; top: calc(100% + 6px); right: 0; z-index: 50; width: 250px; background: #17141a; border: 1px solid #2c2730; border-radius: 6px; padding: 10px 11px;
  box-shadow: 0 10px 28px rgba(0,0,0,.55), inset 3px 0 0 #ffb547; font: 12.5px "Motiva Sans", Arial, sans-serif; color: #c6d4df; cursor: default; }
.wic-pop label { display: block; color: #fff; margin-bottom: 6px; }
.wic-pop .r { display: flex; gap: 6px; align-items: center; }
.wic-pop .in { flex: 1; display: flex; align-items: center; gap: 3px; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.14); border-radius: 2px; padding: 0 7px; color: #9aa4ad; }
.wic-pop input { width: 100%; background: none; border: 0; color: #fff; font: inherit; padding: 6px 0; outline: none; }
.wic-pop button { border: 0; border-radius: 2px; padding: 6px 10px; font: 700 12px "Motiva Sans", Arial, sans-serif; cursor: pointer; }
.wic-pop .sv { background: linear-gradient(to right, #ffc76a 5%, #f2a43a 95%); color: #2a1a00; }
.wic-pop .rm { background: none; color: #67c1f5; padding: 6px 2px; font-weight: 400; }
.wic-pop small { display: block; margin-top: 6px; color: #9aa4ad; font-size: 11.5px; }
`;
const BELL = (on: boolean) => `<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4" fill="none"/></svg>`;

const usd = (n: number) => `$${n.toFixed(2)}`;
const appidOf = (href: string | null | undefined) => Number(href?.match(/\/app\/(\d+)/)?.[1]) || 0;

export default defineContentScript({
  matches: ['https://store.steampowered.com/*'],
  runAt: 'document_idle',
  async main(ctx) {
    if (!claimPage(ctx, 'badges')) return;
    // null: ya se buscó y no hay nada que enseñar (gratis, ya lo tienes o Steam no respondió).
    let data: Record<number, Badge | null> = {};
    try { data = await call<Record<number, Badge>>('wishBadges'); } catch { return; }
    // 1.8 (8): avisos ya puestos (para la campana llena).
    let targets: Record<number, number> = {};
    if (location.pathname.startsWith('/wishlist/')) targets = await call<Record<number, number>>('targets').catch(() => ({}));
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);

    const onWishlist = location.pathname.startsWith('/wishlist/');
    const onSearch = location.pathname.startsWith('/search');
    const onApp = /^\/app\/(\d+)/.exec(location.pathname)?.[1];

    const waiting = (appid: number) => {
      const s = document.createElement('span');
      if (onWishlist) {
        s.className = 'wic-wl st wait';
        s.innerHTML = '<span class="k">Buscando precio fuera…</span>';
        s.dataset.wic = String(appid);
        s.dataset.wait = '1';
        return s;
      }
      s.className = 'wic-badge st wait';
      s.dataset.wic = String(appid);
      s.dataset.wait = '1';
      s.textContent = 'Buscando precio…';
      return s;
    };

    /** 6: el bloque de la lista de deseos. */
    const wlBlock = (appid: number): HTMLElement | null => {
      const d = data[appid];
      if (!d) return null;
      const a = document.createElement('a');
      a.dataset.wic = String(appid);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      if (d.best != null && d.store && d.url && (d.steamUSD == null || d.best < d.steamUSD)) {
        const pct = d.steamUSD ? Math.round((1 - d.best / d.steamUSD) * 100) : 0;
        a.className = 'wic-wl';
        a.href = d.url;
        a.title = `Lo más barato fuera de Steam: ${usd(d.best)} en ${STORES[d.store].name}, activa en RD`;
        a.innerHTML = `<span class="k"><img src="${browser.runtime.getURL(`/stores/${d.store}.png` as any)}" alt="">FUERA</span>${pct > 0 ? `<span class="d">-${pct}%</span>` : ''}<span class="v">${usd(d.best)}</span>`;
      } else if (d.steamUSD != null) {
        a.className = 'wic-wl st';
        a.href = `https://store.steampowered.com/app/${appid}/`;
        a.title = 'Fuera de Steam no hay nada más barato que active en RD';
        a.innerHTML = '<span class="k">STEAM ES LO MÁS BARATO</span>';
      } else return null;
      a.addEventListener('click', (e) => e.stopPropagation());
      // 1.8 (8): el bloque y la campana van juntos; el data-wic va en el envoltorio.
      delete a.dataset.wic;
      const w = document.createElement('span');
      w.className = 'wic-wlw';
      w.dataset.wic = String(appid);
      w.append(a, bell(appid, d.best ?? d.steamUSD));
      return w;
    };

    /** 1.8 (8): «Avísame si baja de…» desde la lista de deseos, con el mismo aviso que la ficha. */
    const bell = (appid: number, now: number | null): HTMLElement => {
      const b = document.createElement('button');
      b.type = 'button';
      const paint = () => {
        const t = targets[appid];
        b.className = `wic-bell${t != null ? ' on' : ''}`;
        b.title = t != null ? `Te avisamos si baja de ${usd(t)}` : 'Avísame si baja de un precio';
        b.setAttribute('aria-label', b.title);
        b.innerHTML = BELL(t != null);
      };
      paint();
      const close = () => b.parentElement?.querySelector('.wic-pop')?.remove();
      b.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const w = b.parentElement!;
        if (w.querySelector('.wic-pop')) { close(); return; }
        document.querySelectorAll('.wic-pop').forEach((p) => p.remove());
        const t = targets[appid];
        const pop = document.createElement('form');
        pop.className = 'wic-pop';
        pop.innerHTML = `<label for="wic-t-${appid}">Avísame si baja de</label><div class="r"><span class="in">$<input id="wic-t-${appid}" type="number" min="0.5" step="0.5" inputmode="decimal" value="${t != null ? t.toFixed(2) : ''}" placeholder="${now != null ? (Math.floor(now * 0.8 * 2) / 2).toFixed(2) : ''}"></span><button type="submit" class="sv">Guardar</button>${t != null ? '<button type="button" class="rm">Quitar</button>' : ''}</div><small>${now != null ? `Hoy, lo más barato: ${usd(now)}. ` : ''}Te llega una notificación del navegador.</small>`;
        ['click', 'mousedown', 'pointerdown', 'keydown'].forEach((ev) => pop.addEventListener(ev, (x) => x.stopPropagation()));
        const inp = pop.querySelector('input')!;
        pop.addEventListener('submit', async (x) => {
          x.preventDefault();
          const n = Number(inp.value);
          if (!(n > 0)) { inp.setCustomValidity('Pon un precio mayor que 0'); inp.reportValidity(); return; }
          const v = Math.round(n * 100) / 100;
          try { await call('setTarget', { appid, target: v, name: titleOf(w) }); targets[appid] = v; paint(); close(); } catch { inp.setCustomValidity('No se pudo guardar'); inp.reportValidity(); }
        });
        pop.querySelector('.rm')?.addEventListener('click', async () => {
          try { await call('setTarget', { appid, target: null }); delete targets[appid]; paint(); close(); } catch { /* se queda abierto */ }
        });
        w.append(pop);
        inp.focus();
      });
      return b;
    };
    const titleOf = (w: Element) => {
      const row = w.closest('[data-index]');
      return row ? titleLink(row)?.textContent?.trim() : undefined;
    };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.wic-pop').forEach((p) => p.remove()); });
    document.addEventListener('click', (e) => { if (!(e.target as Element).closest?.('.wic-wlw')) document.querySelectorAll('.wic-pop').forEach((p) => p.remove()); });

    /** 5: en las sugerencias del buscador, solo si ya lo sabemos. */
    const sgBadge = (appid: number): HTMLElement | null => {
      const d = data[appid];
      if (!d || d.best == null || !d.store || !d.url || (d.steamUSD != null && d.best >= d.steamUSD)) return null;
      const a = document.createElement('a');
      a.dataset.wic = String(appid);
      a.className = 'wic-sg';
      a.href = d.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.title = `${usd(d.best)} en ${STORES[d.store].name}, activa en RD`;
      a.innerHTML = `· ${usd(d.best)} fuera <img src="${browser.runtime.getURL(`/stores/${d.store}.png` as any)}" alt="">`;
      a.addEventListener('click', (e) => e.stopPropagation());
      return a;
    };

    const badge = (appid: number, small: boolean): HTMLElement | null => {
      if (onWishlist && !small) return wlBlock(appid);
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
      while (running < 4 && queue.length) {
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
      .find((a) => !a.dataset.wic && !a.closest('[data-wic]') && !a.querySelector('img') && a.textContent!.trim() && !/^([\s$€£¥\d.,%−-]+|free( to play)?|gratis|gratuito)$/i.test(a.textContent!.trim()));

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
          // 6: delante del precio de Steam (el enlace a /app/ cuyo texto es un precio); si no se encuentra, tras el nombre.
          const price = [...row.querySelectorAll<HTMLAnchorElement>('a[href*="/app/"]')].find((a) => a !== t && !a.closest('[data-wic]') && !a.querySelector('img') && /\d/.test(a.textContent ?? '') && /^[\s$€£¥\d.,%−\-a-zA-Z]*$/.test(a.textContent!.trim()) && /[$€£¥]|\d[.,]\d{2}/.test(a.textContent!));
          place(row, appid, (b) => (price ? price.before(b) : t.after(b)), false, true);
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
      // 5: sugerencias del buscador de arriba (enlaces role=button con la cápsula pequeña): solo lo que ya sabemos.
      for (const a of document.querySelectorAll<HTMLAnchorElement>('a[role="button"][href*="/app/"]')) {
        const img = a.querySelector('img');
        if (!img || !/capsule_231x87|capsule_sm/.test(img.src)) continue;
        a.dataset.wicSg = '1';
        const appid = appidOf(a.getAttribute('href'));
        const text = a.children[1] as HTMLElement | undefined;
        const priceBox = text?.lastElementChild as HTMLElement | undefined;
        if (!appid || !priceBox) continue;
        const old = priceBox.querySelector<HTMLElement>('[data-wic]');
        if (old && Number(old.dataset.wic) === appid) continue;
        old?.remove();
        const b = sgBadge(appid);
        if (b) { priceBox.style.display = 'flex'; priceBox.style.alignItems = 'center'; priceBox.append(b); }
      }
      // Cápsulas: enlaces a /app/ con imagen y de un tamaño razonable (no iconos pequeños).
      for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href*="/app/"]')) {
        if (a.matches('.search_result_row') || a.dataset.wic || a.dataset.wicSg || !a.querySelector('img')) continue;
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
