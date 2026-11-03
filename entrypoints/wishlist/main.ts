// 6: la lista de deseos entera, ordenada por lo que ahorras hoy, con filtros y el aviso de las próximas rebajas.
import '@/lib/ui.css';
import './wishlist.css';
import { call } from '@/lib/api';
import type { SteamStatus, SteamUser, WishItem } from '@/lib/data';
import { monthYear, saleText, type SaleInfo } from '@/lib/history';
import { getSettings } from '@/lib/settings';
import type { HistLow, Rates, Settings } from '@/lib/types';
import { STORES } from '@/lib/types';
import { esc, local, logo, TAG_SVG, toast, usd } from '@/lib/ui';

type Item = WishItem & { before: number | null; low: HistLow | null; wait: boolean };
type Data = { items: Item[]; user: SteamUser; rates: Rates; sale: SaleInfo; run: { done: number; total: number } | null; status?: SteamStatus | null };
type Filter = 'all' | 'drop' | 'target' | 'wait' | 'new';

const $ = (id: string) => document.getElementById(id)!;
$('brand').innerHTML = TAG_SVG('#121014', 34);

const params = new URLSearchParams(location.search);
let filter: Filter = (['drop', 'target', 'wait', 'new'] as const).find((f) => f === params.get('f')) ?? 'all';
let sort = localStorage.getItem('wic-sort') ?? 'moment';
// 11: tabla por defecto; la vista de tarjetas se queda como opción y se recuerda.
let view: 'table' | 'cards' = localStorage.getItem('wic-view') === 'cards' ? 'cards' : 'table';
let data: Data | null = null;
let s: Settings;

/** Lo más barato que hay hoy (oferta que activa en RD o Steam) y cuánto ahorras frente a Steam. */
function today(w: Item) {
  const best = w.lastBest != null && (w.steamUSD == null || w.lastBest < w.steamUSD) ? w.lastBest : null;
  const price = best ?? w.steamUSD ?? null;
  const save = best != null && w.steamUSD ? w.steamUSD - best : 0;
  const pct = save && w.steamUSD ? Math.round((save / w.steamUSD) * 100) : 0;
  return { best, price, save, pct };
}

const is = {
  drop: (w: Item) => w.before != null && w.lastBest != null && w.lastBest < w.before - 0.01,
  target: (w: Item) => { const p = today(w).price; return w.target != null && !!w.checkedAt && p != null && p <= w.target; },
  wait: (w: Item) => w.wait,
  new: (w: Item) => !w.checkedAt,
  /** 16: comprar ya: en tu límite, o igual o por debajo del mínimo histórico (con un 5 % de margen). */
  buy: (w: Item) => { const p = today(w).price; return !!w.checkedAt && p != null && (is.target(w) || (w.low?.usd != null && p <= w.low.usd * 1.05)); },
};

/** 16: el mejor momento: 0 comprar ya, 1 precio normal, 2 mejor esperar, 3 sin revisar o sin precio. */
const moment = (w: Item) => (!w.checkedAt || today(w).price == null ? 3 : is.buy(w) ? 0 : w.wait ? 2 : 1);

function card(w: Item): string {
  const t = today(w);
  const name = w.name ?? `App ${w.appid}`;
  const img = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${w.appid}/header.jpg`;
  const tags = [
    t.pct > 0 ? `<span class="b save">−${t.pct}%</span>` : '',
    is.target(w) ? '<span class="b hit">En tu límite</span>' : '',
    w.wait ? '<span class="b wait">Espera</span>' : '',
  ].join('');
  let price: string;
  if (!w.checkedAt) price = '<div class="pl mute">Aún sin revisar</div>';
  else if (t.price == null) price = '<div class="pl mute">Sin oferta que active en RD</div>';
  else {
    const where = t.best != null && w.lastStore ? `${logo(w.lastStore, STORES[w.lastStore].name)}<span>en ${STORES[w.lastStore].name}</span>` : `${logo('steam', 'Steam')}<span>en Steam</span>`;
    price = `<div class="pl"><b class="num">${usd(t.price)}</b>${where}</div>
      <div class="sub">${t.best != null && w.steamUSD != null ? `<s>Steam ${usd(w.steamUSD)}</s> · ` : ''}${s.currency !== 'usd' && data ? local(t.price, data, s) : ''}${is.drop(w) ? ` · <span class="okc">bajó de ${usd(w.before!)}</span>` : ''}</div>`;
  }
  const low = w.low?.usd != null ? `<div class="low${w.wait ? ' wait' : ''}">Mínimo histórico: −${w.low.pct}% en ${monthYear(w.low.date)}, unos ${usd(w.low.usd)} aquí</div>` : '';
  const go = w.lastUrl && t.best != null ? w.lastUrl : `https://store.steampowered.com/app/${w.appid}/`;
  return `<article class="card${is.target(w) ? ' hit' : ''}">
    <a class="cap" href="https://store.steampowered.com/app/${w.appid}/" target="_blank" rel="noopener noreferrer" tabindex="-1"><img src="${img}" alt="" loading="lazy" width="460" height="215"><span class="tags">${tags}</span></a>
    <div class="cb">
      <h2 title="${esc(name)}">${esc(name)}</h2>
      ${price}
      ${low}
      <div class="cf">
        <label class="lim">Límite <span>$</span><input type="number" min="0" step="0.5" inputmode="decimal" value="${w.target ?? ''}" placeholder="—" data-appid="${w.appid}" aria-label="Precio límite para ${esc(name)}"></label>
        <a class="go${t.best != null ? '' : ' ghost'}" href="${esc(go)}" target="_blank" rel="noopener noreferrer">${t.best != null ? 'Ir a la oferta' : 'Ver en Steam'}</a>
      </div>
    </div>
  </article>`;
}

/** 11: una línea por juego, con todo lo que hace falta para decidir. */
function row(w: Item): string {
  const t = today(w);
  const name = w.name ?? `App ${w.appid}`;
  const img = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${w.appid}/header.jpg`;
  const tags = [is.target(w) ? '<span class="tg hit">En tu límite</span>' : is.buy(w) ? '<span class="tg hit">Comprar ya</span>' : '', w.wait ? '<span class="tg wait">Espera</span>' : '', is.drop(w) ? `<span class="tg drop">Bajó de ${usd(w.before!)}</span>` : ''].join('');
  const sub = !w.checkedAt ? 'Aún sin revisar'
    : w.low?.usd != null ? `Mínimo ${usd(w.low.usd)} · ${monthYear(w.low.date)}`
    : t.best == null && t.price != null ? 'Steam es lo más barato' : t.price == null ? 'Sin oferta que active en RD' : '';
  const bestCell = !w.checkedAt ? '<span class="mute">—</span>'
    : t.best != null && w.lastStore ? `<span class="bst">${logo(w.lastStore, STORES[w.lastStore].name)}<b class="num">${usd(t.best)}</b></span>`
    : t.price != null ? `<span class="bst">${logo('steam', 'Steam')}<b class="num">${usd(t.price)}</b></span>` : '<span class="mute">—</span>';
  const saveCell = t.pct > 0 ? `<span class="sv"><span class="bar"><i style="width:${Math.min(100, t.pct)}%"></i></span><span class="pc">−${t.pct}% · ${usd(t.save)}</span></span>` : '<span class="mute">—</span>';
  const go = w.lastUrl && t.best != null ? w.lastUrl : `https://store.steampowered.com/app/${w.appid}/`;
  return `<div class="tr${is.target(w) ? ' hit' : ''}" role="row">
    <a class="cv" href="https://store.steampowered.com/app/${w.appid}/" target="_blank" rel="noopener noreferrer" tabindex="-1"><img src="${img}" alt="" loading="lazy" width="92" height="43"></a>
    <span class="nm"><b title="${esc(name)}">${esc(name)}</b><span>${tags}${sub}</span></span>
    <span class="num st">${w.steamUSD != null ? usd(w.steamUSD) : '—'}</span>
    ${bestCell}
    ${saveCell}
    <label class="lim"><span>$</span><input type="number" min="0" step="0.5" inputmode="decimal" value="${w.target ?? ''}" placeholder="—" data-appid="${w.appid}" aria-label="Precio límite para ${esc(name)}"></label>
    <a class="go${t.best != null ? '' : ' ghost'}" href="${esc(go)}" target="_blank" rel="noopener noreferrer">${t.best != null ? 'Ir ↗' : 'Steam'}</a>
  </div>`;
}

function render() {
  if (!data) return;
  const items = data.items;
  if (!items.length) {
    const st = data.status;
    $('summary').textContent = !st ? 'Leyendo tu lista de deseos de Steam…'
      : st.status === 'logged-out' ? 'Steam dice que no has iniciado sesión en store.steampowered.com en este navegador. Inicia sesión allí y recarga esta página.'
      : st.status === 'error' ? `No pudimos leer tu cuenta de Steam: ${st.error ?? 'Steam no respondió'}.`
      : st.status === 'empty' ? 'Tu sesión está iniciada, pero Steam devolvió la lista vacía. Abre cualquier página de store.steampowered.com en otra pestaña y recarga esta.'
      : 'Tu lista de deseos de Steam está vacía.';
    $('grid').innerHTML = '';
    $('filters').innerHTML = '';
    $('tiles').hidden = true;
    return;
  }
  // Resumen arriba: cuántos están más baratos fuera de Steam y cuánto ahorrarías comprándolos todos hoy.
  const cheaper = items.filter((w) => today(w).save > 0);
  const total = cheaper.reduce((t, w) => t + today(w).save, 0);
  const hits = items.filter(is.target).length;
  $('summary').textContent = 'Ordenada por lo que ahorras hoy frente a Steam.';
  $('tiles').hidden = false;
  $('tiles').innerHTML = `<div><span>Juegos</span><b>${items.length}</b></div><div><span>Más baratos fuera de Steam</span><b>${cheaper.length}</b></div><div><span>Ahorras si los compras hoy</span><b class="g">${usd(total)}</b></div><div><span>En tu límite</span><b class="${hits ? 'a' : ''}">${hits}</b></div>`;

  const waits = items.filter(is.wait);
  // Rebajas: en marcha, o a 45 días o menos con juegos para esperar; las de otoño (Black Friday) a 30 días aunque no los haya.
  const sl = data.sale;
  const why = sl.live ? 'Steam y las tiendas de claves tienen precios bajos estos días: revisa tu lista antes de que terminen.'
    : waits.length ? `${waits.length === 1 ? 'Un juego de tu lista llegó a estar bastante más barato' : `${waits.length} juegos de tu lista llegaron a estar bastante más baratos`} que hoy: mejor espera para ${waits.length === 1 ? 'ese' : 'esos'}.`
    : 'Steam y las tiendas de claves bajan precios esa semana. Si no te corre prisa, espera para comprar.';
  const showSale = sl.live || (!sl.live && sl.days <= 45 && waits.length > 0) || (sl.bf && sl.days <= 30);
  $('sale').innerHTML = showSale
    ? `<div class="banner">${TAG_SVG('#ffb547', 20)}<span><b>${saleText(sl)}.</b> ${why}</span>${!sl.live && waits.length && filter !== 'wait' ? '<button class="lnk" data-f="wait">Ver cuáles</button>' : sl.live ? '<button class="lnk" id="saleCheck">Revisar todo ahora</button>' : ''}</div>`
    : '';

  const counts: Record<Filter, number> = { all: items.length, drop: items.filter(is.drop).length, target: items.filter(is.target).length, wait: waits.length, new: items.filter(is.new).length };
  const labels: Record<Filter, string> = { all: 'Todos', drop: 'Bajaron esta semana', target: 'En tu límite', wait: 'Mejor esperar', new: 'Sin revisar' };
  $('filters').innerHTML = (Object.keys(labels) as Filter[])
    .filter((f) => f === 'all' || f === filter || counts[f] > 0)
    .map((f) => `<button type="button" role="radio" aria-checked="${f === filter}" data-f="${f}">${labels[f]} <span>${counts[f]}</span></button>`).join('');

  const shown = items.filter((w) => filter === 'all' || is[filter](w));
  const by: Record<string, (a: Item, b: Item) => number> = {
    moment: (a, b) => moment(a) - moment(b) || today(b).pct - today(a).pct,
    pct: (a, b) => today(b).pct - today(a).pct,
    usd: (a, b) => today(b).save - today(a).save,
    price: (a, b) => (today(a).price ?? Infinity) - (today(b).price ?? Infinity),
    name: () => 0,
  };
  // Los que no se han revisado van al final en todos los órdenes; el nombre desempata.
  shown.sort((a, b) => (a.checkedAt ? 0 : 1) - (b.checkedAt ? 0 : 1) || by[sort](a, b) || (a.name ?? '').localeCompare(b.name ?? ''));
  document.querySelectorAll<HTMLElement>('#view [data-v]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === view)));
  $('grid').className = view === 'table' ? 'wl-table' : 'wl-grid';
  const head = '<div class="tr th" role="row"><span></span><span>Juego</span><span>Steam</span><span>Mejor hoy</span><span>Ahorro</span><span>Límite</span><span></span></div>';
  // 16: en «Mejor momento», la tabla va por grupos con su título.
  const GROUPS = ['Comprar ya', 'Precio normal', 'Mejor esperar a las rebajas', 'Sin revisar o sin precio'];
  const rows = sort === 'moment'
    ? shown.map((w, i) => (i === 0 || moment(shown[i - 1]) !== moment(w) ? `<div class="tr grp" role="row"><span>${GROUPS[moment(w)]} <i>${shown.filter((x) => moment(x) === moment(w)).length}</i></span></div>` : '') + row(w)).join('')
    : shown.map(row).join('');
  $('grid').innerHTML = !shown.length ? `<div class="empty"><b>Nada por aquí</b><p>Ningún juego de tu lista cumple este filtro ahora.</p></div>`
    : view === 'table' ? head + rows : shown.map(card).join('');
  lastShown = shown;
}

/* 13: límites en bloque, sobre los juegos que se ven con el filtro de ahora. Los que ya tienen límite no se tocan. */
let lastShown: Item[] = [];
$('bulk').addEventListener('change', async (e) => {
  const sel = e.target as HTMLSelectElement;
  const mode = sel.value;
  sel.value = '';
  if (!mode) return;
  const targets: Record<number, number | null> = {};
  let skipped = 0;
  if (mode === 'clear') {
    const withT = lastShown.filter((w) => w.target != null);
    if (!withT.length || !confirm(`¿Quitar el límite a ${withT.length} ${withT.length === 1 ? 'juego' : 'juegos'}?`)) return;
    for (const w of withT) targets[w.appid] = null;
  } else {
    for (const w of lastShown) {
      if (w.target != null) continue;
      const v = mode === 'low' ? w.low?.usd ?? null : w.steamUSD != null ? w.steamUSD * (1 - Number(mode) / 100) : null;
      if (v == null || v <= 0) { skipped++; continue; }
      targets[w.appid] = Math.round(v * 100) / 100;
    }
  }
  const n = Object.keys(targets).length;
  if (n) await call('setTargets', { targets });
  toast(document.body, mode === 'clear' ? `Quitado el límite a ${n}.`
    : `Límite puesto a ${n} ${n === 1 ? 'juego' : 'juegos'}.${skipped ? ` ${skipped} sin ${mode === 'low' ? 'mínimo histórico' : 'precio de Steam'} todavía: revísalos y vuelve a probar.` : ''}`);
});

document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('#saleCheck')) { $('checkAll').click(); return; }
  const v = (e.target as HTMLElement).closest<HTMLElement>('#view [data-v]')?.dataset.v;
  if (v === 'table' || v === 'cards') { view = v; localStorage.setItem('wic-view', v); render(); return; }
  const f = (e.target as HTMLElement).closest<HTMLElement>('[data-f]')?.dataset.f as Filter | undefined;
  if (!f) return;
  filter = f;
  history.replaceState(null, '', f === 'all' ? location.pathname : `?f=${f}`);
  render();
});
$('sort').addEventListener('change', (e) => { sort = (e.target as HTMLSelectElement).value; localStorage.setItem('wic-sort', sort); render(); });
($('sort') as HTMLSelectElement).value = sort;

// Límite por juego: se guarda al salir del campo, igual que en la ventana.
$('grid').addEventListener('change', (e) => {
  const inp = e.target as HTMLInputElement;
  if (!inp.dataset.appid) return;
  const v = inp.value.trim();
  const n = Number(v);
  if (v !== '' && !(n > 0)) { inp.value = ''; inp.setCustomValidity('Pon un precio mayor que 0'); inp.reportValidity(); return; }
  inp.setCustomValidity('');
  void call('setTarget', { appid: Number(inp.dataset.appid), target: v === '' ? null : n });
});

function progress(run: Data['run']) {
  const b = $('checkAll') as HTMLButtonElement;
  b.disabled = !!run;
  b.textContent = run ? 'Revisando…' : 'Revisar todo';
  $('progress').textContent = run ? `${run.done} de ${run.total}` : '';
}

$('checkAll').addEventListener('click', () => {
  progress({ done: 0, total: data?.items.length ?? 0 });
  void call('checkWishlist', { all: true }).catch(() => {}).then(load);
});

async function load() {
  s = await getSettings();
  data = { ...(await call<Data>('wishlistFull')), status: await call<SteamStatus | null>('steamStatus') };
  progress(data.run);
  render();
}

// Mientras se revisa, cada juego que termina se ve al momento (sin repintar si estás escribiendo un límite).
let t = 0;
browser.storage.onChanged.addListener((ch, area) => {
  if (area === 'session' && ch.wishCheck) progress((ch.wishCheck.newValue as Data['run']) ?? null);
  if (area === 'local' && (ch.wish || ch.settings)) {
    clearTimeout(t);
    t = window.setTimeout(() => { if (!(document.activeElement as HTMLElement)?.dataset?.appid) void load(); }, 400);
  }
});

// Al abrir la página se vuelve a leer la cuenta (como mucho cada 10 min); si cambia la lista, se repinta sola.
void load().then(() => call('syncUser', {}).then(() => load(), () => {}));
