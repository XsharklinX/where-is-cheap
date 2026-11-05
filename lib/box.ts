// 1.7: la caja de compra. En la ficha de Steam lleva la forma de las cajas «Buy» de Steam (skin 'steam'); en la ventana,
// la misma estructura con la estética de la extensión (skin 'pop'). Lo secundario va en chips que abren su parte debajo.
import { call, trackClicks } from './api';
import { alertHTML, blockCase, chartHTML, dlcBundle, dlcExtra, dlcHTML, dlcToPrice, groupStores, panelFootHTML, pendingOf, regionShort, runChip, runPaneHTML, sellersToAsk, tableHTML, tipHTML, type BlockState, type DlcPrice, type DlcView } from './block';
import { savings } from './compare';
import { nextSale, saleText } from './history';
import { saveSettings } from './settings';
import type { SellerNote } from './stores/kinguin';
import type { Compare, HistoryPoint, Offer, Settings, StoreId } from './types';
import { STORES } from './types';
import { andList, esc, failedNote, local, logo, money, shortDate, swapRows, TAG_SVG, toast, usd } from './ui';

export type Pane = 'stores' | 'chart' | 'run' | 'dlc' | 'alert' | null;
export type Skin = 'steam' | 'pop';
export interface BoxState extends BlockState { pane: Pane; dlc: DlcView | null; target: number | null }

const ARROW = '<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" stroke="currentColor" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const BELL = '<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/></svg>';
const DAY = 86_400_000;

/* ---------- 11: bajó desde la última vez ---------- */

/** El mejor precio de un día anterior a hoy frente al de ahora. null si no bajó al menos $0,25 y un 2 %. */
export function dropSince(history: HistoryPoint[], nowBest: number | null, now = Date.now()): { usd: number; at: number } | null {
  if (nowBest == null) return null;
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const prev = [...history].reverse().find((p) => p.t < today.getTime() && p.best != null);
  if (!prev) return null;
  const diff = prev.best! - nowBest;
  if (diff < 0.25 || diff < prev.best! * 0.02) return null;
  return { usd: Math.round(diff * 100) / 100, at: prev.t };
}

/* ---------- 12: historial en miniatura ---------- */

/** Línea de los últimos 90 días de la mejor oferta, con el mínimo en verde y hoy en blanco. '' si hay menos de 2 días. */
export function sparkSVG(history: HistoryPoint[], nowBest: number | null, now = Date.now(), w = 64, h = 16): string {
  const pts = history.filter((p) => p.best != null && p.t >= now - 90 * DAY).map((p) => ({ t: p.t, v: p.best! }));
  if (nowBest != null && (!pts.length || now - pts[pts.length - 1].t > 60_000)) pts.push({ t: now, v: nowBest });
  if (pts.length < 2 || pts[pts.length - 1].t - pts[0].t < DAY / 2) return '';
  const lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v));
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const x = (t: number) => ((t - t0) / (t1 - t0)) * (w - 4) + 2;
  const y = (v: number) => (hi - lo < 0.01 ? h / 2 : 2 + ((hi - v) / (hi - lo)) * (h - 4));
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join('');
  const min = pts.reduce((a, b) => (b.v < a.v ? b : a));
  const last = pts[pts.length - 1];
  return `<svg class="x-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}L${x(t1).toFixed(1)} ${h}L${x(t0).toFixed(1)} ${h}Z" fill="rgba(255,181,71,.16)"/><path d="${d}" fill="none" stroke="#ffb547" stroke-width="1.4" stroke-linejoin="round"/><circle cx="${x(min.t).toFixed(1)}" cy="${y(min.v).toFixed(1)}" r="2.2" fill="#45d69b"/><circle cx="${x(last.t).toFixed(1)}" cy="${y(last.v).toFixed(1)}" r="2.2" fill="#fff"/></svg>`;
}

/* ---------- partes ---------- */

const TITLES = {
  loading: 'Buscando el mejor precio fuera de Steam',
  owned: 'Ya lo tienes',
  steam: 'Steam tiene el mejor precio',
  best: 'Cómpralo fuera de Steam',
  none: 'Fuera de Steam no hay ofertas que activen en RD',
} as const;

const kindLow = (o: Offer) => (o.kind === 'key' ? 'clave' : o.kind === 'gift' ? 'regalo' : 'cuenta');

function subHTML(c: Compare, s: Settings, top: Offer | undefined): string {
  const k = blockCase(c, s);
  const waiting = pendingOf(c, s);
  const later = waiting.length ? ` · falta ${andList(waiting.map((id) => STORES[id].name))}` : '';
  const stale = c.staleAt ? ` · <span class="x-mute" title="Precios de la última vez; se están actualizando">${shortDate(c.staleAt)}</span>` : '';
  if (k === 'owned') return `${top ? `Para regalar: desde ${money(top.totalUSD, c, s)} en ${STORES[top.store].name}` : 'Está en tu biblioteca.'}${later}`;
  if (k === 'none') {
    const nNo = c.offers.filter((o) => o.fit === 'no').length;
    return c.offers.length ? `Hay ${c.offers.length} ${c.offers.length === 1 ? 'oferta' : 'ofertas'} ${nNo === c.offers.length ? 'de otras regiones' : 'de otras regiones, cuentas o precios dudosos'}.` : c.failed.length ? esc(failedNote(c)) : 'No está en Instant Gaming, Eneba, Driffle ni Kinguin con el mismo nombre y edición.';
  }
  if (!top) return `Buscando en ${andList(waiting.map((id) => STORES[id].name)) || 'las tiendas'}…`;
  if (k === 'steam') return `La mejor clave cuesta ${money(top.totalUSD, c, s)} en ${STORES[top.store].name}${later}${stale}`;
  const reg = regionShort(top);
  const bits = [`${kindLow(top) === 'clave' ? 'Clave' : kindLow(top) === 'regalo' ? 'Regalo' : 'Cuenta'} de Steam ${reg === 'Global' ? 'global' : reg === 'Tu país' ? 'para tu país' : `para ${esc(reg)}`} en ${STORES[top.store].name}`, '<span class="x-ok">activa en RD</span>'];
  if (top.coupon) bits.push(`con tu cupón ${esc(top.coupon)}`);
  return bits.join(' · ') + later + stale;
}

/** El bloque de precio y el botón, como el «precio + Add to Cart» de Steam. */
function actHTML(c: Compare, s: Settings, top: Offer | undefined): string {
  const k = blockCase(c, s);
  if (k === 'loading') return '<div class="x-act x-skel" aria-hidden="true"><i></i></div>';
  if (k !== 'best' || !top) {
    if (k === 'steam' && c.game.steamUSD != null) return `<div class="x-act"><span class="x-pr">${money(c.game.steamUSD, c, s)} en Steam</span><span class="x-note">Cómpralo en Steam</span></div>`;
    if (k === 'owned' && top) return `<div class="x-act"><a class="x-go" href="${esc(top.url)}" target="_blank" rel="noopener noreferrer" data-store="${top.store}" data-i="${c.offers.indexOf(top)}">${logo(top.store, STORES[top.store].name)}Ir a ${STORES[top.store].name} ${ARROW}</a></div>`;
    return '';
  }
  const save = savings(c);
  const disc = save && c.game.steamUSD != null
    ? `<span class="x-disc"><span class="p">-${save.pct}%</span><span class="pp"><s>${money(c.game.steamUSD, c, s)}</s><b class="b-price" tabindex="0">${money(top.totalUSD, c, s)}${tipHTML(top, c, s)}</b></span></span>`
    : `<span class="x-pr b-price" tabindex="0">${money(top.totalUSD, c, s)}${tipHTML(top, c, s)}</span>`;
  const rd = s.currency === 'both' ? `<span class="x-rd">≈ ${local(top.totalUSD, c, s)}</span>` : '';
  const name = STORES[top.store].name;
  return `<div class="x-act">${disc}${rd}<a class="x-go" href="${esc(top.url)}" target="_blank" rel="noopener noreferrer" data-store="${top.store}" data-i="${c.offers.indexOf(top)}">${logo(top.store, name)}Ir a ${name} ${ARROW}</a></div>`;
}

const chip = (pane: Exclude<Pane, null>, st: BoxState, inner: string, cls = '', title = '') =>
  `<button type="button" class="x-chip ${cls}${st.pane === pane ? ' on' : ''}" data-a="pane" data-p="${pane}" aria-expanded="${st.pane === pane}"${title ? ` title="${esc(title)}"` : ''}>${inner}</button>`;

/** Rebajas a la vista: en marcha, o las de otoño a 30 días o menos. */
function saleShort(now = Date.now()): string {
  const sale = nextSale(now);
  if (sale.live) return `${sale.name.replace(/ \(Black Friday\)/, '')} en marcha`;
  if (sale.bf && sale.days <= 30) return `Black Friday en ${sale.days === 1 ? '1 día' : `${sale.days} días`}`;
  return '';
}

function chipsHTML(c: Compare | null, s: Settings, st: BoxState, skin: Skin): string {
  if (!c) return '<div class="x-chips x-skel" aria-hidden="true"><i></i><i></i><i></i></div>';
  const k = blockCase(c, s);
  const out: string[] = [];
  // Veredicto (+ rebajas) y el historial en miniatura: abren el gráfico.
  if (!c.owned) {
    if (pendingOf(c, s).length) out.push('<span class="x-chip gh"><i></i>Calculando…</span>');
    else {
      const v = c.verdict;
      const cls = v.kind === 'buy' ? 'ok' : v.kind === 'wait' ? 'wait' : 'gh';
      const label = v.kind === 'buy' ? 'Buen precio' : v.kind === 'wait' ? 'Mejor esperar' : v.title;
      const sale = k === 'best' || k === 'steam' ? saleShort() : '';
      out.push(chip('chart', st, `<i></i>${esc(label)}${sale ? ` · ${esc(sale)}` : ''}`, cls, v.detail));
      const top = c.offers.find((o) => o.fit === 'ok');
      const sp = sparkSVG(c.history, top?.totalUSD ?? null);
      const low = Math.min(...c.history.filter((p) => p.best != null && p.t >= Date.now() - 90 * DAY).map((p) => p.best!), top?.totalUSD ?? Infinity);
      if (sp) out.push(chip('chart', st, `${sp}<span>mín. <b>${usd(low)}</b></span>`, 'spark', 'Precio de la mejor oferta en los últimos 90 días'));
    }
  }
  const run = runChip(st.run);
  if (run) out.push(chip('run', st, `<i></i>${esc(run.text)}`, run.cls));
  // Las otras tiendas.
  const { groups, no } = groupStores(c.offers);
  const others = (k === 'best' ? groups.slice(1) : groups).filter((g) => g.top.fit !== 'no');
  const usable = groups.reduce((n, g) => n + 1 + g.rest.length, 0);
  if (skin === 'steam' && (others.length || no.length)) {
    const logos = others.slice(0, 3).map((g) => logo(g.store, STORES[g.store].name)).join('');
    const label = others.length ? `${others.length === 1 ? `${STORES[others[0].store].name} ${money(others[0].top.totalUSD, c, s)}` : `${others.length} tiendas más`}` : `${no.length} no ${no.length === 1 ? 'activa' : 'activan'} en RD`;
    out.push(chip('stores', st, `${logos}${label}`, 'st', `Ver ${usable + no.length === 1 ? 'la oferta' : `las ${usable + no.length} ofertas`}`));
  } else if (skin === 'pop' && (usable > groups.length || no.length)) {
    out.push(chip('stores', st, `Todas las ofertas (${usable + no.length})`, 'st', no.length ? `${no.length} no ${no.length === 1 ? 'activa' : 'activan'} en RD` : ''));
  }
  // DLC.
  if (st.dlc?.total) {
    const sum = st.dlc.items.filter((d) => !d.owned && !d.soon && d.steamUSD && !dlcExtra(d.name) && !dlcBundle(d.name)).reduce((a, d) => a + (d.steamUSD ?? 0), 0);
    out.push(chip('dlc', st, `${st.dlc.total} DLC${sum > 0 ? ` · <b>${money(sum, c, s)}</b>` : ''}`));
  }
  // Aviso de precio.
  if (!c.owned && !c.game.isFree) out.push(chip('alert', st, st.target != null ? `${BELL}Aviso: <b>${usd(st.target)}</b>` : `${BELL}Avísame si baja`, st.target != null ? 'set' : ''));
  return `<div class="x-chips">${out.join('')}</div>`;
}

/** 8 (ventana): las tiendas en filas cortas, con Steam al final. */
function popRowsHTML(c: Compare, s: Settings): string {
  const k = blockCase(c, s);
  const { groups } = groupStores(c.offers);
  const rows = (k === 'best' ? groups.slice(1) : groups).filter((g) => g.top.fit !== 'no').map((g) => {
    const nm = STORES[g.store].name;
    return `<a class="x-pr-row${g.top.fit === 'warn' ? ' warn' : ''}" href="${esc(g.top.url)}" target="_blank" rel="noopener noreferrer" data-store="${g.store}" data-i="${g.top.i}" title="${esc(g.top.fit === 'warn' ? g.top.fitText : `Abrir en ${nm}`)}">${logo(g.store, nm)}<span>${nm}${g.top.fit === 'warn' ? ` <em>${esc(g.top.fitText)}</em>` : ''}</span><b>${money(g.top.totalUSD, c, s)}</b><i>${ARROW}</i></a>`;
  });
  const waits = pendingOf(c, s).map((id) => `<div class="x-pr-row wait">${logo(id, STORES[id].name)}<span>${STORES[id].name}</span><b>Buscando…</b><i></i></div>`);
  const steam = c.game.steamUSD != null && k !== 'steam' ? `<a class="x-pr-row stm" href="https://store.steampowered.com/app/${c.game.appid}/" target="_blank" rel="noopener noreferrer">${logo('steam', 'Steam')}<span>Steam</span><b>${money(c.game.steamUSD, c, s)}</b><i>${ARROW}</i></a>` : '';
  return rows.join('') + waits.join('') + steam;
}

/* ---------- la caja ---------- */

export interface BoxHooks {
  /** Pulsaste «Actualizar». */
  refresh(): void;
  /** Ajustes (con #pc si viene de «Tu PC»). */
  options(hash?: string): void;
  /** Volver de otra edición a la estándar. */
  std?(): void;
  /** «Comparar esa edición» desde el panel de DLC. */
  edition?(label: string): void;
}

export interface Box {
  st: BoxState;
  set(c: Compare | null): void;
  paint(): void;
  current(): Compare | null;
  setSettings(s: Settings): void;
  error(msg: string): void;
}

export function boxShell(skin: Skin, s: Settings): string {
  return `<div class="blk x-box ${skin}${s.currency === 'usd' ? ' usd' : ''}"><div class="x-top"></div>
    <div class="x-pane" data-p="stores" hidden><div class="b-rows"></div><div class="b-pf"></div></div>
    <div class="x-pane" data-p="chart" hidden></div><div class="x-pane" data-p="run" hidden></div><div class="x-pane" data-p="dlc" hidden></div><div class="x-pane" data-p="alert" hidden></div></div>`;
}

export function createBox(root: HTMLElement, appid: number, skin: Skin, settings: Settings, hooks: BoxHooks, toastRoot: HTMLElement | ShadowRoot = root): Box {
  let s = settings;
  let last: Compare | null = null;
  let dlcAsked = false;
  const st: BoxState = { open: false, showNo: false, chart: false, editions: [], pane: null, dlc: null, target: null };
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;

  /** 14: con el vendedor de Kinguin ya leído, una oferta de un vendedor oculto deja de contar como buena. */
  function applySellers(c: Compare) {
    if (!s.hiddenSellers?.length || !st.sellers) return;
    for (const o of c.offers) {
      const n = st.sellers[o.url];
      if (n && s.hiddenSellers.includes(n.name) && o.fit !== 'no') {
        o.fit = 'warn'; o.fitText = 'Vendedor oculto'; o.fitWhy = `Ocultaste a ${n.name}. Se vuelve a mostrar en Ajustes.`;
      }
    }
  }

  function askSellers() {
    if (!last || last.pending?.includes('kinguin') || (st.pane !== 'stores' && skin === 'steam' && !s.hiddenSellers?.length)) return;
    for (const { url, cents } of sellersToAsk(last, st)) {
      (st.sellers ??= {})[url] = null;
      call<SellerNote | null>('seller', { url, cents }).then((n) => { if (n) { st.sellers![url] = n; paint(); } }).catch(() => {});
    }
  }

  async function priceDlcs() {
    const v = st.dlc;
    if (!v) return;
    const queue = dlcToPrice(v).filter((d) => v.prices[d.appid] === undefined || v.prices[d.appid] === 'error');
    for (const d of queue) v.prices[d.appid] = 'loading';
    paintPane('dlc');
    const work = async () => {
      for (let d = queue.shift(); d; d = queue.shift()) {
        v.prices[d.appid] = await call<DlcPrice>('dlcPrice', { appid: d.appid }).catch(() => 'error' as const);
        paintPane('dlc');
      }
    };
    await Promise.all([work(), work()]);
  }

  function paintPane(p: Exclude<Pane, null>) {
    const el = root.querySelector<HTMLElement>(`.x-pane[data-p="${p}"]`);
    if (!el) return;
    el.hidden = st.pane !== p || !last;
    if (el.hidden || !last) return;
    if (p === 'stores') {
      swapRows($('.b-rows'), tableHTML(last, s, st));
      $('.b-pf').innerHTML = panelFootHTML(last, s);
    } else if (p === 'chart') {
      const sale = nextSale(Date.now());
      const saleLine = (sale.live || (sale.bf && sale.days <= 30)) && !last.verdict.detail.includes(sale.name) ? `<p class="x-sale">${esc(saleText(sale))}. ${sale.live ? 'Las tiendas de claves también bajan estos días.' : 'Si no te corre prisa, espera: Steam y las tiendas de claves bajan esa semana.'}</p>` : '';
      el.innerHTML = saleLine + chartHTML(last, s);
    } else if (p === 'run') el.innerHTML = runPaneHTML(st.run);
    else if (p === 'dlc') el.innerHTML = st.dlc ? dlcHTML({ ...st.dlc, open: true }, last, s, st, true) : '';
    else if (p === 'alert') {
      const act = (root.getRootNode() as Document | ShadowRoot).activeElement;
      if (!act || !el.contains(act)) el.innerHTML = alertHTML(st.target, last);
    }
  }

  function paint() {
    const box = $('.x-box');
    box.classList.toggle('usd', s.currency === 'usd');
    if (last) applySellers(last);
    const c = last;
    const top = c?.offers.find((o) => o.fit === 'ok');
    const k = blockCase(c, s);
    if (!c) {
      $('.x-top').innerHTML = `<div class="x-h">${skin === 'steam' ? `<h4>${TITLES.loading}</h4><span class="x-mk">${TAG_SVG('#262a33', 13)}Where is cheap</span>` : ''}</div><div class="x-sub x-skel"><i></i></div>${chipsHTML(null, s, st, skin)}<div class="x-act x-skel" aria-hidden="true"><i></i></div>`;
    } else {
      const drop = k === 'best' && !c.staleAt ? dropSince(c.history, top?.totalUSD ?? null) : null;
      const dropHTML = drop ? `<div class="x-drop">▼ Bajó <b>${money(drop.usd, c, s)}</b> desde el ${shortDate(drop.at)}</div>` : '';
      const head = skin === 'steam'
        ? `<div class="x-h"><h4>${TITLES[k]}</h4><span class="x-mk">${TAG_SVG('#262a33', 13)}Where is cheap</span>${pendingOf(c, s).length ? '<span class="x-spin" aria-hidden="true"></span>' : ''}</div>`
        : `<div class="x-h"><b class="x-k">${TITLES[k]}</b>${pendingOf(c, s).length ? '<span class="x-spin" aria-hidden="true"></span>' : ''}</div>`;
      const best = skin === 'pop' && top && k === 'best'
        ? `<div class="x-best">${logo(top.store, STORES[top.store].name)}<div class="x-bl"><div class="x-bp"><b class="b-price big" tabindex="0">${money(top.totalUSD, c, s)}${tipHTML(top, c, s)}</b>${savings(c) ? `<span class="x-pct">−${savings(c)!.pct}%</span>` : ''}</div><div class="x-sub">${subHTML(c, s, top)}${s.currency === 'both' ? ` · ≈ ${local(top.totalUSD, c, s)}` : ''}</div></div><a class="x-go" href="${esc(top.url)}" target="_blank" rel="noopener noreferrer" data-store="${top.store}" data-i="${c.offers.indexOf(top)}">Ir ${ARROW}</a></div>`
        : '';
      $('.x-top').innerHTML = skin === 'steam'
        ? `${head}<div class="x-sub">${c.edition ? `<b style="color:#fff;font-weight:400">«${esc(c.edition)}»</b> · ` : ''}${subHTML(c, s, top)}${c.edition && hooks.std ? ' · <a href="#" data-a="std" style="color:#67c1f5">Volver a la estándar</a>' : ''}</div>${dropHTML}${chipsHTML(c, s, st, skin)}${actHTML(c, s, top)}`
        : `${head}${best || `<div class="x-sub x-solo">${subHTML(c, s, top)}</div>${k === 'owned' || k === 'steam' ? actHTML(c, s, top) : ''}`}${dropHTML}<div class="x-rows">${popRowsHTML(c, s)}</div>${chipsHTML(c, s, st, skin)}`;
    }
    for (const p of ['stores', 'chart', 'run', 'dlc', 'alert'] as const) paintPane(p);
    if (c) {
      trackClicks(box, c, toastRoot);
      askSellers();
      if (!dlcAsked && !c.pending?.length && !c.game.isDlc && !c.game.isFree) {
        dlcAsked = true;
        call<Omit<DlcView, 'open' | 'prices'>>('dlcList', { appid }).then((r) => { if (r.total) { st.dlc = { ...r, open: false, prices: {} }; paint(); } }).catch(() => {});
      }
    }
  }

  function closeMenu() { root.querySelector('.b-menu')?.remove(); }

  root.addEventListener('click', (ev) => {
    const ed = (ev.target as HTMLElement).closest<HTMLElement>('[data-ed]');
    if (ed && root.contains(ed) && hooks.edition) { ev.preventDefault(); hooks.edition(ed.dataset.ed!); return; }
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!el || !root.contains(el)) { closeMenu(); return; }
    const a = el.dataset.a;
    if (a !== 'menu' && !el.closest('.b-menu')) closeMenu();
    switch (a) {
      case 'pane': {
        const p = el.dataset.p as Exclude<Pane, null>;
        st.pane = st.pane === p ? null : p;
        paint();
        if (st.pane === 'dlc') void priceDlcs();
        if (st.pane === 'alert' && st.target == null) root.querySelector<HTMLInputElement>('#wic-target')?.focus();
        break;
      }
      case 'no': st.showNo = !st.showNo; paintPane('stores'); break;
      case 'refresh': case 'retry': hooks.refresh(); break;
      case 'options': hooks.options(); break;
      case 'std': ev.preventDefault(); hooks.std?.(); break;
      case 'pc': hooks.options('pc'); break;
      case 't-edit': st.target = null; paintPane('alert'); root.querySelector<HTMLInputElement>('#wic-target')?.focus(); paint(); break;
      case 't-clear':
        st.target = null;
        void call('setTarget', { appid, target: null }).catch(() => toast(toastRoot, 'No se pudo quitar el aviso'));
        paint();
        break;
      case 'menu': {
        ev.preventDefault();
        const was = root.querySelector('.b-menu')?.previousElementSibling;
        closeMenu();
        if (was && was === el.closest('.b-row')) break;
        const store = el.dataset.store as StoreId;
        const seller = el.dataset.seller;
        const nm = STORES[store].name;
        const m = document.createElement('div');
        m.className = 'b-menu';
        m.innerHTML = `<button type="button" data-a="hide-store" data-store="${store}">No mostrar ${nm}</button>${seller ? `<button type="button" data-a="hide-seller" data-seller="${esc(seller)}">No mostrar a ${esc(seller)}</button>` : ''}`;
        el.closest('.b-row')!.after(m);
        (m.firstElementChild as HTMLElement).focus();
        break;
      }
      case 'hide-store': {
        const id = el.dataset.store as StoreId;
        closeMenu();
        void saveSettings({ hiddenStores: [...new Set([...(s.hiddenStores ?? []), id])] }).then((ns) => { s = ns; hooks.refresh(); toast(toastRoot, `${STORES[id].name} oculta. Se vuelve a mostrar en Ajustes.`); });
        break;
      }
      case 'hide-seller': {
        const n = el.dataset.seller!;
        closeMenu();
        void saveSettings({ hiddenSellers: [...new Set([...(s.hiddenSellers ?? []), n])] }).then((ns) => { s = ns; paint(); toast(toastRoot, `${n} oculto. Se vuelve a mostrar en Ajustes.`); });
        break;
      }
    }
  });
  root.addEventListener('keydown', (ev) => { if ((ev as KeyboardEvent).key === 'Escape') closeMenu(); });
  // 8: guardar el límite (Enter o «Guardar»).
  root.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const inp = root.querySelector<HTMLInputElement>('#wic-target');
    if (!inp) return;
    const n = Number(inp.value);
    if (!(n > 0)) { inp.setCustomValidity('Pon un precio mayor que 0'); inp.reportValidity(); return; }
    inp.setCustomValidity('');
    st.target = Math.round(n * 100) / 100;
    void call('setTarget', { appid, target: st.target, name: last?.game.name }).then(() => toast(toastRoot, `Te avisamos si baja de $${st.target!.toFixed(2)}`)).catch(() => toast(toastRoot, 'No se pudo guardar el aviso'));
    (inp as HTMLElement).blur();
    paint();
  });

  void call<number | null>('getTarget', { appid }).then((t) => { st.target = t; if (last) paint(); }).catch(() => {});

  return {
    st,
    set(c) { last = c; paint(); },
    paint,
    current: () => last,
    setSettings(ns) { s = ns; },
    error(msg) {
      $('.x-top').innerHTML = `<div class="x-h">${skin === 'steam' ? '<h4>No pudimos comparar precios</h4>' : '<b class="x-k">No pudimos comparar precios</b>'}</div><div class="x-sub">${esc(msg)}</div><div class="x-chips"><button type="button" class="x-chip" data-a="retry">Reintentar</button></div>`;
      root.querySelectorAll<HTMLElement>('.x-pane').forEach((p) => (p.hidden = true));
    },
  };
}
