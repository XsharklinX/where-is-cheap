import { savings } from './compare';
import { payFor, payMixed } from './fees';
import { kindLabel, prettyRegion } from './region';
import type { Compare, Edition, HistoryPoint, Offer, Settings, StoreId } from './types';
import { CURRENCIES, STORES } from './types';

export const TAG_SVG = (hole = '#1c1720', size = 22) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 34 34" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11.4a2.5 2.5 0 0 1 1.77.73l9.6 9.6a2.5 2.5 0 0 1 0 3.54l-11.4 11.4a2.5 2.5 0 0 1-3.54 0l-9.6-9.6A2.5 2.5 0 0 1 4 17.9Z" fill="#ffb547"/><circle cx="11" cy="11" r="2.6" fill="${hole}"/></svg>`;

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const usd = (n: number) => `$${n.toFixed(2)}`;
export const dop = (n: number, rate: number) => `RD$ ${Math.round(n * rate).toLocaleString('es-DO')}`;
// 1.4: la moneda local elegida en Ajustes (por defecto RD$).
export const localRate = (c: Pick<Compare, 'rates'>, s: Settings) => c.rates.fx?.[s.localCurrency] ?? c.rates.DOP;
export const localNum = (n: number, c: Pick<Compare, 'rates'>, s: Settings) => Math.round(n * localRate(c, s)).toLocaleString('es-DO');
export const local = (n: number, c: Pick<Compare, 'rates'>, s: Settings) => `${CURRENCIES[s.localCurrency]?.symbol ?? s.localCurrency} ${localNum(n, c, s)}`;
export const shortDate = (t: number) => new Date(t).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });

/** Logo oficial de cada tienda, empaquetado en la extensión (las páginas no dejan cargar imágenes de fuera). */
export const logo = (id: StoreId | 'steam', name: string) =>
  `<img class="sb" src="${browser.runtime.getURL(`/stores/${id}.png` as any)}" alt="" width="28" height="28" title="${esc(name)}">`;

export function money(n: number, c: Pick<Compare, 'rates'>, s: Settings): string {
  return s.currency === 'dop' ? local(n, c, s) : usd(n);
}

/** «Eneba, Driffle y Kinguin». */
export function andList(list: string[]): string {
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}` : list[0] ?? '';
}

function priceSub(o: Offer, c: Compare, s: Settings, compact: boolean): string {
  if (o.fit === 'no') return compact ? 'no sirve' : 'no sirve en tu cuenta';
  // 3: «est.» solo mientras la comisión de esa tienda no se haya comprobado con una compra.
  const est = c.feesChecked?.[o.store] ? '' : ' est.';
  const parts: string[] = [];
  if (o.couponUSD > 0) parts.push(`cupón ${o.coupon} −${o.couponUSD.toFixed(2)}`);
  if (o.feeUSD > 0) parts.push(compact ? `+${o.feeUSD.toFixed(2)} comisión${est}` : `${(o.priceUSD - o.couponUSD).toFixed(2)} + ${o.feeUSD.toFixed(2)} comisión${est}`);
  else parts.push('sin comisión');
  if (s.currency === 'both') parts.push(local(o.totalUSD, c, s));
  return parts.map(esc).join(compact ? '<br>' : ' · ');
}

export function rowHTML(o: Offer, c: Compare, s: Settings, isBest: boolean, compact = false, i = 0): string {
  const st = STORES[o.store];
  const region = o.regionCheckedByStore ? (o.regions.some((r) => /global|worldwide|ww/i.test(r)) ? 'Global' : 'Tu país') : o.regions.map(prettyRegion).join(', ') || 'sin región';
  const seller = st.marketplace ? ' · vende un tercero' : '';
  // 13: el porqué de la etiqueta, en un globo al pasar el ratón o al enfocarla con el teclado.
  const chip = `<span class="chip ${o.fit}" data-tip="${esc(o.fitWhy)}" tabindex="0">${esc(o.fitText)}</span>`;
  const inner = `${logo(o.store, st.name)}
    <span class="rn"><b>${st.name}</b><span>${kindLabel(o.kind)} · ${esc(region)}${compact ? '' : seller}</span>${compact ? chip : ''}</span>
    ${compact ? '' : chip}
    <span class="pr"><span class="pn">${money(o.totalUSD, c, s)}</span><span class="pf">${priceSub(o, c, s, compact)}</span></span>`;
  const cls = `row ${o.fit}${isBest ? ' best' : ''}`;
  const key = `${o.store}|${o.url}`;
  if (o.fit === 'no') return `<div class="${cls}" data-k="${esc(key)}">${inner}<span class="ir ghost"></span></div>`;
  const tip = o.coupon ? `Abrir en ${st.name} y copiar el cupón ${o.coupon}` : `Abrir en ${st.name}`;
  return `<a class="${cls}" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer" title="${esc(tip)}" data-store="${o.store}" data-i="${i}" data-k="${esc(key)}">${inner}<span class="ir">Ir</span></a>`;
}

/** 1: fila gris de una tienda que aún no ha respondido. */
const waitRow = (id: StoreId) =>
  `<div class="row wait" data-k="wait|${id}" aria-hidden="true">${logo(id, STORES[id].name)}<span class="rn"><b>${STORES[id].name}</b><span>Buscando…</span></span><span class="pr"><span class="bar"></span></span><span class="ir ghost"></span></div>`;

export function rowsHTML(c: Compare, s: Settings, compact = false): string {
  const bestIdx = c.offers.findIndex((o) => o.fit === 'ok');
  const rows = c.offers.map((o, i) => rowHTML(o, c, s, i === bestIdx, compact, i));
  // Las tiendas que faltan van debajo de lo que ya llegó y encima de Steam.
  const pending = (c.pending ?? []).filter((id) => (s.marketplaces || !STORES[id].marketplace) && !s.hiddenStores?.includes(id));
  rows.push(...pending.map(waitRow));
  if (c.game.steamUSD != null) {
    const sub = c.game.steamDiscount ? `−${c.game.steamDiscount}% hoy` : s.currency === 'both' ? local(c.game.steamUSD, c, s) : 'precio de hoy';
    rows.push(`<a class="row steam" data-k="steam" href="https://store.steampowered.com/app/${c.game.appid}/" target="_blank" rel="noopener noreferrer">
      ${logo('steam', 'Steam')}
      <span class="rn"><b>Steam</b><span>Tienda oficial</span></span>${compact ? '' : '<span class="chip gh">Oficial</span>'}
      <span class="pr"><span class="pn">${money(c.game.steamUSD, c, s)}</span><span class="pf">${sub}</span></span>
      <span class="ir ghost"></span></a>`);
  }
  return rows.join('');
}

/**
 * 1: pinta las filas nuevas sin rehacer la caja. Las que ya estaban se quedan quietas; las nuevas entran con
 * una animación corta (sin animación si el sistema pide menos movimiento).
 */
export function swapRows(box: HTMLElement, html: string): void {
  const before = new Set([...box.children].map((e) => (e as HTMLElement).dataset.k));
  box.innerHTML = html;
  if (!before.size) return;
  for (const el of box.children as HTMLCollectionOf<HTMLElement>) {
    if (!before.has(el.dataset.k) && !el.classList.contains('wait')) el.classList.add('new');
  }
}

export function failedNote(c: Pick<Compare, 'failed'>): string {
  if (!c.failed.length) return '';
  const names = andList(c.failed.map((id) => STORES[id].name));
  return `${names} no ${c.failed.length > 1 ? 'respondieron' : 'respondió'}.`;
}

const STORE_LIST = 'Instant Gaming, Eneba, Driffle ni Kinguin';

/** Tiendas que aún faltan, teniendo en cuenta si se muestran los marketplaces. */
const pendingNames = (c: Compare, s: Settings) => (c.pending ?? []).filter((id) => (s.marketplaces || !STORES[id].marketplace) && !s.hiddenStores?.includes(id)).map((id) => STORES[id].name);

/** Línea principal y secundaria de la franja. */
export function headline(c: Compare, s: Settings): { t1: string; t2: string } {
  const top = c.offers.find((o) => o.fit === 'ok');
  const save = savings(c);
  const waiting = pendingNames(c, s);
  const tail = waiting.length ? ` · falta ${andList(waiting)}` : '';
  if (c.owned) {
    return { t1: 'Ya lo tienes en tu biblioteca', t2: top ? `Para regalar: desde ${money(top.totalUSD, c, s)} en ${STORES[top.store].name}${tail}` : waiting.length ? `Buscando en ${andList(waiting)}…` : 'No hace falta comprarlo otra vez.' };
  }
  if (top && save) {
    const t2 = [`−${save.pct}% frente a Steam`, '<span class="ok">activa en RD</span>'];
    if (s.currency === 'both') t2.push(`≈ ${local(top.totalUSD, c, s)}`);
    return { t1: `Desde <span class="num">${money(top.totalUSD, c, s)}</span> en ${STORES[top.store].name}`, t2: t2.join(' · ') + tail };
  }
  if (top && c.game.steamUSD == null) return { t1: `Desde <span class="num">${money(top.totalUSD, c, s)}</span> en ${STORES[top.store].name}`, t2: 'Steam no lo vende ahora en tu región · <span class="ok">activa en RD</span>' + tail };
  if (waiting.length) {
    const steam = c.game.steamUSD != null ? `Steam: ${money(c.game.steamUSD, c, s)} · ` : '';
    return { t1: top ? 'Steam va ganando' : 'Buscando el mejor precio…', t2: `${steam}esperando a ${andList(waiting)}` };
  }
  if (top) return { t1: 'Steam tiene el mejor precio ahora', t2: `Lo más barato fuera: ${money(top.totalUSD, c, s)} en ${STORES[top.store].name}` };
  if (c.offers.length) return { t1: 'Ninguna oferta segura que active en RD', t2: `Hay ${c.offers.length} de otras regiones, cuentas o precios sospechosos. Míralas antes de comprar.` };
  if (c.failed.length) return { t1: 'No encontramos ofertas', t2: failedNote(c) };
  return { t1: s.marketplaces ? `No está en ${STORE_LIST}` : 'No está en Instant Gaming', t2: 'Buscamos el mismo juego y la misma edición.' };
}

/** Avisos extra: DLC sin juego base (Q). */
export function notesHTML(c: Compare): string {
  if (c.game.isDlc && c.ownsBase === true) return '<div class="note ok">Es un DLC de un juego que ya tienes.</div>';
  if (c.game.isDlc && c.ownsBase === false) return '<div class="note warn">Es un DLC: necesitas el juego base, que no está en tu biblioteca.</div>';
  return '';
}

/** D: veredicto y gráfica del historial. Mientras faltan tiendas, el veredicto espera. */
export function verdictHTML(c: Compare): string {
  if (c.pending?.length) return `<div class="verdict"><span class="chip gh skel">Calculando…</span><span class="mute">El veredicto sale cuando respondan todas las tiendas.</span></div>${sparkHTML(c.history)}`;
  const v = c.verdict;
  const cls = v.kind === 'buy' ? 'ok' : v.kind === 'wait' ? 'tag' : 'gh';
  return `<div class="verdict"><span class="chip ${cls}">${esc(v.title)}</span><span>${esc(v.detail)}</span></div>${c.edition ? '' : sparkHTML(c.history, c.low?.usd ?? null)}`;
}

/** 10: botones de edición (Estándar · Deluxe · …) cuando la ficha vende más de una. */
export function editionsHTML(eds: Edition[], current: string | undefined): string {
  if (eds.length < 2) return '';
  const b = (label: string, v: string) => `<button type="button" role="radio" aria-checked="${(current ?? '') === v}" data-ed="${esc(v)}">${esc(label)}</button>`;
  return `<div class="eds" role="radiogroup" aria-label="Edición"><span class="mute">Edición</span>${eds.map((e, i) => b(e.label, i === 0 ? '' : e.label)).join('')}</div>`;
}

export function sparkHTML(h: HistoryPoint[], lowUSD: number | null = null, w = 300, ht = 44): string {
  const pts = h.filter((p) => p.best != null || p.steam != null);
  if (pts.length < 2) return '';
  const vals = pts.flatMap((p) => [p.best, p.steam]).filter((v): v is number => v != null);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
  const x = (t: number) => 4 + ((t - t0) / Math.max(1, t1 - t0)) * (w - 8);
  const y = (v: number) => ht - 6 - ((v - lo) / Math.max(0.01, hi - lo)) * (ht - 14);
  const line = (k: 'best' | 'steam') => pts.filter((p) => p[k] != null).map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p[k]!).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const days = Math.max(1, Math.round((t1 - t0) / 86_400_000));
  // 2: el mínimo histórico, como línea discontinua si cae dentro de la gráfica.
  const lowLine = lowUSD != null && lowUSD >= lo && lowUSD <= hi ? `<path d="M4 ${y(lowUSD).toFixed(1)} H${w - 4}" stroke="#45d69b" stroke-width="1" stroke-dasharray="3 3" opacity=".7"/>` : '';
  return `<figure class="spark"><svg viewBox="0 0 ${w} ${ht}" width="100%" height="${ht}" role="img" aria-label="Historial de precio de ${days} días">
    ${lowLine}
    <path d="${line('steam')}" fill="none" stroke="#6c7f96" stroke-width="1.5"/>
    <path d="${line('best')}" fill="none" stroke="#ffb547" stroke-width="2"/>
    ${last.best != null ? `<circle cx="${x(last.t)}" cy="${y(last.best)}" r="3" fill="#ffb547"/>` : ''}
  </svg><figcaption><span class="k steam"></span>Steam <span class="k best"></span>mejor precio en RD · ${days} ${days === 1 ? 'día' : 'días'} · mín. ${usd(lo)}${lowLine ? ' <span class="k low"></span>mín. histórico' : ''}</figcaption></figure>`;
}

export function footHTML(c: Compare, s: Settings): string {
  // 1.8 (6): si pagas distinto según la tienda, se dice dónde va lo que no es lo general.
  const name = (p: string) => (p === 'card' ? 'tarjeta' : 'PayPal');
  const odd = (Object.keys(STORES) as StoreId[]).filter((id) => payFor(s, id) !== s.pay);
  const pay = payMixed(s) ? `${name(s.pay)} (${name(s.pay === 'card' ? 'paypal' : 'card')} en ${andList(odd.map((id) => STORES[id].name))})` : name(s.pay);
  const fails = failedNote(c);
  const rate = c.rates.fallback ? ' · tasa sin actualizar' : '';
  // 3: qué comisiones siguen estimadas, solo de las tiendas que salen en la lista.
  const shown = [...new Set(c.offers.filter((o) => o.fit !== 'no' && o.feeUSD > 0).map((o) => o.store))];
  const est = shown.filter((id) => !c.feesChecked?.[id]);
  const fees = !est.length ? '' : est.length === shown.length ? ' · comisiones estimadas (se comprueban al confirmar una compra)' : ` · comisión estimada en ${andList(est.map((id) => STORES[id].name))} (se comprueba al confirmar una compra allí)`;
  // 5: RD$ con el recargo de tu banco.
  const fx = c.rates.fxPct && s.currency !== 'usd' && s.localCurrency === 'DOP' ? ` · RD$ con +${c.rates.fxPct}% de tu banco` : '';
  return `<span>Pago con ${pay}${fees}${fx}${rate}${fails ? ' · ' + esc(fails) : ''}</span>`;
}

/** 4: aviso flotante corto («Cupón copiado»). */
export function toast(root: HTMLElement | ShadowRoot, msg: string): void {
  root.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'wic toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  root.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

