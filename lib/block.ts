// 1.2: el bloque de la ficha de Steam. La mejor oferta y su botón a la vista (1), una fila por tienda (2), lo que no
// activa en RD plegado (3), el desglose en un globo (4), Steam como vara de medir (5), el gráfico con veredicto (6),
// una forma por caso (7), el aviso de precio (8) y un esqueleto con el tamaño final mientras carga (10).
import { savings } from './compare';
import { monthYear, nextSale, saleText } from './history';
import { partLabel, type PartCheck, type PcPart, type RunCheck } from './pc';
import { prettyRegion } from './region';
import type { SellerNote } from './stores/kinguin';
import type { Compare, Edition, Offer, Settings, StoreId } from './types';
import { CURRENCIES, STORES } from './types';
import { andList, esc, failedNote, footHTML, local, localNum, logo, money, shortDate, TAG_SVG, usd } from './ui';

export interface BlockState { open: boolean; showNo: boolean; chart: boolean; editions: Edition[]; edition?: string; run?: RunCheck | null; sellers?: Record<string, SellerNote | null> }

/** Una tienda con su mejor oferta y las demás que tiene. i es la posición en c.offers (para apuntar el clic). */
export interface StoreGroup { store: StoreId; top: Offer & { i: number }; rest: (Offer & { i: number })[] }

/** 2 y 3: ofertas que sirven agrupadas por tienda (la más barata primero) y las que no activan en RD, aparte. */
export function groupStores(offers: Offer[]): { groups: StoreGroup[]; no: (Offer & { i: number })[] } {
  const withI = offers.map((o, i) => ({ ...o, i }));
  const usable = withI.filter((o) => o.fit !== 'no').sort((a, b) => (a.fit === 'ok' ? 0 : 1) - (b.fit === 'ok' ? 0 : 1) || a.totalUSD - b.totalUSD);
  const by = new Map<StoreId, StoreGroup>();
  for (const o of usable) {
    const g = by.get(o.store);
    if (g) g.rest.push(o); else by.set(o.store, { store: o.store, top: o, rest: [] });
  }
  return { groups: [...by.values()], no: withI.filter((o) => o.fit === 'no').sort((a, b) => a.totalUSD - b.totalUSD) };
}

const kindShort = (o: Offer) => (o.kind === 'key' ? 'Clave' : o.kind === 'gift' ? 'Regalo' : 'Cuenta');
export function regionShort(o: Offer): string {
  if (o.regionCheckedByStore) return o.regions.some((r) => /global|worldwide|ww/i.test(r)) ? 'Global' : 'Tu país';
  return o.regions.map(prettyRegion).join(', ') || 'sin región';
}
const ARROW = '<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** 4: la cuenta entera de una oferta, para el globo del precio. */
export function tipHTML(o: Offer, c: Compare, s: Settings): string {
  const st = STORES[o.store].name;
  const est = c.feesChecked?.[o.store] ? '' : ' (est.)';
  const lines = [`<div><span>Precio en ${st}</span><span>${usd(o.priceUSD)}</span></div>`];
  if (o.couponUSD > 0) lines.push(`<div><span>Cupón ${esc(o.coupon ?? '')}</span><span>− ${usd(o.couponUSD)}</span></div>`);
  lines.push(o.feeUSD > 0 ? `<div><span>Comisión de ${st}${est}</span><span>+ ${usd(o.feeUSD)}</span></div>` : '<div><span>Comisión</span><span>sin comisión</span></div>');
  lines.push(`<div class="t"><span>Pagas</span><span>${usd(o.totalUSD)}</span></div>`);
  if (s.currency !== 'usd') {
    const curName = (CURRENCIES[s.localCurrency]?.name ?? s.localCurrency).toLowerCase();
    const fx = s.localCurrency === 'DOP' && c.rates.fxPct ? `, con el ${String(c.rates.fxPct).replace('.', ',')} % de tu banco` : '';
    lines.push(`<div><span>En ${esc(curName)}${fx}</span><span>${local(o.totalUSD, c, s)}</span></div>`);
  }
  const note = o.feeUSD > 0 && est ? '<small>Comisión estimada hasta que confirmes una compra en esta tienda.</small>' : '';
  return `<span class="b-tip" role="tooltip">${lines.join('')}${note}</span>`;
}

/** Precio con su globo; se abre al pasar el ratón o al enfocarlo con el teclado. */
const priced = (o: Offer, c: Compare, s: Settings, cls: string) =>
  `<span class="b-price ${cls}" tabindex="0">${money(o.totalUSD, c, s)}${tipHTML(o, c, s)}</span>`;

export const pendingOf = (c: Compare, s: Settings) => (c.pending ?? []).filter((id) => (s.marketplaces || !STORES[id].marketplace) && !s.hiddenStores?.includes(id));

/** 7: qué caso es. */
export type BlockCase = 'loading' | 'owned' | 'steam' | 'best' | 'none';
export function blockCase(c: Compare | null, s: Settings): BlockCase {
  if (!c) return 'loading';
  const top = c.offers.find((o) => o.fit === 'ok');
  if (c.owned) return 'owned';
  if (top && c.game.steamUSD != null && c.game.steamUSD <= top.totalUSD) return 'steam';
  if (top) return 'best';
  return pendingOf(c, s).length ? 'loading' : 'none';
}

const TITLES: Record<BlockCase, string> = {
  loading: 'Buscando el mejor precio',
  owned: 'Ya lo tienes',
  steam: 'Steam tiene el mejor precio',
  best: 'Más barato fuera de Steam',
  none: 'Sin ofertas que activen en RD',
};

/** 6: la píldora del veredicto, que abre el gráfico. */
function verdictPill(c: Compare | null, st: BlockState): string {
  if (!c || c.pending?.length) return '<span class="b-verdict gh"><i></i>Calculando…</span>';
  const v = c.verdict;
  const cls = v.kind === 'buy' ? 'ok' : v.kind === 'wait' ? 'wait' : 'gh';
  const label = v.kind === 'buy' ? 'Buen precio' : v.kind === 'wait' ? 'Mejor esperar' : v.title;
  return `<button type="button" class="b-verdict ${cls}" data-a="chart" aria-expanded="${st.chart}" title="${esc(v.detail)}"><i></i>${esc(label)} <span aria-hidden="true">${st.chart ? '▴' : '▾'}</span></button>`;
}

function editionsHTML(st: BlockState): string {
  if (st.editions.length < 2) return '';
  const b = (label: string, v: string) => `<button type="button" role="radio" aria-checked="${(st.edition ?? '') === v}" data-ed="${esc(v)}">${esc(label)}</button>`;
  return `<span class="b-eds" role="radiogroup" aria-label="Edición">${st.editions.map((e, i) => b(e.label, i === 0 ? '' : e.label)).join('')}</span>`;
}

export function headHTML(c: Compare | null, s: Settings, st: BlockState): string {
  const k = blockCase(c, s);
  const spin = c && pendingOf(c, s).length ? '<span class="b-spin" aria-hidden="true"></span>' : '';
  // 1.5: si esto es una caché vieja que se está refrescando, se dice cuándo se guardó.
  const stale = c?.staleAt ? `<span class="b-stale" title="Precios de la última vez; se están actualizando" style="color:var(--mute);font-size:11px;font-weight:400">· ${shortDate(c.staleAt)}</span>` : '';
  return `<div class="b-h">${TAG_SVG('#1f1a22', 16)}<span class="b-k">${TITLES[k]}</span>${stale}${spin}${editionsHTML(st)}${c?.owned ? '' : verdictPill(c, st)}</div>`;
}

/** 10: el esqueleto ocupa lo mismo que el bloque terminado, para que la página no salte al llegar los precios. */
const SKELETON = `<div class="b-main b-skel" aria-hidden="true"><span class="b-sq"></span><div class="b-sl"><i style="width:38%;height:22px"></i><i style="width:64%"></i></div><i class="b-sb"></i></div>
  <div class="b-bar b-skel" aria-hidden="true"><i style="width:100%;height:6px"></i><i style="width:52%"></i></div>`;

function mainHTML(c: Compare, s: Settings): string {
  const k = blockCase(c, s);
  const waiting = pendingOf(c, s);
  const later = waiting.length ? ` · falta ${andList(waiting.map((id) => STORES[id].name))}` : '';
  const top = c.offers.find((o) => o.fit === 'ok');
  if (k === 'owned') {
    return `<div class="b-main one"><span class="b-ic">✓</span><div><div class="b-t">Está en tu biblioteca</div><div class="b-s">${top ? `Para regalar: desde ${money(top.totalUSD, c, s)} en ${STORES[top.store].name}` : 'No hace falta comprarlo otra vez.'}${later}</div></div></div>`;
  }
  if (k === 'none') {
    const nNo = c.offers.filter((o) => o.fit === 'no').length;
    const why = c.offers.length ? `Hay ${c.offers.length} ${c.offers.length === 1 ? 'oferta' : 'ofertas'}${nNo === c.offers.length ? ' de otras regiones' : ' de otras regiones, cuentas o precios sospechosos'}.` : c.failed.length ? esc(failedNote(c)) : 'No está en Instant Gaming, Eneba, Driffle ni Kinguin. Buscamos el mismo juego y la misma edición.';
    return `<div class="b-main one"><span class="b-ic">—</span><div><div class="b-t">${c.game.steamUSD != null ? `Cómpralo en Steam: ${money(c.game.steamUSD, c, s)}` : 'Steam no lo vende ahora en tu región'}</div><div class="b-s">${why}</div></div></div>`;
  }
  if (k === 'steam') {
    const disc = c.game.steamDiscount ? `<span class="b-pct">−${c.game.steamDiscount}%</span>` : '';
    return `<div class="b-main">${logo('steam', 'Steam')}<div><div class="b-p"><b>${money(c.game.steamUSD!, c, s)}</b>${disc}</div><div class="b-s">en Steam · la mejor clave cuesta ${money(top!.totalUSD, c, s)} en ${STORES[top!.store].name}${later}</div></div><span class="b-note">Cómpralo arriba, en Steam</span></div>`;
  }
  if (!top) return SKELETON;
  const save = savings(c);
  const name = STORES[top.store].name;
  const rd = s.currency === 'both' ? `<span class="b-rd">≈ ${local(top.totalUSD, c, s)}${c.rates.fxPct && s.localCurrency === 'DOP' ? ' con tu tarjeta' : ''}</span>` : '';
  const sub = [`en ${name}`, `${kindShort(top).toLowerCase()} de Steam ${regionShort(top) === 'Global' ? 'global' : esc(regionShort(top))}`, '<span class="ok">activa en RD</span>'];
  if (top.coupon) sub.push(`con tu cupón ${esc(top.coupon)}`);
  const lead = waiting.length ? 'Por ahora, ' : '';
  return `<div class="b-main">${logo(top.store, name)}
    <div><div class="b-p">${priced(top, c, s, 'big')}${save ? `<span class="b-pct">−${save.pct}%</span>` : ''}${rd}</div><div class="b-s">${lead}${sub.join(' · ')}${later}</div></div>
    <a class="b-go" href="${esc(top.url)}" target="_blank" rel="noopener noreferrer" data-store="${top.store}" data-i="${c.offers.indexOf(top)}">Ir a ${name} ${ARROW}</a></div>`;
}

/** 5: cada tienda frente al precio de Steam; el tramo verde es lo que ahorras. */
export function barHTML(c: Compare, s: Settings): string {
  const steam = c.game.steamUSD;
  const { groups } = groupStores(c.offers);
  const pts = groups.filter((g) => g.top.fit === 'ok').map((g) => ({ store: g.store, p: g.top.totalUSD }));
  if (steam == null || !pts.length || c.owned) return '';
  const all = [...pts.map((x) => x.p), steam];
  const lo = Math.min(...all), hi = Math.max(...all);
  const pos = (p: number) => (hi - lo < 0.01 ? 50 : 3 + ((p - lo) / (hi - lo)) * 94);
  const best = pts[0];
  const dots = pts.slice(1).map((x) => `<span class="dot" style="left:${pos(x.p).toFixed(1)}%" title="${STORES[x.store].name} ${usd(x.p)}"></span>`).join('');
  const save = best.p < steam ? `<span class="sv" style="left:${pos(best.p).toFixed(1)}%;width:${(pos(steam) - pos(best.p)).toFixed(1)}%"></span>` : '';
  const label = (p: number, text: string, cls: string) => {
    const x = pos(p);
    const anchor = x < 12 ? 'l' : x > 88 ? 'r' : 'c';
    return `<span class="tk ${cls} ${anchor}" style="left:${x.toFixed(1)}%">${text}</span>`;
  };
  const lowTxt = c.low?.usd != null ? ` Lo más bajo que ha estado: <b>${usd(c.low.usd)}</b> en ${monthYear(c.low.date)}.` : '';
  const line = best.p < steam
    ? `Ahorras <b>${money(steam - best.p, c, s)}</b> frente a Steam.${lowTxt}`
    : `Steam está ${money(best.p - steam, c, s)} más barato que la mejor clave.${lowTxt}`;
  return `<div class="b-bar"><div class="track" role="img" aria-label="${esc(`${STORES[best.store].name} ${usd(best.p)}, Steam ${usd(steam)}`)}">
      <span class="ln"></span>${save}${dots}
      <span class="dot best" style="left:${pos(best.p).toFixed(1)}%"></span><span class="dot stm" style="left:${pos(steam).toFixed(1)}%"></span>
      ${label(best.p, `${STORES[best.store].name} ${usd(best.p)}`, 'dn')}${label(steam, `Steam ${usd(steam)}`, 'up')}
    </div><p>${line}</p></div>`;
}

/** Las otras tiendas en una línea, y el botón para abrir la tabla. */
function altHTML(c: Compare, s: Settings, st: BlockState): string {
  const { groups, no } = groupStores(c.offers);
  const k = blockCase(c, s);
  const others = (k === 'best' ? groups.slice(1) : groups).filter((g) => g.top.fit === 'ok').slice(0, 3);
  const usable = groups.reduce((n, g) => n + 1 + g.rest.length, 0);
  const total = usable + no.length;
  if (!total && !pendingOf(c, s).length) return '';
  const chips = st.open ? '' : others.map((g) => `<span class="o">${logo(g.store, STORES[g.store].name)}${STORES[g.store].name} <b>${money(g.top.totalUSD, c, s)}</b></span>`).join('');
  const lbl = st.open ? 'Ocultar ▴' : usable ? `Ver ${usable === 1 ? 'la oferta' : `las ${usable} ofertas`} ▾` : `Ver ${total === 1 ? 'la oferta' : `las ${total} ofertas`} ▾`;
  return `<div class="b-alt">${chips}<button type="button" class="b-more" data-a="toggle" aria-expanded="${st.open}">${lbl}</button></div>`;
}

/** 2 y 3: la tabla, con una fila por tienda y lo que no sirve plegado al final. */
export function tableHTML(c: Compare, s: Settings, st: BlockState): string {
  const { groups, no } = groupStores(c.offers);
  const both = s.currency === 'both';
  const bestI = c.offers.findIndex((o) => o.fit === 'ok');
  const row = (o: Offer & { i: number }) => {
    const nm = STORES[o.store].name;
    const who = o.fit === 'warn'
      ? `<span class="chip warn" data-tip="${esc(o.fitWhy)}" tabindex="0">${esc(o.fitText)}</span>`
      : sellerHTML(st.sellers?.[o.url]) || `<span>${STORES[o.store].marketplace ? 'vende un tercero' : 'tienda'}</span>`;
    const seller = st.sellers?.[o.url]?.name;
    return `<div class="b-row${o.i === bestI ? ' best' : ''}" data-k="${esc(`${o.store}|${o.url}`)}"><a class="b-rl" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer" data-store="${o.store}" data-i="${o.i}" title="${esc(o.coupon ? `Abrir en ${nm} y copiar el cupón ${o.coupon}` : `Abrir en ${nm}`)}">
      ${logo(o.store, nm)}<span class="nm"><b>${nm}</b>${who}</span><span class="ty">${kindShort(o)} · ${esc(regionShort(o))}</span>
      ${priced(o, c, s, 'tot')}${both ? `<span class="rd">${localNum(o.totalUSD, c, s)}</span>` : ''}<span class="ir">${ARROW}</span></a><button type="button" class="b-mn" data-a="menu" data-store="${o.store}"${seller ? ` data-seller="${esc(seller)}"` : ''} aria-label="Más opciones de ${nm}" title="Ocultar esta tienda o este vendedor">…</button></div>`;
  };
  const sub = (g: StoreGroup) => !g.rest.length ? '' : `<div class="b-sub" data-k="sub|${g.store}"><span>+${g.rest.length} de ${STORES[g.store].name}</span>${g.rest.map((o) =>
    ` · <a href="${esc(o.url)}" target="_blank" rel="noopener noreferrer" data-store="${o.store}" data-i="${o.i}">${kindShort(o)} ${esc(regionShort(o))} ${money(o.totalUSD, c, s)}</a>`).join('')}</div>`;
  const waits = pendingOf(c, s).map((id) => `<div class="b-row wait" data-k="wait|${id}" aria-hidden="true">${logo(id, STORES[id].name)}<span class="nm"><b>${STORES[id].name}</b><span>Buscando…</span></span><span class="ty"></span><span class="barw"></span>${both ? '<span class="rd"></span>' : ''}<span></span><span></span></div>`);
  let fold = '';
  if (no.length) {
    const regions = [...new Set(no.flatMap((o) => o.regions.map(prettyRegion)))];
    fold = `<button type="button" class="b-fold" data-a="no" aria-expanded="${st.showNo}" data-k="fold"><span class="nx">${no.length} ${no.length === 1 ? 'oferta no activa' : 'ofertas no activan'} en RD</span><span class="mute">${esc(andList(regions.slice(0, 3)))}${regions.length > 3 ? ' y otras' : ''} · desde ${money(no[0].totalUSD, c, s)}</span><span class="chev">${st.showNo ? 'Ocultar ▴' : 'Mostrar ▸'}</span></button>`;
    if (st.showNo) fold += no.map((o) => `<div class="b-row no" data-k="no|${esc(o.url)}">${logo(o.store, STORES[o.store].name)}<span class="nm"><b>${STORES[o.store].name}</b><span class="chip no" data-tip="${esc(o.fitWhy)}" tabindex="0">${esc(o.fitText)}</span></span><span class="ty">${kindShort(o)} · ${esc(regionShort(o))}</span><span class="tot"><s>${money(o.totalUSD, c, s)}</s></span>${both ? '<span class="rd"></span>' : ''}<span></span><span></span></div>`).join('');
  }
  const head = `<div class="b-row th" data-k="th"><span></span><span>Tienda</span><span class="ty">Tipo</span><span class="r">Pagas</span>${both ? '<span class="r rd">RD$</span>' : ''}<span></span><span></span></div>`;
  const body = groups.map((g) => row(g.top) + sub(g)).join('') + waits.join('') + fold;
  return head + (body || '<p class="b-empty">Ninguna tienda tiene este juego.</p>');
}

/** 6: gráfico del historial con Steam, la mejor oferta y el mínimo histórico. */
export function chartHTML(c: Compare, s: Settings): string {
  const v = c.verdict;
  const pts = c.history.filter((p) => p.best != null || p.steam != null);
  const lowUSD = c.low?.usd ?? null;
  const detail = `<p class="b-vd">${esc(v.detail)}</p>`;
  if (pts.length < 2) return `<div class="b-chart">${detail}<p class="mute">El gráfico se llena cada vez que miras el juego. Hoy hay ${pts.length ? 'un día' : 'ningún día'} guardado.</p></div>`;
  const W = 560, H = 150, L = 42, R = 10, T = 10, B = 22;
  const vals = pts.flatMap((p) => [p.best, p.steam]).filter((x): x is number => x != null);
  if (lowUSD != null) vals.push(lowUSD);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max(1, (hi - lo) * 0.15); lo = Math.max(0, lo - pad); hi += pad;
  const t0 = pts[0].t, t1 = Math.max(pts[pts.length - 1].t, t0 + 1);
  const x = (t: number) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
  const y = (p: number) => T + ((hi - p) / (hi - lo)) * (H - T - B);
  const path = (k: 'best' | 'steam', step: boolean) => {
    const list = pts.filter((p) => p[k] != null);
    return list.map((p, i) => (i === 0 ? `M${x(p.t).toFixed(1)},${y(p[k]!).toFixed(1)}` : step ? `H${x(p.t).toFixed(1)}V${y(p[k]!).toFixed(1)}` : `L${x(p.t).toFixed(1)},${y(p[k]!).toFixed(1)}`)).join('');
  };
  const bestPts = pts.filter((p) => p.best != null);
  const area = bestPts.length > 1 ? `<path d="${path('best', false)}L${x(bestPts[bestPts.length - 1].t).toFixed(1)},${H - B}L${x(bestPts[0].t).toFixed(1)},${H - B}Z" fill="url(#wic-ga)"/>` : '';
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const grid = ticks.map((v2) => `<line x1="${L}" x2="${W - R}" y1="${y(v2).toFixed(1)}" y2="${y(v2).toFixed(1)}" stroke="#26212a"/><text x="${L - 6}" y="${(y(v2) + 3.5).toFixed(1)}" text-anchor="end">$${v2.toFixed(0)}</text>`).join('');
  const fmt = (t: number) => new Date(t).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });
  const xl = `<text x="${L}" y="${H - 6}">${fmt(t0)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">hoy</text>`;
  const low = lowUSD != null && lowUSD >= lo && lowUSD <= hi
    ? `<line x1="${L}" x2="${W - R}" y1="${y(lowUSD).toFixed(1)}" y2="${y(lowUSD).toFixed(1)}" stroke="#45d69b" stroke-dasharray="4 4"/><text x="${W - R}" y="${(y(lowUSD) - 4).toFixed(1)}" text-anchor="end" fill="#45d69b">mínimo ${usd(lowUSD)}</text>` : '';
  const last = bestPts[bestPts.length - 1];
  const dot = last ? `<circle cx="${x(last.t).toFixed(1)}" cy="${y(last.best!).toFixed(1)}" r="4.5" fill="#ffb547" stroke="#141116" stroke-width="2"/>` : '';
  const days = Math.max(1, Math.round((t1 - t0) / 86_400_000));
  return `<div class="b-chart">${detail}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Precio en ${days} días">
    <defs><linearGradient id="wic-ga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffb547" stop-opacity=".25"/><stop offset="1" stop-color="#ffb547" stop-opacity="0"/></linearGradient></defs>
    ${grid}${xl}${area}${low}<path d="${path('steam', true)}" fill="none" stroke="#66c0f4" stroke-width="1.8"/><path d="${path('best', false)}" fill="none" stroke="#ffb547" stroke-width="2.2" stroke-linejoin="round"/>${dot}
  </svg><div class="b-leg"><span><i style="background:#66c0f4"></i>Steam</span><span><i style="background:#ffb547"></i>Mejor oferta que activa en RD</span>${low ? '<span><i class="dash"></i>Mínimo histórico</span>' : ''}<span>${days} ${days === 1 ? 'día' : 'días'}${s.currency === 'dop' ? ' · en dólares' : ''}</span></div></div>`;
}

/** 8: «Avísame si baja de…». */
export function alertHTML(target: number | null, c: Compare | null): string {
  const hint = c?.low?.usd != null ? `Mínimo histórico ${usd(c.low.usd)}. ` : '';
  if (target != null) {
    return `<div class="b-alert set"><span>Te avisamos si baja de <b>${usd(target)}</b>.</span><button type="button" data-a="t-edit">Cambiar</button><button type="button" data-a="t-clear">Quitar</button></div>`;
  }
  return `<form class="b-alert" data-a="t-form"><label for="wic-target">Avísame si baja de</label><span class="in">$<input id="wic-target" type="number" min="0.5" step="0.5" inputmode="decimal" placeholder="${c?.low?.usd != null ? c.low.usd.toFixed(2) : ''}"></span><button type="submit" class="b-save">Guardar</button><small>${hint}Te llega una notificación del navegador, aunque no esté en tu lista de deseos.</small></form>`;
}

/** Las partes que cambian con cada tienda que responde. El aviso de precio va aparte para no borrar lo que escribes. */
export function topHTML(c: Compare | null, s: Settings, st: BlockState): string {
  if (!c) return headHTML(null, s, st) + SKELETON + '<div class="b-alt b-skel" aria-hidden="true"><i style="width:46%"></i></div>';
  const k = blockCase(c, s);
  return headHTML(c, s, st) + (st.chart && !c.pending?.length ? chartHTML(c, s) : '') + (k === 'loading' && !c.offers.some((o) => o.fit === 'ok') ? SKELETON : mainHTML(c, s) + barHTML(c, s)) + (k === 'best' || k === 'steam' ? saleHTML() : '') + runHTML(st.run) + altHTML(c, s, st);
}

export function panelFootHTML(c: Compare, s: Settings): string {
  return `<div class="b-f">${footHTML(c, s)}<button type="button" data-a="refresh">Actualizar</button><button type="button" data-a="options">Ajustes</button></div>`;
}

/** Las rebajas grandes, en una línea: en marcha, o las de otoño (Black Friday) a 30 días o menos. */
export function saleHTML(now = Date.now()): string {
  const sale = nextSale(now);
  if (!sale.live && !(sale.bf && sale.days <= 30)) return '';
  const tail = sale.live ? 'Las tiendas de claves también bajan estos días.' : 'Si no te corre prisa, espera: Steam y las tiendas de claves bajan esa semana.';
  return `<div class="b-sale${sale.live ? ' live' : ''}"><b>${esc(saleText(sale))}.</b> ${tail}</div>`;
}

/* ---------- 4: ¿Lo corre mi PC? ---------- */

const ART: Record<PcPart, string> = { gpu: 'la gráfica', cpu: 'el procesador', ram: 'la memoria' };
const LVL: Record<PartCheck['level'], [string, string]> = {
  rec: ['ok', '✓ Recomendado'],
  min: ['warn', '✓ Mínimo'],
  below: ['no', '✗ No llega'],
  unknown: ['gh', '¿?'],
};
const cut = (t: string, n = 64) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** «la gráfica», «la gráfica y la memoria». */
function partsText(ps: PartCheck[]): string {
  return andList(ps.map((p) => ART[p.part]));
}

/** La línea del bloque, con un globo que explica cada componente. Vacía si el juego no da requisitos. */
export function runHTML(run: RunCheck | null | undefined): string {
  if (!run) return '';
  const fix = '<button type="button" class="b-fix" data-a="pc">Corregir</button>';
  if (run.level === 'nopc') return `<div class="b-run gh"><i></i><span><b>¿Lo corre tu PC?</b> El navegador no nos dice qué PC tienes. <button type="button" class="b-fix" data-a="pc">Dínoslo en Ajustes</button></span></div>`;
  if (!run.parts.length) return '';
  const below = run.parts.filter((p) => p.level === 'below');
  const atMin = run.parts.filter((p) => p.level === 'min');
  const unknown = run.parts.filter((p) => p.level === 'unknown');
  let head: string;
  if (run.level === 'yes') head = '<b>Tu PC lo corre bien</b> · llega a lo recomendado';
  else if (run.level === 'tight') head = `<b>Tu PC lo corre justo</b> · ${partsText(atMin)} ${atMin.length > 1 ? 'pasan' : 'pasa'} el mínimo, no lo recomendado`;
  else if (run.level === 'no') head = `<b>Tu PC no llega al mínimo</b> · ${partsText(below)} no ${below.length > 1 ? 'llegan' : 'llega'}`;
  else if (unknown.some((p) => p.why?.startsWith('No entendemos')) && unknown.length === run.parts.length) return '';
  else head = `<b>¿Lo corre tu PC?</b> ${esc(unknown.find((p) => p.part === 'gpu')?.why ?? unknown[0]?.why ?? 'No pudimos compararlo')}. ${fix}`;
  const cls = run.level === 'yes' ? 'ok' : run.level === 'tight' ? 'warn' : run.level === 'no' ? 'no' : 'gh';
  return `<div class="b-run ${cls}" tabindex="0"><i></i><span>${head}</span>${run.level !== 'unknown' ? '<button type="button" class="b-fix" data-a="pc">Tu PC</button>' : ''}<span class="b-tip" role="tooltip">${runRowsHTML(run)}</span></div>`;
}

/** 1.7: el chip de «¿Lo corre tu PC?». Vacío si no hay nada que decir. */
export function runChip(run: RunCheck | null | undefined): { cls: string; text: string } | null {
  if (!run) return null;
  if (run.level === 'nopc') return { cls: 'gh', text: '¿Lo corre tu PC?' };
  if (!run.parts.length) return null;
  const unknown = run.parts.filter((p) => p.level === 'unknown');
  if (run.level === 'yes') return { cls: 'ok', text: 'Tu PC lo corre' };
  if (run.level === 'tight') return { cls: 'warn', text: 'Tu PC lo corre justo' };
  if (run.level === 'no') return { cls: 'no', text: 'Tu PC no llega' };
  if (unknown.some((p) => p.why?.startsWith('No entendemos')) && unknown.length === run.parts.length) return null;
  return { cls: 'gh', text: '¿Lo corre tu PC?' };
}

/** 1.7: lo que se abre al pulsar el chip: la frase, cada componente y el botón para corregirlo. */
export function runPaneHTML(run: RunCheck | null | undefined): string {
  if (!run) return '';
  if (run.level === 'nopc') return `<div class="x-run"><p>El navegador no nos dice qué PC tienes.</p><button type="button" class="x-btn" data-a="pc">Dínoslo en Ajustes</button></div>`;
  const m = runHTML(run).match(/^<div class="b-run [a-z]+" tabindex="0"><i><\/i><span>([\s\S]*?)<\/span>(?:<button[^>]*>Tu PC<\/button>)?<span class="b-tip"/);
  const head = (m?.[1] ?? '').replace(/<button[^>]*>Corregir<\/button>/, '');
  return `<div class="x-run">${head ? `<p>${head}</p>` : ''}<div class="x-rq">${runRowsHTML(run)}</div><button type="button" class="x-btn" data-a="pc">Corregir mi PC en Ajustes</button></div>`;
}

function runRowsHTML(run: RunCheck): string {
  const rows = run.parts.map((p) => {
    const [c, t] = LVL[p.level];
    const lines = [`<i>Tienes</i>${p.mine ? esc(cut(p.mine, 48)) : 'sin leer'}`];
    if (p.min) lines.push(`<i>Mínimo</i>${esc(cut(p.min, 90))}`);
    if (p.rec) lines.push(`<i>Recomendado</i>${esc(cut(p.rec, 90))}`);
    return `<div><span>${partLabel(p.part)}</span><span class="${c}">${p.level === 'unknown' ? esc(p.why ?? '¿?') : t}</span></div><small class="rq">${lines.join('<br>')}</small>`;
  }).join('');
  const integ = run.integrated ? '<small class="n">El navegador ve una gráfica integrada. Si tu portátil tiene otra, ponla en Ajustes.</small>' : '';
  return `${rows}${integ}<small class="n">Aproximado: comparamos con una tabla de rendimiento propia, no con pruebas reales.</small>`;
}

/* ---------- 9: DLC y edición completa ---------- */

export interface DlcRow { appid: number; name: string; steamUSD: number | null; soon: boolean; owned: boolean }
export interface DlcPrice { steamUSD: number | null; best: { store: StoreId; totalUSD: number; url: string } | null }
export interface DlcView { open: boolean; items: DlcRow[]; total: number; ownedKnown: boolean; prices: Record<number, DlcPrice | 'loading' | 'error'> }

/** Como mucho se buscan en las tiendas 10 DLC: cada uno son cuatro búsquedas. */
export const DLC_MAX = 10;
/** Bandas sonoras, libros de arte, fondos: no se buscan fuera de Steam ni cuentan en la suma. */
export const dlcExtra = (name: string) => /soundtrack|\bost\b|art ?book|wallpaper|digital book|making of/i.test(name);
/** Packs y pases que traen otros DLC: se buscan, pero no se suman (contarían dos veces lo mismo). */
export const dlcBundle = (name: string) => /\bbundle\b|\bcollection\b|season pass|expansion pass|\bpass\b|complete pack/i.test(name);
/** Los que se buscan fuera de Steam: los que te faltan, ya a la venta, los más caros primero. */
export const dlcToPrice = (v: DlcView) => v.items.filter((d) => !d.owned && !d.soon && d.steamUSD != null && d.steamUSD > 0 && !dlcExtra(d.name)).slice(0, DLC_MAX);
/** Cómo se nombra una edición en una frase: «Shadow of the Erdtree Edition», o el nombre entero si la etiqueta no se sostiene sola. */
const edName = (e: Edition) => `«${/^[\p{L}\d]/u.test(e.label) ? e.label : e.name}»`;

/** «ELDEN RING Shadow of the Erdtree» → «Shadow of the Erdtree». */
export function dlcShort(name: string, game: string): string {
  const g = game.trim();
  if (g && name.toLowerCase().startsWith(g.toLowerCase())) {
    const rest = name.slice(g.length).replace(/^[\s:–—-]+/, '').trim();
    if (rest) return rest;
  }
  return name;
}

/** Lo más barato de un DLC: la mejor clave si gana a Steam; si no, Steam. null si aún no se sabe. */
export function dlcCheapest(d: DlcRow, p: DlcPrice | 'loading' | 'error' | undefined): number | null {
  if (p === 'loading' || p === undefined) return null;
  const steam = (p === 'error' ? d.steamUSD : p.steamUSD ?? d.steamUSD) ?? Infinity;
  const best = p !== 'error' && p.best ? p.best.totalUSD : Infinity;
  const m = Math.min(steam, best);
  return Number.isFinite(m) ? m : null;
}

export function dlcHTML(v: DlcView | null, c: Compare | null, s: Settings, st: BlockState, bodyOnly = false): string {
  if (!v || !v.total || !c) return '';
  const missing = v.items.filter((d) => !d.owned && !d.soon);
  const ownedN = v.items.filter((d) => d.owned).length;
  const summable = missing.filter((d) => !dlcExtra(d.name) && !dlcBundle(d.name));
  const steamSum = summable.reduce((a, d) => a + (d.steamUSD ?? 0), 0);
  const bits = [`<b>${v.total} DLC</b>`];
  if (v.ownedKnown && ownedN) bits.push(missing.length ? `tienes ${ownedN}, te ${missing.length === 1 ? 'falta 1' : `faltan ${missing.length}`}` : 'los tienes todos');
  if (steamSum > 0) bits.push(`${money(steamSum, c, s)} en Steam${v.ownedKnown && ownedN ? ' lo que falta' : ''}`);
  const head = `<button type="button" class="b-dlch" data-a="dlc" aria-expanded="${v.open}"><span>${bits.join(' · ')}</span><span class="chev">${v.open ? 'Ocultar ▴' : 'Ver precios ▸'}</span></button>`;
  if (!v.open) return bodyOnly ? '' : head;

  const toPrice = dlcToPrice(v);
  const searched = new Set(toPrice.map((d) => d.appid));
  const rest = v.items.filter((d) => !searched.has(d.appid));
  const shown = [...v.items.filter((d) => searched.has(d.appid)), ...rest.filter((d) => !dlcExtra(d.name)), ...rest.filter((d) => dlcExtra(d.name))].slice(0, 14);
  const rows = shown.map((d) => {
    const nm = esc(dlcShort(d.name, c.game.name));
    const steam = d.soon ? 'Aún no sale' : d.steamUSD == null ? 'No se vende suelto' : d.steamUSD === 0 ? 'Gratis' : money(d.steamUSD, c, s);
    if (d.owned) return `<div class="d-row own"><span class="nm" title="${esc(d.name)}">${nm}</span><span class="st">Lo tienes</span><span class="bt"></span></div>`;
    const p = v.prices[d.appid];
    let bt = '';
    if (searched.has(d.appid)) {
      if (p === 'loading' || p === undefined) bt = '<span class="mute">Buscando…</span>';
      else if (p === 'error' || !p.best) bt = '<span class="mute">Solo en Steam</span>';
      else if (p.best.totalUSD < (p.steamUSD ?? d.steamUSD ?? Infinity)) {
        const ref = p.steamUSD ?? d.steamUSD;
        const pct = ref ? Math.round((1 - p.best.totalUSD / ref) * 100) : 0;
        bt = `<a href="${esc(p.best.url)}" target="_blank" rel="noopener noreferrer" title="Abrir en ${STORES[p.best.store].name}">${logo(p.best.store, STORES[p.best.store].name)}<b>${money(p.best.totalUSD, c, s)}</b>${pct > 0 ? `<span class="pct">−${pct}%</span>` : ''}</a>`;
      } else bt = '<span class="mute">Steam es lo más barato</span>';
    }
    return `<div class="d-row${d.soon ? ' soon' : ''}"><span class="nm" title="${esc(d.name)}">${nm}</span><span class="st">${steam}</span><span class="bt">${bt}</span></div>`;
  }).join('');

  const foot: string[] = [];
  const allIn = missing.filter((d) => d.steamUSD != null && d.steamUSD > 0 && !dlcExtra(d.name)).length <= DLC_MAX;
  const sumList = toPrice.filter((d) => !dlcBundle(d.name));
  const cheap = sumList.map((d) => dlcCheapest(d, v.prices[d.appid]));
  const ready = sumList.length > 0 && cheap.every((x) => x != null);
  const left = missing.length > sumList.length ? ' (sin contar packs ni bandas sonoras)' : '';
  const dlcSum = ready ? cheap.reduce<number>((a, x) => a + (x ?? 0), 0) : null;
  const top = c.offers.find((o) => o.fit === 'ok');
  const base = c.owned ? 0 : Math.min(top?.totalUSD ?? Infinity, c.game.steamUSD ?? Infinity);
  const others = st.edition ? [] : st.editions.slice(1).filter((e) => e.steamUSD != null);
  const edBtn = (label: string) => `<button type="button" class="b-fix" data-ed="${esc(label)}">Comparar esa edición</button>`;
  if (!st.edition && dlcSum != null && allIn) {
    if (c.owned || !Number.isFinite(base)) {
      const what = sumList.length === 1 ? 'El DLC que te falta' : `Los ${sumList.length} DLC que te faltan`;
      foot.push(`${what}${left}, lo más barato de cada uno: <b>${money(dlcSum, c, s)}</b>${steamSum > dlcSum + 0.01 ? `; en Steam, ${money(steamSum, c, s)}` : ''}.`);
    } else {
      const total = base + dlcSum;
      foot.push(`Juego + ${sumList.length === 1 ? 'su DLC' : `los ${sumList.length} DLC`}${left}, lo más barato de cada uno: <b>${money(total, c, s)}</b>.`);
      for (const e of others.slice(0, 2)) {
        const line = e.steamUSD! < total - 0.01
          ? `<b class="ok">Sale más barato ${esc(edName(e))}</b>: ${money(e.steamUSD!, c, s)} en Steam, si trae lo que quieres.`
          : `Por separado sale más barato que ${esc(edName(e))}, que cuesta ${money(e.steamUSD!, c, s)} en Steam.`;
        foot.push(`${line} ${edBtn(e.label)}`);
      }
    }
  } else if (!st.edition && others.length && !c.owned) {
    for (const e of others.slice(0, 2)) foot.push(`${esc(edName(e))} cuesta ${money(e.steamUSD!, c, s)} en Steam, con el juego. ${edBtn(e.label)}`);
  }
  if (!allIn) foot.push(`Buscamos fuera de Steam los ${DLC_MAX} más caros que te faltan.`);
  if (!v.ownedKnown) foot.push('No sabemos cuáles tienes: inicia sesión en Steam para verlo.');
  if (v.total > shown.length) foot.push(`<a href="https://store.steampowered.com/dlc/${c.game.appid}/" target="_blank" rel="noopener noreferrer">Ver los ${v.total} en Steam</a>`);
  return `${bodyOnly ? '' : head}<div class="d-list">${rows}</div>${foot.length ? `<div class="d-foot">${foot.map((f) => `<p>${f}</p>`).join('')}</div>` : ''}`;
}

/* ---------- 10: nota del vendedor (Kinguin) ---------- */

/** Menos de esto, y el vendedor se marca: tiendas de claves con poca historia o con quejas. */
export const SELLER_MIN_ORDERS = 500, SELLER_MIN_RATING = 0.97;
const compact = (n: number) => new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 0 }).format(n);
const pct1 = (r: number) => `${String(Math.floor(r * 1000) / 10).replace('.', ',')} %`;

/** Quién vende, con su valoración y sus ventas; marcado si tiene pocas ventas o baja valoración. */
export function sellerHTML(n: SellerNote | null | undefined): string {
  if (!n) return '';
  const why = n.orders < SELLER_MIN_ORDERS ? `pocas ventas (${n.orders})` : n.rating < SELLER_MIN_RATING ? `valoración ${pct1(n.rating)}` : '';
  const tip = `${n.name}: ${pct1(n.rating)} de valoraciones buenas en ${n.orders.toLocaleString('es-DO')} pedidos completados en Kinguin.`;
  if (why) return `<span class="chip warn" data-tip="${esc(`${tip} Con pocas ventas o una valoración baja hay más riesgo de que la clave no funcione o la revoquen.`)}" tabindex="0">${esc(n.name)} · ${esc(why)}</span>`;
  return `<span class="sel" title="${esc(tip)}">${esc(n.name)} · ${pct1(n.rating)} · ${compact(n.orders)} pedidos</span>`;
}

/** Las ofertas de Kinguin a la vista (la mejor de cada fila) cuyo vendedor aún no se ha pedido. */
export function sellersToAsk(c: Compare, st: BlockState): { url: string; cents: number }[] {
  const { groups } = groupStores(c.offers);
  return groups.filter((g) => g.store === 'kinguin' && g.top.fit !== 'warn' && !(st.sellers && g.top.url in st.sellers))
    .map((g) => ({ url: g.top.url, cents: Math.round(g.top.price * 100) }));
}
