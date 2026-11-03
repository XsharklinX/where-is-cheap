// Interfaz de la ventana del icono y del panel lateral (P): Precios, Lista de deseos (E) y Ahorro (O).
import { call, friendlyError, streamCompare, trackClicks } from './api';
import { savings } from './compare';
import type { LedgerEntry, SteamStatus, SteamUser, WishItem } from './data';
import { getSettings } from './settings';
import type { Compare, SearchHit, Settings } from './types';
import { STORES } from './types';
import type { FreeGame } from './free';
import './block.css';
import { detectGpu, type RunCheck } from './pc';
import { alertHTML, panelFootHTML, sellersToAsk, tableHTML, topHTML, type BlockState } from './block';
import type { SellerNote } from './stores/kinguin';
import { esc, logo, money, notesHTML, shortDate, swapRows, TAG_SVG, usd } from './ui';

type Tab = 'prices' | 'wish' | 'saved' | 'free';

function wishLine(w: WishItem, pct: number | null): string {
  if (w.lastBest == null) return w.checkedAt ? (w.steamUSD != null ? `Steam ${usd(w.steamUSD)} · sin oferta en RD` : 'sin oferta que active en RD') : 'aún sin revisar';
  if (w.steamUSD != null && w.lastBest >= w.steamUSD) return `Steam es más barato: ${usd(w.steamUSD)}`;
  return `${usd(w.lastBest)} en ${STORES[w.lastStore!]?.name ?? '?'}${pct && pct > 0 ? ` <span class="okc">−${pct}%</span>` : ''}`;
}

export async function mountApp(app: HTMLElement, mode: 'popup' | 'panel') {
  let tab: Tab = 'prices';
  let s: Settings = await getSettings();
  // 7: juego elegido en el buscador (manda sobre el de la pestaña hasta que se quita).
  let picked: number | null = null;

  async function currentAppid(): Promise<number | null> {
    const [t] = await browser.tabs.query({ active: true, currentWindow: true });
    return call<number | null>('tabGame', { url: t?.url, tabId: t?.id });
  }

  function shell(body: string) {
    const chip = `<span class="chip gh">RD · ${s.currency === 'dop' ? 'RD$' : 'USD'} · ${s.pay === 'card' ? 'tarjeta' : 'PayPal'}</span>`;
    const tb = (id: Tab, label: string) => `<button role="tab" aria-selected="${tab === id}" data-tab="${id}">${label}</button>`;
    app.innerHTML = `<header>${TAG_SVG('#17141a', 22)}<b class="brand">Where is cheap</b>${chip}<button class="gear" data-a="options" title="Ajustes" aria-label="Ajustes">⚙</button></header>
      <nav class="tabs" role="tablist">${tb('prices', 'Precios')}${tb('wish', 'Lista de deseos')}${tb('saved', 'Ahorro')}${tb('free', 'Gratis')}</nav>
      <main>${body}</main>`;
    app.querySelector('[data-a="options"]')!.addEventListener('click', () => { browser.runtime.openOptionsPage(); if (mode === 'popup') window.close(); });
    app.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab as Tab; void render(false); }));
  }

  const empty = (title: string, text: string, extra = '') => `<div class="empty"><b>${title}</b><p>${text}</p>${extra}</div>`;

  async function render(fresh: boolean) {
    s = await getSettings();
    if (tab === 'prices') return prices(fresh);
    if (tab === 'wish') return wishlist();
    if (tab === 'saved') return saved();
    return free();
  }

  /* ---------- Precios ---------- */
  let reqId = 0;
  let searchTimer = 0;

  async function prices(fresh: boolean) {
    // El buscador se pinta una vez; debajo cambia el cuerpo, así no pierde el foco al escribir.
    shell(`<div class="srch"><input type="search" placeholder="Buscar un juego de Steam…" aria-label="Buscar un juego de Steam" autocomplete="off" spellcheck="false"></div><div class="pbody"></div>`);
    const input = app.querySelector<HTMLInputElement>('.srch input')!;
    let shownFor = '';
    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const q = input.value.trim();
      if (q.length < 2) { shownFor = ''; void game(false); return; }
      searchTimer = window.setTimeout(() => void search(q).then(() => { shownFor = q; }), 280);
    });
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        // Enter elige el primer resultado de lo que está escrito ahora, no el de una búsqueda anterior.
        const q = input.value.trim();
        if (q.length < 2) return;
        clearTimeout(searchTimer);
        if (shownFor !== q) { await search(q); shownFor = q; }
        if (input.value.trim() === q) app.querySelector<HTMLButtonElement>('.hit')?.click();
      }
      if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; shownFor = ''; void game(false); }
    });
    await game(fresh);
  }

  const body = () => app.querySelector<HTMLElement>('.pbody');

  /** 7: resultados del buscador. */
  async function search(q: string) {
    const my = ++reqId;
    const b = body();
    if (!b) return;
    b.innerHTML = `<div class="empty"><span class="spin"></span></div>`;
    try {
      const hits = await call<SearchHit[]>('search', { q });
      if (my !== reqId || !body()) return;
      body()!.innerHTML = hits.length
        ? `<div class="hits" role="listbox" aria-label="Resultados">${hits.map((h) => `<button class="hit" role="option" data-appid="${h.appid}">
            ${h.img ? `<img src="${esc(h.img)}" alt="" width="72" height="27" loading="lazy">` : '<span class="noimg"></span>'}
            <span class="rn"><b>${esc(h.name)}</b><span>${h.steamUSD != null ? `Steam ${usd(h.steamUSD)}` : 'Gratis o sin precio en RD'}</span></span></button>`).join('')}</div>`
        : empty('Nada con ese nombre', 'Prueba con el nombre en inglés, como aparece en Steam.');
      body()!.querySelectorAll<HTMLButtonElement>('.hit').forEach((h) => h.addEventListener('click', () => {
        picked = Number(h.dataset.appid);
        app.querySelector<HTMLInputElement>('.srch input')!.value = '';
        void game(false);
      }));
    } catch (e) {
      if (my === reqId && body()) body()!.innerHTML = empty('No pudimos buscar', esc(friendlyError(e)));
    }
  }

  async function game(fresh: boolean) {
    const my = ++reqId;
    const tabApp = await currentAppid();
    const appid = picked ?? tabApp;
    if (my !== reqId || !body()) return;
    if (!appid) {
      body()!.innerHTML = empty('Abre un juego en Steam o búscalo arriba', 'En la ficha de cualquier juego de store.steampowered.com verás aquí dónde sale más barato, con el precio final y si la clave activa en RD. Si activas la detección fuera de Steam, también en tráileres, foros y reseñas.');
      return;
    }
    body()!.innerHTML = `<div class="empty"><span class="spin"></span><p>Buscando en Instant Gaming, Eneba, Driffle y Kinguin…</p></div>`;
    const from = picked != null
      ? `<span class="mute">Buscado</span>${tabApp && tabApp !== picked ? '<button class="lnk" data-a="unpick">Volver al de la pestaña</button>' : '<button class="lnk" data-a="unpick">Quitar</button>'}`
      : '<span class="mute">Detectado en esta pestaña</span>';

    // 12: el mismo bloque que en la ficha de Steam. En la ventana la tabla sale abierta: hay sitio y es a lo que vienes.
    const st: BlockState = { open: true, showNo: false, chart: false, editions: [] };
    let last: Compare | null = null;
    const paint = (c: Compare | null = last) => {
      if (my !== reqId || tab !== 'prices' || !body() || !c) return;
      last = c;
      const b = body()!;
      if (!b.querySelector('.blk')) {
        b.innerHTML = `
          <section class="game"><div class="from">${from}</div><b>${esc(c.game.name)}</b></section>
          <div class="pad">${notesHTML(c)}<div class="blk${s.currency === 'usd' ? ' usd' : ''}"><div class="b-top"></div><div class="b-panel"><div class="b-rows"></div><div class="b-pf"></div></div><div class="b-al"></div></div></div>`;
        b.querySelector('[data-a="unpick"]')?.addEventListener('click', () => { picked = null; void game(false); });
        b.querySelector('.blk')!.addEventListener('click', (ev) => {
          const a = (ev.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
          if (a === 'toggle') st.open = !st.open;
          else if (a === 'no') st.showNo = !st.showNo;
          else if (a === 'chart') st.chart = !st.chart;
          else if (a === 'refresh') { void game(true); return; }
          else if (a === 'options') { void call('options'); return; }
          else if (a === 'pc') { void call('options', { hash: 'pc' }); return; }
          else if (a === 't-clear') { target = null; void call('setTarget', { appid, target: null }); }
          else if (a === 't-edit') { target = null; }
          else return;
          paint();
          if (a === 't-edit') b.querySelector<HTMLInputElement>('#wic-target')?.focus();
        });
        // 8: el aviso de precio, también desde aquí.
        b.querySelector('.blk')!.addEventListener('submit', (ev) => {
          ev.preventDefault();
          const inp = b.querySelector<HTMLInputElement>('#wic-target')!;
          const n = Number(inp.value);
          if (!(n > 0)) { inp.setCustomValidity('Pon un precio mayor que 0'); inp.reportValidity(); return; }
          target = Math.round(n * 100) / 100;
          void call('setTarget', { appid, target, name: c.game.name });
          (document.activeElement as HTMLElement | null)?.blur();
          paint();
        });
      }
      b.querySelector('.b-top')!.innerHTML = topHTML(c, s, st);
      const panel = b.querySelector<HTMLElement>('.b-panel')!;
      panel.hidden = !st.open;
      swapRows(b.querySelector<HTMLElement>('.b-rows')!, tableHTML(c, s, st));
      b.querySelector('.b-pf')!.innerHTML = panelFootHTML(c, s);
      const al = b.querySelector<HTMLElement>('.b-al')!;
      if (!al.contains(document.activeElement)) al.innerHTML = c.owned || c.game.isFree ? '' : alertHTML(target, c);
      trackClicks(b.querySelector<HTMLElement>('.blk')!, c, app);
      // 10: quién vende la oferta más barata de Kinguin, cuando ya respondió.
      if (st.open && !c.pending?.includes('kinguin')) {
        for (const { url, cents } of sellersToAsk(c, st)) {
          (st.sellers ??= {})[url] = null;
          void call<SellerNote | null>('seller', { url, cents }).then((n) => { if (n) { st.sellers![url] = n; paint(); } }).catch(() => {});
        }
      }
    };
    let target: number | null = await call<number | null>('getTarget', { appid }).catch(() => null);

    try {
      const c = await streamCompare(appid, fresh, paint);
      paint(c);
      // 4: «¿Lo corre mi PC?» cuando ya están los precios (los requisitos llegan con la ficha).
      if (!c.game.isFree) void call<RunCheck>('canRun', { appid, gpu: detectGpu() }).then((r) => { st.run = r; paint(); }).catch(() => {});
    } catch (e) {
      if (my !== reqId || !body()) return;
      body()!.innerHTML = empty('No pudimos comparar precios', esc(friendlyError(e)), '<button class="go" data-a="retry">Reintentar</button>');
      body()!.querySelector('[data-a="retry"]')!.addEventListener('click', () => void game(true));
    }
  }

  /* ---------- Lista de deseos ---------- */
  const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'ahora mismo' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `el ${shortDate(t)}`; };

  /** Por qué no hay lista, según la última lectura de la cuenta. */
  function whyEmpty(st: SteamStatus | null, reading: boolean): string {
    const again = `<div class="btns"><button class="go sm" data-a="reread">Volver a leer</button><a class="go ghost sm" href="https://store.steampowered.com/" target="_blank" rel="noopener noreferrer">Abrir Steam</a></div>`;
    if (reading && (!st || st.status !== 'ok')) return `<div class="empty"><span class="spin"></span><p>Leyendo tu lista de deseos de Steam…</p></div>`;
    if (!st) return empty('Tu lista de deseos aparecerá aquí', 'Abre cualquier página de store.steampowered.com con tu sesión iniciada y vuelve aquí.', again);
    if (st.status === 'logged-out') return empty('No hay sesión de Steam en este navegador', 'Steam dice que no has iniciado sesión en store.steampowered.com en este navegador (o en este perfil de Chrome). Inicia sesión allí y pulsa «Volver a leer».', again);
    if (st.status === 'error') return empty('No pudimos leer tu cuenta de Steam', esc(st.error ?? 'Steam no respondió.'), again);
    if (st.status === 'empty') return empty('Steam no devolvió tu lista de deseos', 'Tu sesión está iniciada, pero la lista llegó vacía. Abre cualquier página de store.steampowered.com en una pestaña y pulsa «Volver a leer»: con la página abierta se lee de otra forma.', again);
    return empty('Tu lista de deseos está vacía', `Leída de Steam ${ago(st.at)}: no tiene juegos (o ya los tienes todos).`, again);
  }

  async function wishlist(sync = true) {
    const [{ items }, st] = await Promise.all([call<{ items: WishItem[]; user: SteamUser }>('wishlist'), call<SteamStatus | null>('steamStatus')]);
    if (tab !== 'wish') return;
    if (sync) {
      // Se pinta lo guardado y, a la vez, se vuelve a leer la cuenta; si cambia algo, se repinta.
      const before = JSON.stringify(st);
      void call<SteamStatus>('syncUser', {}).then((n) => { if (tab === 'wish' && JSON.stringify(n) !== before) void wishlist(false); }, () => {});
    }
    const wireReread = () => app.querySelector('[data-a="reread"]')?.addEventListener('click', async (e) => {
      const b = e.currentTarget as HTMLButtonElement;
      b.disabled = true;
      b.textContent = 'Leyendo…';
      await call('syncUser', { force: true }).catch(() => {});
      void wishlist(false);
    });
    if (!items.length) {
      shell(whyEmpty(st, sync));
      wireReread();
      return;
    }
    const sorted = [...items].sort((a, b) => (a.lastBest == null ? 1 : 0) - (b.lastBest == null ? 1 : 0) || (b.target != null ? 1 : 0) - (a.target != null ? 1 : 0) || (a.name ?? '').localeCompare(b.name ?? ''));
    const checked = items.filter((i) => i.checkedAt).length;
    const rows = sorted.map((w) => {
      const pct = w.lastBest != null && w.steamUSD ? Math.round((1 - w.lastBest / w.steamUSD) * 100) : null;
      const now = w.lastBest != null && (w.steamUSD == null || w.lastBest < w.steamUSD) ? w.lastBest : w.steamUSD ?? null;
      const reached = w.target != null && !!w.checkedAt && now != null && now <= w.target;
      return `<div class="wrow${reached ? ' hit' : ''}">
        <div class="rn"><b>${esc(w.name ?? `App ${w.appid}`)}</b><span>${wishLine(w, pct)}</span></div>
        <label class="lim">Límite <span>$</span><input type="number" min="0" step="0.5" inputmode="decimal" value="${w.target ?? ''}" placeholder="—" data-appid="${w.appid}" aria-label="Precio límite para ${esc(w.name ?? String(w.appid))}"></label>
        ${w.lastUrl ? `<a class="ir" href="${esc(w.lastUrl)}" target="_blank" rel="noopener noreferrer">Ir</a>` : `<a class="ir" href="https://store.steampowered.com/app/${w.appid}/" target="_blank" rel="noopener noreferrer">Ver</a>`}
      </div>`;
    }).join('');
    const stLine = st?.status === 'ok' ? `leída de Steam ${ago(st.at)}` : st?.status === 'logged-out' ? '<span class="warnc">sin sesión de Steam: lista guardada</span>' : st ? '<span class="warnc">no se pudo releer de Steam</span>' : '';
    shell(`<div class="pad wishhead"><span class="mute">${items.length} juegos · ${checked} revisados · se revisan solos cada 6 h${s.dropAlerts ? ` · aviso general con −${s.dropPct}% o más` : ''}${stLine ? ` · ${stLine}` : ''}</span><button class="go ghost sm" data-a="check">Revisar ahora</button></div>
      <div class="pad"><button class="wide" data-a="all">Ver la lista completa, ordenada por ahorro ↗</button></div>
      <div class="wlist">${rows}</div>`);
    app.querySelectorAll<HTMLInputElement>('input[data-appid]').forEach((inp) => inp.addEventListener('change', () => {
      const v = inp.value.trim();
      const n = Number(v);
      if (v !== '' && !(n > 0)) { inp.value = ''; inp.setCustomValidity('Pon un precio mayor que 0'); inp.reportValidity(); return; }
      inp.setCustomValidity('');
      call('setTarget', { appid: Number(inp.dataset.appid), target: v === '' ? null : n }).catch(() => { inp.setCustomValidity('No se pudo guardar. Prueba otra vez.'); inp.reportValidity(); });
    }));
    app.querySelector('[data-a="check"]')!.addEventListener('click', async (e) => {
      const b = e.currentTarget as HTMLButtonElement;
      b.disabled = true;
      b.textContent = 'Revisando…';
      await call('checkWishlist', { limit: 12 }).catch(() => {});
      void wishlist();
    });
    app.querySelector('[data-a="all"]')!.addEventListener('click', () => { void call('openWishlist'); if (mode === 'popup') window.close(); });
  }

  /* ---------- Ahorro ---------- */
  async function saved() {
    const l = await call<LedgerEntry[]>('ledger');
    const bought = l.filter((e) => e.state === 'bought');
    const pending = l.filter((e) => e.state === 'pending').slice(0, 8);
    const year = new Date().getFullYear();
    const thisYear = bought.filter((e) => new Date(e.at).getFullYear() === year);
    const total = thisYear.reduce((t, e) => t + Math.max(0, (e.steamUSD ?? e.paidUSD) - e.paidUSD), 0);
    const ask = pending.map((e) => `<div class="wrow ask" data-row="${e.id}">${logo(e.store, STORES[e.store].name)}<div class="rn"><b>${esc(e.name)}</b><span>${usd(e.paidUSD)} en ${STORES[e.store].name} · ${shortDate(e.at)}</span></div><span class="q">¿Lo compraste?</span><button class="ir" data-id="${e.id}" data-s="bought">Sí</button><button class="ir" data-id="${e.id}" data-s="skipped">No</button></div>`).join('');
    const done = bought.slice(0, 10).map((e) => `<div class="wrow">${logo(e.store, STORES[e.store].name)}<div class="rn"><b>${esc(e.name)}</b><span>${usd(e.paidUSD)}${e.paidConfirmed ? '' : ' est.'} · Steam ${e.steamUSD != null ? usd(e.steamUSD) : '—'}</span></div><span class="save">−${usd(Math.max(0, (e.steamUSD ?? e.paidUSD) - e.paidUSD))}</span></div>`).join('');
    shell(`<section class="big"><div class="mute">Ahorrado en ${year} frente a Steam</div><b class="save">${usd(total)}</b><div class="mute">${thisYear.length} ${thisYear.length === 1 ? 'juego' : 'juegos'} · solo cuentan las compras que confirmas</div></section>
      ${ask ? `<h3 class="sh">Pendiente de confirmar</h3><div class="wlist">${ask}</div>` : ''}
      ${done ? `<h3 class="sh">Compras</h3><div class="wlist">${done}</div>` : ''}
      ${!ask && !done ? empty('Aún no hay compras', 'Cuando pulses «Ir» en una oferta, aquí te preguntaremos si lo compraste para sumar lo que ahorraste.') : ''}`);
    app.querySelectorAll<HTMLButtonElement>('button[data-id]').forEach((b) => b.addEventListener('click', async () => {
      const e = pending.find((x) => x.id === b.dataset.id);
      if (b.dataset.s === 'bought' && e) { askPaid(e); return; }
      await call('ledgerSet', { id: b.dataset.id, state: b.dataset.s });
      void saved();
    }));
  }

  /** 3: al confirmar una compra se pide el total pagado; con él se aprende la comisión real de esa tienda. */
  function askPaid(e: LedgerEntry) {
    const row = app.querySelector<HTMLElement>(`[data-row="${e.id}"]`);
    if (!row) return;
    // En dólares se propone lo estimado (basta con corregir los céntimos); en euros se deja en blanco.
    const eur = e.currency === 'EUR';
    const est = eur ? null : e.paidUSD;
    row.outerHTML = `<form class="wrow paid" data-row="${e.id}">${logo(e.store, STORES[e.store].name)}
      <div class="rn"><b>${esc(e.name)}</b><span>¿Cuánto pagaste en total en ${STORES[e.store].name}? Con eso calculamos su comisión real.</span></div>
      <div class="paidrow"><label class="lim"><select aria-label="Moneda en que pagaste"><option value="USD"${eur ? '' : ' selected'}>$</option><option value="EUR"${eur ? ' selected' : ''}>€</option></select><input type="number" min="0" step="0.01" inputmode="decimal" required value="${est != null ? est.toFixed(2) : ''}" aria-label="Total pagado"></label>
      <button class="ir go-sm" type="submit">Guardar</button><button class="ir skip" type="button" data-a="skip" title="Contar la compra sin el total">Omitir</button></div></form>`;
    const form = app.querySelector<HTMLFormElement>(`form[data-row="${e.id}"]`)!;
    const inp = form.querySelector('input')!;
    inp.focus();
    inp.select();
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const n = Number(inp.value);
      if (!(n > 0)) { inp.setCustomValidity('Pon el total que te cobraron'); inp.reportValidity(); return; }
      await call('ledgerSet', { id: e.id, state: 'bought', paid: n, currency: form.querySelector('select')!.value });
      void saved();
    });
    form.querySelector('[data-a="skip"]')!.addEventListener('click', async () => {
      await call('ledgerSet', { id: e.id, state: 'bought' });
      void saved();
    });
  }

  /* ---------- Gratis ---------- */
  async function free() {
    shell(`<div class="empty"><span class="spin"></span><p>Buscando juegos gratis…</p></div>`);
    try {
      const list = await call<FreeGame[]>('freeGames');
      if (tab !== 'free') return;
      if (!list.length) {
        shell(empty('Nada gratis ahora', 'Miramos el juego gratis de la semana en Epic y los que Steam regala para siempre. Vuelve otro día.'));
        return;
      }
      const rows = list.map((g) => `<div class="wrow">
        ${g.img ? `<img class="fi" src="${esc(g.img)}" alt="" width="92" height="43" loading="lazy">` : '<span class="fi"></span>'}
        <div class="rn"><b title="${esc(g.name)}">${esc(g.name)}</b><span>${g.store === 'epic' ? 'Epic · gratis esta semana' : 'Steam · gratis para quedártelo'}${g.until ? ` · hasta ${shortDate(g.until)}` : ''}${g.inWishlist ? ' · <span class="okc">está en tu lista</span>' : ''}</span></div>
        <a class="ir" href="${esc(g.url)}" target="_blank" rel="noopener noreferrer">Conseguir ↗</a>
      </div>`).join('');
      shell(`<div class="pad"><span class="mute">Gratis ahora mismo, para quedártelos para siempre.</span></div><div class="wlist">${rows}</div>`);
    } catch (e) {
      if (tab !== 'free') return;
      shell(empty('No pudimos leer los juegos gratis', esc(friendlyError(e))));
    }
  }

  await render(false);
  if (mode === 'panel') {
    // El panel se queda abierto: sigue a la pestaña activa (salvo que hayas buscado otro juego).
    const again = () => { if (tab === 'prices' && picked == null && !app.querySelector<HTMLInputElement>('.srch input')?.value) void game(false); };
    browser.tabs.onActivated.addListener(again);
    browser.tabs.onUpdated.addListener((_id, info, t) => { if (t.active && info.status === 'complete') again(); });
  }
}
