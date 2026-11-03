// Interfaz de la ventana del icono y del panel lateral (P): Precios, Lista de deseos (E) y Ahorro (O).
import { call, friendlyError, trackClicks } from './api';
import { savings } from './compare';
import type { LedgerEntry, SteamUser, WishItem } from './data';
import { getSettings } from './settings';
import type { Compare, Settings } from './types';
import { STORES } from './types';
import { esc, footHTML, logo, money, notesHTML, rowsHTML, TAG_SVG, usd, verdictHTML } from './ui';

type Tab = 'prices' | 'wish' | 'saved';

function wishLine(w: WishItem, pct: number | null): string {
  if (w.lastBest == null) return w.checkedAt ? (w.steamUSD != null ? `Steam ${usd(w.steamUSD)} · sin oferta en RD` : 'sin oferta que active en RD') : 'aún sin revisar';
  if (w.steamUSD != null && w.lastBest >= w.steamUSD) return `Steam es más barato: ${usd(w.steamUSD)}`;
  return `${usd(w.lastBest)} en ${STORES[w.lastStore!]?.name ?? '?'}${pct && pct > 0 ? ` <span class="okc">−${pct}%</span>` : ''}`;
}

export async function mountApp(app: HTMLElement, mode: 'popup' | 'panel') {
  let tab: Tab = 'prices';
  let s: Settings = await getSettings();

  async function currentAppid(): Promise<number | null> {
    const [t] = await browser.tabs.query({ active: true, currentWindow: true });
    return call<number | null>('tabGame', { url: t?.url, tabId: t?.id });
  }

  function shell(body: string) {
    const chip = `<span class="chip gh">RD · ${s.currency === 'dop' ? 'RD$' : 'USD'} · ${s.pay === 'card' ? 'tarjeta' : 'PayPal'}</span>`;
    const tb = (id: Tab, label: string) => `<button role="tab" aria-selected="${tab === id}" data-tab="${id}">${label}</button>`;
    app.innerHTML = `<header>${TAG_SVG('#17141a', 22)}<b class="brand">Where is cheap</b>${chip}<button class="gear" data-a="options" title="Ajustes" aria-label="Ajustes">⚙</button></header>
      <nav class="tabs" role="tablist">${tb('prices', 'Precios')}${tb('wish', 'Lista de deseos')}${tb('saved', 'Ahorro')}</nav>
      <main>${body}</main>`;
    app.querySelector('[data-a="options"]')!.addEventListener('click', () => { browser.runtime.openOptionsPage(); if (mode === 'popup') window.close(); });
    app.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab as Tab; void render(false); }));
  }

  const empty = (title: string, text: string, extra = '') => `<div class="empty"><b>${title}</b><p>${text}</p>${extra}</div>`;

  async function render(fresh: boolean) {
    s = await getSettings();
    if (tab === 'prices') return prices(fresh);
    if (tab === 'wish') return wishlist();
    return saved();
  }

  /* ---------- Precios ---------- */
  let reqId = 0;
  async function prices(fresh: boolean) {
    const my = ++reqId;
    const appid = await currentAppid();
    if (my !== reqId) return;
    if (!appid) {
      shell(empty('Abre un juego en Steam', 'En la ficha de cualquier juego de store.steampowered.com verás aquí dónde sale más barato, con el precio final y si la clave activa en RD. Si activas la detección fuera de Steam, también en tráileres, foros y reseñas.'));
      return;
    }
    shell(`<div class="empty"><span class="spin"></span><p>Buscando en Instant Gaming, Eneba, Driffle y Kinguin…</p></div>`);
    try {
      const c = await call<Compare>('compare', { appid, fresh });
      if (my !== reqId || tab !== 'prices') return;
      const save = savings(c);
      const steam = c.game.steamUSD != null ? `Steam ${money(c.game.steamUSD, c, s)}${c.game.steamDiscount ? ` (−${c.game.steamDiscount}%)` : ''}` : 'No se vende en Steam ahora';
      shell(`
        <section class="game"><div class="mute">Detectado en esta pestaña</div><b>${esc(c.game.name)}</b><div class="mute">${steam}${c.owned ? ' · <span class="okc">ya lo tienes</span>' : ''}</div></section>
        <div class="pad">${notesHTML(c)}${verdictHTML(c)}</div>
        <div class="rows list">${c.offers.length || c.game.steamUSD != null ? rowsHTML(c, s, true) : '<p class="mute">No está en Instant Gaming, Eneba, Driffle ni Kinguin.</p>'}</div>
        <div class="sum">${save ? `<span>Ahorras <b class="save">${money(save.usd, c, s)}</b> frente a Steam</span>` : c.game.steamUSD != null && c.offers.some((o) => o.fit === 'ok') ? '<span class="mute">Steam tiene el mejor precio ahora</span>' : '<span class="mute">Sin oferta segura con la que comparar</span>'}</div>
        <div class="foot">${footHTML(c, s)}<button data-a="refresh">Actualizar</button></div>`);
      app.querySelector('[data-a="refresh"]')!.addEventListener('click', () => prices(true));
      trackClicks(app, c);
    } catch (e) {
      shell(empty('No pudimos comparar precios', esc(friendlyError(e)), '<button class="go" data-a="retry">Reintentar</button>'));
      app.querySelector('[data-a="retry"]')!.addEventListener('click', () => prices(true));
    }
  }

  /* ---------- Lista de deseos ---------- */
  async function wishlist() {
    const { items, user } = await call<{ items: WishItem[]; user: SteamUser }>('wishlist');
    if (!items.length) {
      shell(empty('Tu lista de deseos aparecerá aquí', user.at
        ? 'Steam dice que tu lista de deseos está vacía.'
        : 'Entra en store.steampowered.com con tu sesión iniciada y abre la ficha de cualquier juego: la extensión leerá tu lista de deseos y tu biblioteca. No sale de este navegador.'));
      return;
    }
    const sorted = [...items].sort((a, b) => (a.lastBest == null ? 1 : 0) - (b.lastBest == null ? 1 : 0) || (b.target != null ? 1 : 0) - (a.target != null ? 1 : 0) || (a.name ?? '').localeCompare(b.name ?? ''));
    const checked = items.filter((i) => i.checkedAt).length;
    const rows = sorted.map((w) => {
      const pct = w.lastBest != null && w.steamUSD ? Math.round((1 - w.lastBest / w.steamUSD) * 100) : null;
      const reached = w.target != null && w.lastBest != null && w.lastBest <= w.target;
      return `<div class="wrow${reached ? ' hit' : ''}">
        <div class="rn"><b>${esc(w.name ?? `App ${w.appid}`)}</b><span>${wishLine(w, pct)}</span></div>
        <label class="lim">Límite <span>$</span><input type="number" min="0" step="0.5" inputmode="decimal" value="${w.target ?? ''}" placeholder="—" data-appid="${w.appid}" aria-label="Precio límite para ${esc(w.name ?? String(w.appid))}"></label>
        ${w.lastUrl ? `<a class="ir" href="${esc(w.lastUrl)}" target="_blank" rel="noopener noreferrer">Ir</a>` : `<a class="ir" href="https://store.steampowered.com/app/${w.appid}/" target="_blank" rel="noopener noreferrer">Ver</a>`}
      </div>`;
    }).join('');
    shell(`<div class="pad wishhead"><span class="mute">${items.length} juegos · ${checked} revisados · se revisan solos cada 6 h${s.dropAlerts ? ` · aviso general con −${s.dropPct}% o más` : ''}</span><button class="go ghost sm" data-a="check">Revisar ahora</button></div><div class="wlist">${rows}</div>`);
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
  }

  /* ---------- Ahorro ---------- */
  async function saved() {
    const l = await call<LedgerEntry[]>('ledger');
    const bought = l.filter((e) => e.state === 'bought');
    const pending = l.filter((e) => e.state === 'pending').slice(0, 8);
    const year = new Date().getFullYear();
    const thisYear = bought.filter((e) => new Date(e.at).getFullYear() === year);
    const total = thisYear.reduce((t, e) => t + Math.max(0, (e.steamUSD ?? e.paidUSD) - e.paidUSD), 0);
    const ask = pending.map((e) => `<div class="wrow">${logo(e.store, STORES[e.store].name)}<div class="rn"><b>${esc(e.name)}</b><span>${usd(e.paidUSD)} en ${STORES[e.store].name} · ${new Date(e.at).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' })}</span></div><span class="q">¿Lo compraste?</span><button class="ir" data-id="${e.id}" data-s="bought">Sí</button><button class="ir" data-id="${e.id}" data-s="skipped">No</button></div>`).join('');
    const done = bought.slice(0, 10).map((e) => `<div class="wrow">${logo(e.store, STORES[e.store].name)}<div class="rn"><b>${esc(e.name)}</b><span>${usd(e.paidUSD)} · Steam ${e.steamUSD != null ? usd(e.steamUSD) : '—'}</span></div><span class="save">−${usd(Math.max(0, (e.steamUSD ?? e.paidUSD) - e.paidUSD))}</span></div>`).join('');
    shell(`<section class="big"><div class="mute">Ahorrado en ${year} frente a Steam</div><b class="save">${usd(total)}</b><div class="mute">${thisYear.length} ${thisYear.length === 1 ? 'juego' : 'juegos'} · solo cuentan las compras que confirmas</div></section>
      ${ask ? `<h3 class="sh">Pendiente de confirmar</h3><div class="wlist">${ask}</div>` : ''}
      ${done ? `<h3 class="sh">Compras</h3><div class="wlist">${done}</div>` : ''}
      ${!ask && !done ? empty('Aún no hay compras', 'Cuando pulses «Ir» en una oferta, aquí te preguntaremos si lo compraste para sumar lo que ahorraste.') : ''}`);
    app.querySelectorAll<HTMLButtonElement>('button[data-id]').forEach((b) => b.addEventListener('click', async () => {
      await call('ledgerSet', { id: b.dataset.id, state: b.dataset.s });
      void saved();
    }));
  }

  await render(false);
  if (mode === 'panel') {
    // El panel se queda abierto: sigue a la pestaña activa.
    const again = () => { if (tab === 'prices') void render(false); };
    browser.tabs.onActivated.addListener(again);
    browser.tabs.onUpdated.addListener((_id, info, t) => { if (t.active && info.status === 'complete') again(); });
  }
}
