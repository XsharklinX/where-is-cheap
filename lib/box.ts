// 1.7: la caja de compra. En la ficha de Steam lleva la forma de las cajas «Buy» de Steam (skin 'steam'); en la ventana,
// la misma estructura con la estética de la extensión (skin 'pop'). Lo secundario va en chips que abren su parte debajo.
import { call, trackClicks } from './api';
import { alertHTML, blockCase, dlcBundle, dlcExtra, dlcHTML, dlcToPrice, giftScope, groupStores, panelFootHTML, pendingOf, regionShort, runChip, runPaneHTML, sellersToAsk, tableHTML, tipHTML, type BlockState, type DlcPrice, type DlcView } from './block';
import { savings } from './compare';
import { monthYear, nextSale, saleText } from './history';
import { saveSettings } from './settings';
import type { SellerNote } from './stores/kinguin';
import type { Compare, HistoryPoint, Offer, Settings, StoreId } from './types';
import { STORES } from './types';
import { andList, esc, failedNote, local, logo, money, shortDate, swapRows, TAG_SVG, toast, usd } from './ui';

export type Pane = 'stores' | 'chart' | 'run' | 'dlc' | 'alert' | null;
export type Skin = 'steam' | 'pop';
/** 1.8 (4): otra edición que fuera de Steam sale casi igual que la estándar. */
export interface Upsell { label: string; usd: number; diff: number }
export interface BoxState extends BlockState { pane: Pane; dlc: DlcView | null; target: number | null; upsell?: Upsell | null; full?: boolean }

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
  best: 'Más barato fuera de Steam',
  none: 'Fuera de Steam no hay ofertas que activen en RD',
} as const;

const kindLow = (o: Offer) => (o.kind === 'key' ? 'clave' : o.kind === 'gift' ? 'regalo' : 'cuenta');

/** 1.8 (5): si ya lo tienes, la oferta que más sirve para regalar: la que vale en cualquier país antes que la más barata. */
export function giftTop(c: Compare): Offer | undefined {
  const g = groupStores(c.offers, true).groups[0];
  return g && g.top.fit === 'ok' ? c.offers[g.top.i] : undefined;
}

function subHTML(c: Compare, s: Settings, top: Offer | undefined, skin: Skin = 'steam'): string {
  const k = blockCase(c, s);
  const waiting = pendingOf(c, s);
  const later = waiting.length ? ` · falta ${andList(waiting.map((id) => STORES[id].name))}` : '';
  const stale = c.staleAt ? ` · <span class="x-mute" title="Precios de la última vez; se están actualizando">${shortDate(c.staleAt)}</span>` : '';
  if (k === 'owned') {
    if (!top) return `Está en tu biblioteca.${later}`;
    const scope = giftScope(top) === 0 ? 'vale para cualquier país' : giftScope(top) === 2 ? 'solo si tu amigo es de RD' : `solo ${esc(regionShort(top))}`;
    return skin === 'steam'
      ? `Lo que vale para cualquier país, primero${later}`
      : `Para regalar: ${money(top.totalUSD, c, s)} en ${STORES[top.store].name}, ${scope}${later}`;
  }
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
function actHTML(c: Compare, s: Settings, top: Offer | undefined, inl = false): string {
  const k = blockCase(c, s);
  const cls = `x-act${inl ? ' inl' : ''}`;
  if (k === 'loading') return '<div class="x-act x-skel" aria-hidden="true"><i></i></div>';
  if (k !== 'best' || !top) {
    if (k === 'steam' && c.game.steamUSD != null) return `<div class="${cls}"><span class="x-pr">${money(c.game.steamUSD, c, s)} en Steam</span><span class="x-note">Cómpralo en Steam</span></div>`;
    if (k === 'owned' && top) return `<div class="${cls}"><span class="x-pr b-price" tabindex="0">${money(top.totalUSD, c, s)}${tipHTML(top, c, s)}</span><a class="x-go" href="${esc(top.url)}" target="_blank" rel="noopener noreferrer" data-store="${top.store}" data-i="${c.offers.indexOf(top)}">${logo(top.store, STORES[top.store].name)}Regalar desde ${STORES[top.store].name} ${ARROW}</a></div>`;
    return '';
  }
  const save = savings(c);
  const disc = save && c.game.steamUSD != null
    ? `<span class="x-disc"><span class="p">-${save.pct}%</span><span class="pp"><s>${money(c.game.steamUSD, c, s)}</s><b class="b-price" tabindex="0">${money(top.totalUSD, c, s)}${tipHTML(top, c, s)}</b></span></span>`
    : `<span class="x-pr b-price" tabindex="0">${money(top.totalUSD, c, s)}${tipHTML(top, c, s)}</span>`;
  const rd = s.currency === 'both' ? `<span class="x-rd">≈ ${local(top.totalUSD, c, s)}</span>` : '';
  const name = STORES[top.store].name;
  return `<div class="${cls}">${disc}${rd}<a class="x-go" href="${esc(top.url)}" target="_blank" rel="noopener noreferrer" data-store="${top.store}" data-i="${c.offers.indexOf(top)}">${logo(top.store, name)}Ir a ${name} ${ARROW}</a></div>`;
}

/** 1.8 (3): si el veredicto es esperar y hay línea propia, la píldora no lo repite. */
const waitShown = (c: Compare, s: Settings) => {
  const k = blockCase(c, s);
  return !c.owned && !pendingOf(c, s).length && c.verdict.kind === 'wait' && (k === 'best' || k === 'steam');
};

/** El precio más bajo guardado de un día anterior a hoy, con su fecha. */
function histLow(c: Compare, now = Date.now()): { usd: number; at: number } | null {
  const past = c.history.filter((p) => p.best != null && now - p.t > DAY);
  // 1.8.1: con menos de 14 días guardados, «estuvo a» no dice nada (y un precio raro de un día lo estropea).
  if (past.length < 3 || now - past[0].t < 14 * DAY) return null;
  const m = past.reduce((a, b) => (b.best! < a.best! ? b : a));
  return { usd: m.best!, at: m.t };
}

/** 1.8 (3): «Mejor esperar», con el mínimo y lo que podrías ahorrar. Sin inventar cifras: lo que no se sabe no sale. */
export function waitHTML(c: Compare, s: Settings, now = Date.now()): string {
  if (!waitShown(c, s)) return '';
  const top = c.offers.find((o) => o.fit === 'ok');
  const cur = Math.min(top?.totalUSD ?? Infinity, c.game.steamUSD ?? Infinity);
  if (!Number.isFinite(cur)) return '';
  const bits = ['<b class="w">Mejor esperar:</b>'];
  let low: number | null = null;
  if (c.low?.usd != null && c.low.usd > 0 && c.low.usd < cur - 0.01) {
    low = c.low.usd;
    bits.push(`el mínimo histórico fue de unos <b>${money(low, c, s)}</b> (${monthYear(c.low.date)}).`);
  } else {
    const h = histLow(c, now);
    if (h && h.usd < cur - 0.01) { low = h.usd; bits.push(`estuvo a <b>${money(h.usd, c, s)}</b> el ${shortDate(h.at)}.`); }
  }
  const sale = nextSale(now);
  if (!sale.live) {
    const save = low != null && cur - low >= 0.5 ? `: podrías ahorrar hasta <b class="sv">${money(cur - low, c, s)}</b>` : '';
    bits.push(`${esc(sale.name)} en ${sale.days === 1 ? '1 día' : `${sale.days} días`}${save}.`);
  }
  return `<div class="x-line wait"><span>${bits.join(' ')}</span><button type="button" class="x-lk" data-a="pane" data-p="chart">Ver historial ▸</button></div>`;
}

/** 1.8.1: el panel del veredicto, sin gráfica. Hoy fuera, Steam, el mínimo de fiar y la razón del veredicto. */
export function factsHTML(c: Compare, s: Settings, now = Date.now()): string {
  const top = c.offers.find((o) => o.fit === 'ok');
  const tile = (label: string, value: string, sub: string, cls = '') => `<div class="x-ft${cls ? ` ${cls}` : ''}"><span>${label}</span><b>${value}</b><small>${sub}</small></div>`;
  const tiles = [
    top ? tile('Hoy fuera de Steam', money(top.totalUSD, c, s), esc(STORES[top.store].name), 'x-fb') : tile('Hoy fuera de Steam', '—', 'Sin ofertas que activen en RD'),
    c.game.steamUSD != null ? tile('En Steam', money(c.game.steamUSD, c, s), c.game.steamDiscount ? `con −${c.game.steamDiscount} %` : 'precio normal') : tile('En Steam', '—', 'No se vende ahora'),
  ];
  const h = histLow(c, now);
  if (c.low?.usd != null && c.low.usd > 0) tiles.push(tile('Mínimo histórico', `≈ ${money(c.low.usd, c, s)}`, `−${c.low.pct} % en ${monthYear(c.low.date)}`, 'x-fl'));
  else if (h) tiles.push(tile('Lo más bajo que vimos', money(h.usd, c, s), `el ${shortDate(h.at)}`, 'x-fl'));
  else tiles.push(tile('Mínimo histórico', 'Sin datos', 'Se llena con los días'));
  const sale = nextSale(now);
  const saleLine = sale.live || (sale.bf && sale.days <= 30) ? `<p class="x-fs">${esc(saleText(sale))}. ${sale.live ? 'Las tiendas de claves también bajan estos días.' : 'Steam y las tiendas de claves suelen bajar esa semana.'}</p>` : '';
  const why = c.verdict.detail && !c.verdict.detail.startsWith(saleText(sale)) ? `<p class="x-fs">${esc(c.verdict.detail)}</p>` : '';
  return `<div class="x-facts">${tiles.join('')}</div>${why}${saleLine}`;
}

/** 1.8 (4): la edición superior, si fuera de Steam sale casi igual que la estándar. */
function upsellHTML(c: Compare, s: Settings, st: BoxState): string {
  const u = st.upsell;
  if (!u || c.edition || c.owned || blockCase(c, s) !== 'best') return '';
  const more = u.diff > 0.005 ? `solo <b class="sv">${money(u.diff, c, s)} más</b>` : '<b class="sv">lo mismo o menos</b>';
  return `<div class="x-line"><span>${TAG_SVG('#ffb547', 11)}</span><span>La <b class="n">${esc(u.label)}</b> fuera de Steam: <b>${money(u.usd, c, s)}</b>, ${more}</span><button type="button" class="x-lk" data-ed="${esc(u.label)}">Ver ofertas ▸</button></div>`;
}

/** 1.8 (7): toda la caja en una línea; «Ver ofertas» abre la completa. */
function lineHTML(c: Compare | null, s: Settings): string {
  const tag = `<span class="x-tg">${TAG_SVG('#ffb547', 12)}</span>`;
  const more = '<button type="button" class="x-lk" data-a="full">Ver ofertas ▸</button>';
  if (!c) return `${tag}<span class="x-mute">Fuera de Steam: buscando…</span>`;
  const k = blockCase(c, s);
  const top = c.offers.find((o) => o.fit === 'ok');
  if (k === 'loading') return `${tag}<span class="x-mute">Fuera de Steam: buscando…</span>`;
  if (k === 'owned') {
    const g = giftTop(c);
    return `${tag}<span>Ya lo tienes${g ? ` · para regalar, <b>${money(g.totalUSD, c, s)}</b> en ${STORES[g.store].name}` : ''}</span>${g ? more : ''}`;
  }
  if (k === 'none') return `${tag}<span class="x-mute">Fuera de Steam no hay ofertas que activen en RD.</span>${c.offers.length ? more : ''}`;
  if (k === 'steam') return `${tag}<span>Steam tiene el mejor precio. Fuera, desde ${money(top!.totalUSD, c, s)} en ${STORES[top!.store].name}.</span>${more}`;
  const save = savings(c);
  const tail = ['activa en RD'];
  if (save && c.game.steamUSD != null) tail.push(`ahorras ${money(c.game.steamUSD - top!.totalUSD, c, s)}`);
  if (waitShown(c, s)) tail.push('<span class="w">mejor esperar</span>');
  return `${tag}<span>Fuera de Steam: <b>${money(top!.totalUSD, c, s)}</b> en ${STORES[top!.store].name}</span><span class="x-mute">· ${tail.join(' · ')}</span>${more}`;
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
      if (!(skin === 'steam' && waitShown(c, s))) out.push(chip('chart', st, `<i></i>${esc(label)}${sale ? ` · ${esc(sale)}` : ''}`, cls, v.detail));
      // 1.8.1: sin la línea en miniatura (con pocos días no decía nada); el mínimo solo si es de fiar.
      if (c.low?.usd != null && c.low.usd > 0) out.push(chip('chart', st, `<span>mín. histórico <b>${usd(c.low.usd)}</b></span>`, '', `Lo más bajo en tiendas oficiales (${monthYear(c.low.date)})`));
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
    const label = others.length ? `${others.length === 1 ? `${STORES[others[0].store].name} ${money(others[0].top.totalUSD, c, s)}` : k === 'best' ? `${others.length} tiendas más` : `${others.length} tiendas`}` : `${no.length} no ${no.length === 1 ? 'activa' : 'activan'} en RD`;
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
      el.innerHTML = factsHTML(last, s);
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
    const k = blockCase(c, s);
    const top = c && k === 'owned' ? giftTop(c) : c?.offers.find((o) => o.fit === 'ok');
    // 7: la caja en una línea, hasta que pulses «Ver ofertas».
    const line = skin === 'steam' && s.boxMode === 'line' && !st.full;
    box.classList.toggle('line', line);
    if (line) {
      $('.x-top').innerHTML = `<div class="x-l1">${lineHTML(c, s)}</div>`;
      box.classList.remove('open');
      root.querySelectorAll<HTMLElement>('.x-pane').forEach((p) => (p.hidden = true));
      if (c) trackClicks(box, c, toastRoot);
      return;
    }
    if (!c) {
      box.classList.remove('open');
      $('.x-top').innerHTML = `<div class="x-h">${skin === 'steam' ? `<h4>${TITLES.loading}</h4><span class="x-mk">${TAG_SVG('#262a33', 13)}Where is cheap</span>` : ''}</div><div class="x-sub x-skel"><i></i></div>${chipsHTML(null, s, st, skin)}<div class="x-act x-skel" aria-hidden="true"><i></i></div>`;
    } else {
      const drop = k === 'best' && !c.staleAt ? dropSince(c.history, top?.totalUSD ?? null) : null;
      const dropHTML = drop ? `<div class="x-drop">▼ Bajó <b>${money(drop.usd, c, s)}</b> desde el ${shortDate(drop.at)}</div>` : '';
      const spin = pendingOf(c, s).length ? '<span class="x-spin" aria-hidden="true"></span>' : '';
      const title = k === 'owned' && top ? 'Ya lo tienes · para regalar' : TITLES[k];
      // 1: con un panel abierto, el precio y el botón suben a la fila del título y no cuelgan bajo la tabla.
      const act = actHTML(c, s, top);
      const open = skin === 'steam' && st.pane != null && act !== '';
      box.classList.toggle('open', open);
      const subLine = `<div class="x-sub">${c.edition ? `<b style="color:#fff;font-weight:400">«${esc(c.edition)}»</b> · ` : ''}${subHTML(c, s, top)}${c.edition && hooks.std ? ' · <a href="#" data-a="std" style="color:#67c1f5">Volver a la estándar</a>' : ''}</div>`;
      const head = skin === 'steam'
        ? open
          ? `<div class="x-h x-ho"><div class="x-ht"><h4>${title}</h4>${subLine}</div>${spin}${actHTML(c, s, top, true)}</div>`
          : `<div class="x-h"><h4>${title}</h4><span class="x-mk">${TAG_SVG('#262a33', 13)}Where is cheap</span>${spin}</div>${subLine}`
        : `<div class="x-h"><b class="x-k">${title}</b>${spin}</div>`;
      const best = skin === 'pop' && top && k === 'best'
        ? `<div class="x-best">${logo(top.store, STORES[top.store].name)}<div class="x-bl"><div class="x-bp"><b class="b-price big" tabindex="0">${money(top.totalUSD, c, s)}${tipHTML(top, c, s)}</b>${savings(c) ? `<span class="x-pct">−${savings(c)!.pct}%</span>` : ''}</div><div class="x-sub">${subHTML(c, s, top)}${s.currency === 'both' ? ` · ≈ ${local(top.totalUSD, c, s)}` : ''}</div></div><a class="x-go" href="${esc(top.url)}" target="_blank" rel="noopener noreferrer" data-store="${top.store}" data-i="${c.offers.indexOf(top)}">Ir ${ARROW}</a></div>`
        : '';
      $('.x-top').innerHTML = skin === 'steam'
        ? `${head}${waitHTML(c, s)}${upsellHTML(c, s, st)}${dropHTML}${chipsHTML(c, s, st, skin)}${open ? '' : act}`
        : `${head}${best || `<div class="x-sub x-solo">${subHTML(c, s, top, 'pop')}</div>${k === 'owned' || k === 'steam' ? actHTML(c, s, top) : ''}`}${dropHTML}<div class="x-rows">${popRowsHTML(c, s)}</div>${chipsHTML(c, s, st, skin)}`;
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
      case 'full': st.full = true; st.pane = 'stores'; paint(); break;
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
