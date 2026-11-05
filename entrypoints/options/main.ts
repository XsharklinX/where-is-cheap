import '@/lib/ui.css';
import './options.css';
import { call } from '@/lib/api';
import { couponExpired } from '@/lib/compare';
import { getCoupons, setCoupons } from '@/lib/data';
import type { ErrEntry, HealthMap } from '@/lib/health';
import { cleanPayBy, payFor, payMixed, type FeeTable, type Learned, type PayBy } from '@/lib/fees';
import { cpuScore, detectGpu, GPU_CATALOG, gpuScore, softwareGpu, type PcAuto, type PcManual } from '@/lib/pc';
import { fxFromCharge, getRates } from '@/lib/rates';
import { getSettings, saveSettings } from '@/lib/settings';
import type { Pay, Settings, StoreId } from '@/lib/types';
import { COUPON_URLS, CURRENCIES, STORE_IDS, STORES } from '@/lib/types';
import { andList, esc, logo, shortDate, TAG_SVG } from '@/lib/ui';

document.getElementById('brand')!.innerHTML = `${TAG_SVG('#121014', 30)}<h1>Where is cheap</h1>`;
document.getElementById('ver')!.textContent = `Versión ${browser.runtime.getManifest().version}`;

/* 1.7 (10): iconos de línea en vez de emojis (se ven igual en todos los sistemas). */
const P = (d: string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS: Record<string, string> = {
  card: P('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>'),
  cpu: P('<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>'),
  bell: P('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>'),
  store: P('<path d="M4 9l1.5-5h13L20 9M4 9h16v11H4zM9 20v-6h6v6"/>'),
  ticket: P('<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v8a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2z"/><path d="M14 6v12" stroke-dasharray="2 2"/>'),
  pct: P('<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>'),
  globe: P('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>'),
  bank: P('<path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>'),
  gpu: P('<rect x="2" y="7" width="20" height="10" rx="2"/><circle cx="9" cy="12" r="2.5"/><circle cx="16" cy="12" r="2.5"/><path d="M5 17v3"/>'),
  ram: P('<rect x="3" y="7" width="18" height="10" rx="1.5"/><path d="M7 11v2M11 11v2M15 11v2M7 17v3M17 17v3"/>'),
  usd: P('<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>'),
  pp: P('<path d="M7 20l2-14h6a4 4 0 0 1 0 8h-4l-1 6z"/>'),
};
document.querySelectorAll<HTMLElement>('[data-ic]').forEach((el) => (el.innerHTML = ICONS[el.dataset.ic!] ?? ''));
const saved = document.getElementById('saved')!;
let timer = 0;
const DAY = 86_400_000;

function flash(msg = 'Guardado') {
  saved.textContent = msg;
  clearTimeout(timer);
  timer = window.setTimeout(() => (saved.textContent = ''), 2200);
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const longDate = (t: number) => new Date(t).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' });

/* ---------- 4: cupones ---------- */

async function renderCoupons() {
  const list = await getCoupons();
  const box = $('coupons');
  const now = Date.now();
  const state = (c: (typeof list)[number]) => {
    if (couponExpired(c, now)) return `<span class="chip no">caducó el ${shortDate(c.expires!)}</span>`;
    if (c.expires != null) return `<span class="mute">caduca el ${longDate(c.expires)}</span>`;
    const days = Math.floor((now - c.checkedAt) / DAY);
    // Sin fecha de caducidad, a los 30 días se pregunta si sigue valiendo.
    if (days >= 30) return `<span class="chip warn">apuntado hace ${days} días · ¿sigue valiendo?</span><button type="button" data-ok="${c.id}">Sigue valiendo</button>`;
    return `<span class="mute">apuntado el ${longDate(c.checkedAt)}</span>`;
  };
  box.innerHTML = list.length
    ? list.map((c) => `<div class="crow${couponExpired(c, now) ? ' off' : ''}">${logo(c.store, STORES[c.store].name)}<b class="mono">${esc(c.code)}</b><span>−${c.pct}% en ${STORES[c.store].name}</span>${state(c)}<button type="button" data-del="${c.id}" aria-label="Borrar cupón ${esc(c.code)}">Borrar</button></div>`).join('')
    : '<p class="mute">Ninguno todavía.</p>';
  box.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    await setCoupons((await getCoupons()).filter((c) => c.id !== b.dataset.del));
    void renderCoupons();
    flash('Cupón borrado');
  }));
  box.querySelectorAll<HTMLButtonElement>('[data-ok]').forEach((b) => b.addEventListener('click', async () => {
    await setCoupons((await getCoupons()).map((c) => (c.id === b.dataset.ok ? { ...c, checkedAt: Date.now() } : c)));
    void renderCoupons();
    flash('Apuntado: sigue valiendo');
  }));
}

/* ---------- 4: tu PC ---------- */

async function initPc(force = false) {
  const { auto, manual } = await call<{ auto: PcAuto; manual: PcManual }>('pcInfo', { gpu: detectGpu(), force });
  const box = $('pcRows');
  const chip = (cls: string, t: string) => `<span class="chip ${cls}">${t}</span>`;
  const gpuState = (v: string) => !v ? chip('warn', 'Sin leer') : softwareGpu(v) ? chip('warn', 'El navegador no la ve') : gpuScore(v) ? chip('ok', 'Reconocida') : chip('warn', 'No la reconocemos');
  const cpuState = (v: string) => !v ? chip('warn', 'Sin leer') : cpuScore(v) ? chip('ok', 'Reconocido') : chip('warn', 'No lo reconocemos');
  const ramState = (v: number | null) => v ? chip('ok', 'Leída') : chip('warn', 'Sin leer');
  const ramVal = manual.ramGB ?? auto.ramGB;
  box.innerHTML = `
    <div class="pcc">
      <span class="pcc-ic">${ICONS.gpu}</span><b>Gráfica</b>
      <input id="pcGpu" maxlength="120" list="gpu-list" value="${esc(manual.gpu ?? '')}" placeholder="${esc(auto.gpu || 'Escribe o elige tu gráfica (p. ej. NVIDIA GeForce GTX 1080)')}">
      <span class="v" id="pcGpuS">${gpuState(manual.gpu || auto.gpu)}</span>
    </div>
    <div class="pcc">
      <span class="pcc-ic">${ICONS.cpu}</span><b>Procesador</b>
      <input id="pcCpu" maxlength="120" value="${esc(manual.cpu ?? '')}" placeholder="${esc(auto.cpu || 'Por ejemplo: AMD Ryzen 5 5600X')}">
      <span class="v" id="pcCpuS">${cpuState(manual.cpu || auto.cpu)}</span>
    </div>
    <div class="pcc">
      <span class="pcc-ic">${ICONS.ram}</span><b>Memoria</b>
      <span class="ram"><input id="pcRam" type="number" min="1" max="1024" step="1" inputmode="numeric" value="${manual.ramGB ?? ''}" placeholder="${auto.ramGB ?? ''}">GB</span>
      <span class="v" id="pcRamS">${ramState(ramVal)}</span>
    </div>
    <datalist id="gpu-list">${GPU_CATALOG.map((g) => `<option value="${esc(g)}"></option>`).join('')}</datalist>`;
  $('pcReset').hidden = !(manual.gpu || manual.cpu || manual.ramGB);
  const gpuIn = $<HTMLInputElement>('pcGpu'), cpuIn = $<HTMLInputElement>('pcCpu'), ramIn = $<HTMLInputElement>('pcRam');
  const refresh = () => {
    $('pcGpuS').innerHTML = gpuState(gpuIn.value.trim() || auto.gpu);
    $('pcCpuS').innerHTML = cpuState(cpuIn.value.trim() || auto.cpu);
    $('pcRamS').innerHTML = ramState(Number(ramIn.value) || auto.ramGB);
  };
  const save = async () => {
    const saved2 = await call<PcManual>('pcSet', { manual: { gpu: gpuIn.value, cpu: cpuIn.value, ramGB: ramIn.value ? Number(ramIn.value) : undefined } });
    $('pcReset').hidden = !(saved2.gpu || saved2.cpu || saved2.ramGB);
    flash();
  };
  for (const el of [gpuIn, cpuIn, ramIn]) {
    el.addEventListener('input', refresh);
    el.addEventListener('change', () => void save());
  }
}

/* ---------- 3: comisiones ---------- */

async function renderFees() {
  const { table, checked, learned, pay: general, payBy } = await call<{ table: FeeTable; checked: Partial<Record<StoreId, number>>; learned: Learned; pay: Pay; payBy: PayBy }>('fees');
  const prefs = { pay: general, payBy };
  const box = $('fees');
  const fmt = (f: { pct: number; fixed: number }) => (f.pct === 0 && f.fixed === 0 ? 'sin comisión' : [f.pct ? `${f.pct}%` : '', f.fixed ? `$${f.fixed.toFixed(2)} por pedido` : ''].filter(Boolean).join(' + '));
  // 1.8 (6): cada tienda con su forma de pago; la comisión de al lado es la de esa forma.
  const seg = (id: StoreId, pay: Pay) => `<span class="seg mini" role="radiogroup" aria-label="Cómo pagas en ${esc(STORES[id].name)}">${(['card', 'paypal'] as Pay[]).map((p) => `<button type="button" role="radio" aria-checked="${p === pay}" data-pay="${p}" data-store="${id}">${p === 'card' ? 'Tarjeta' : 'PayPal'}</button>`).join('')}</span>`;
  box.innerHTML = STORE_IDS.map((id) => {
    const pay = payFor(prefs, id);
    const n = learned[id]?.[pay]?.length ?? 0;
    const st = checked[id]
      ? `<span class="chip ok">comprobada el ${shortDate(checked[id]!)} · ${n} ${n === 1 ? 'compra' : 'compras'}</span><button type="button" data-reset="${id}">Volver a la estimada</button>`
      : table[id][pay].pct === 0 && table[id][pay].fixed === 0 ? '<span class="chip ok">no cobra comisión</span>' : '<span class="chip warn">estimada</span>';
    return `<div class="crow">${logo(id, STORES[id].name)}<b>${STORES[id].name}</b>${seg(id, pay)}<span class="mono">${fmt(table[id][pay])}</span>${st}</div>`;
  }).join('');
  // 15: qué tiendas siguen con «est.» y cómo quitarlo.
  const left = STORE_IDS.filter((id) => { const p = payFor(prefs, id); return !checked[id] && (table[id][p].pct || table[id][p].fixed); }).map((id) => STORES[id].name);
  const how = payMixed(prefs) ? 'Con la forma de pago que tiene cada tienda aquí.' : `Con ${general === 'card' ? 'tarjeta' : 'PayPal'}, que es lo que tienes elegido.`;
  box.innerHTML += left.length
    ? `<p class="mute">Siguen estimadas: <b>${andList(left)}</b>. Compra desde «Ir» en ${left.length === 1 ? 'esa tienda' : 'una de ellas'} y, cuando la extensión te pregunte «¿Lo compraste?», escribe el total que pagaste: con eso calcula la comisión real y quita el «est.» de sus precios. ${how}</p>`
    : `<p class="mute">Todas las comisiones están comprobadas con compras tuyas. ${how}</p>`;
  box.querySelectorAll<HTMLButtonElement>('[data-pay]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.store as StoreId;
    const s = await getSettings();
    await saveSettings({ payBy: cleanPayBy({ pay: s.pay, payBy: { ...s.payBy, [id]: b.dataset.pay as Pay } }) });
    flash(`${STORES[id].name}: pagas con ${b.dataset.pay === 'card' ? 'tarjeta' : 'PayPal'}`);
    void renderFees();
  }));
  box.querySelectorAll<HTMLButtonElement>('[data-reset]').forEach((b) => b.addEventListener('click', async () => {
    await call('feesReset', { store: b.dataset.reset });
    void renderFees();
    flash(`${STORES[b.dataset.reset as StoreId].name}: vuelve a la comisión estimada`);
  }));
}

/* ---------- 1.8 (11 y 13): estado de las tiendas y registro de fallos ---------- */

let report = '';
async function renderHealth(run = false) {
  const { health, errLog, report: r } = await call<{ health: HealthMap; errLog: ErrEntry[]; report: string }>('health', { run, ua: navigator.userAgent });
  report = r;
  const when = (t: number) => new Date(t).toLocaleString('es-DO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  $('health').innerHTML = STORE_IDS.map((id) => {
    const h = health[id];
    const st = !h ? '<span class="chip gh">sin revisar</span>'
      : h.ok ? `<span class="chip ok">bien · ${h.n} ${h.n === 1 ? 'oferta' : 'ofertas'} en ${(h.ms / 1000).toFixed(1).replace('.', ',')} s</span>`
        : `<span class="chip warn" title="${esc(h.why)}">no la pudimos leer: ${esc(h.why)}</span>`;
    return `<div class="crow">${logo(id, STORES[id].name)}<b>${STORES[id].name}</b><span class="mono">${h ? when(h.at) : ''}</span>${st}</div>`;
  }).join('');
  $('errLog').innerHTML = errLog.length
    ? [...errLog].reverse().map((e) => `<div class="erow"><span class="mono">${when(e.at)}</span><b>${e.store === 'steam' ? 'Steam' : STORES[e.store].name}</b><span>${esc(e.game)}</span><span class="mute">${esc(e.what)}</span></div>`).join('')
    : '<p class="mute">Sin fallos guardados.</p>';
}

function initHealth() {
  void renderHealth();
  $('healthRun').addEventListener('click', async () => {
    const b = $<HTMLButtonElement>('healthRun');
    b.disabled = true; b.textContent = 'Revisando…';
    try { await renderHealth(true); flash('Tiendas revisadas'); } catch { flash('No se pudo revisar'); }
    b.disabled = false; b.textContent = 'Revisar ahora';
  });
  $('errCopy').addEventListener('click', async () => {
    await renderHealth();
    try { await navigator.clipboard.writeText(report); flash('Informe copiado: pégalo en tu mensaje'); } catch { flash('No se pudo copiar'); }
  });
  $('errClear').addEventListener('click', async () => { await call('errClear'); await renderHealth(); flash('Registro borrado'); });
}

/* ---------- 5: tarjeta en pesos ---------- */

async function initFx(s: Settings) {
  const rates = await getRates();
  const mode = $('fxMode');
  const box = $('fxBox');
  const pct = $<HTMLInputElement>('fxPct');
  let cur = s.fxPct;
  const paint = (m: 'usd' | 'dop') => {
    mode.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === m)));
    box.hidden = m !== 'dop';
    pct.value = cur ? String(cur) : '';
    $('fxNow').textContent = m === 'usd'
      ? 'Pagas en dólares: los RD$ que ves son a la tasa del mercado, solo como referencia.'
      : cur
        ? `Hoy: 1 US$ = RD$ ${rates.DOP.toFixed(2)} en el mercado; con tu banco, RD$ ${(rates.DOP * (1 + cur / 100)).toFixed(2)} (+${cur}%). Los RD$ de todas las comparaciones ya lo incluyen.`
        : `Hoy: 1 US$ = RD$ ${rates.DOP.toFixed(2)} en el mercado. Calcula el recargo de tu banco para que los RD$ coincidan con tu estado de cuenta.`;
  };
  const save = async (v: number) => { cur = v; await saveSettings({ fxPct: v }); paint(v > 0 || !box.hidden ? 'dop' : 'usd'); };
  // 1.7 (10): si en la bienvenida elegiste «Tarjeta en pesos», se abre el cálculo del recargo.
  const fromWelcome = sessionStorage.getItem('wic-fx') === '1';
  sessionStorage.removeItem('wic-fx');
  paint(cur > 0 || fromWelcome ? 'dop' : 'usd');
  if (fromWelcome) $<HTMLInputElement>('fxUsd').focus();
  mode.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b?.dataset.v) return;
    if (b.dataset.v === 'usd') { box.hidden = true; await save(0); flash(); return; }
    box.hidden = false;
    paint('dop');
  });
  $('fxForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = fxFromCharge(Number($<HTMLInputElement>('fxUsd').value), Number($<HTMLInputElement>('fxDop').value), rates.DOP);
    if (v == null) { flash('Esos importes no cuadran con la tasa de hoy. Revisa que el cargo sea en dólares y el total en pesos.'); return; }
    await save(v);
    flash(v ? `Tu banco cobra un ${v}% más que el mercado` : 'Tu banco cobra la tasa del mercado');
  });
  pct.addEventListener('change', async () => {
    const v = Number(pct.value);
    if (pct.value !== '' && !(v >= 0 && v <= 20)) { flash('Pon un recargo entre 0 y 20 %'); return; }
    await save(pct.value === '' ? 0 : Math.round(v * 10) / 10);
    flash();
  });
}

async function init() {
  const s = await getSettings();
  document.querySelectorAll<HTMLElement>('.seg[data-k]').forEach((seg) => {
    const k = seg.dataset.k as 'pay' | 'currency' | 'dropPct' | 'alertEvery' | 'boxMode';
    const paint = (v: string) => seg.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === v)));
    paint(String(s[k]));
    seg.addEventListener('click', async (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b?.dataset.v) return;
      paint(b.dataset.v);
      // 1.8 (6): al cambiar la forma general, las tiendas que ya pagaban así dejan de ser excepción.
      const extra = k === 'pay' ? { payBy: cleanPayBy({ pay: b.dataset.v as Pay, payBy: (await getSettings()).payBy }) } : {};
      await saveSettings({ [k]: k === 'dropPct' || k === 'alertEvery' ? Number(b.dataset.v) : b.dataset.v, ...extra } as Partial<Settings>);
      flash();
      if (k === 'pay') void renderFees();
    });
  });
  // 1.4: la moneda local en que se muestran los precios (además o en vez del dólar).
  const cur = $<HTMLSelectElement>('localCurrency');
  cur.innerHTML = Object.entries(CURRENCIES).map(([code, c]) => `<option value="${code}">${esc(c.name)} · ${code}</option>`).join('');
  cur.value = s.localCurrency;
  cur.addEventListener('change', async () => { await saveSettings({ localCurrency: cur.value }); flash(); });

  for (const id of ['marketplaces', 'accounts', 'dropAlerts'] as const) {
    const el = $<HTMLInputElement>(id);
    el.checked = s[id];
    el.addEventListener('change', async () => { await saveSettings({ [id]: el.checked }); flash(); });
  }

  // Silenciar un día (también desde el botón de cualquier aviso).
  const mute = $<HTMLInputElement>('muted');
  const muteTxt = $('mutedTxt');
  const baseTxt = muteTxt.textContent!;
  const paintMute = (until: number) => {
    mute.checked = until > Date.now();
    muteTxt.textContent = mute.checked
      ? `Silenciados hasta el ${new Date(until).toLocaleString('es-DO', { weekday: 'long', hour: 'numeric', minute: '2-digit' })}`
      : baseTxt;
  };
  paintMute(s.mutedUntil);
  mute.addEventListener('change', async () => {
    const until = mute.checked ? Date.now() + 24 * 3_600_000 : 0;
    await saveSettings({ mutedUntil: until });
    paintMute(until);
    flash(mute.checked ? 'Avisos silenciados un día' : 'Avisos activados');
  });

  // C: el permiso para leer todas las páginas se pide aquí, con el clic del usuario.
  const det = $<HTMLInputElement>('detectAnywhere');
  det.checked = s.detectAnywhere && (await browser.permissions.contains({ origins: ['<all_urls>'] }));
  det.addEventListener('change', async () => {
    if (det.checked) {
      const ok = await browser.permissions.request({ origins: ['<all_urls>'] }).catch(() => false);
      if (!ok) { det.checked = false; flash('Sin el permiso no se puede detectar fuera de Steam'); return; }
    }
    await saveSettings({ detectAnywhere: det.checked });
    await call('syncDetection').catch(() => {});
    flash(det.checked ? 'Detección activada. Recarga las pestañas abiertas.' : 'Detección desactivada');
  });

  $('addCoupon').addEventListener('submit', async (e) => {
    e.preventDefault();
    const store = $<HTMLSelectElement>('cStore').value as StoreId;
    const code = $<HTMLInputElement>('cCode').value.trim();
    const pct = Number($<HTMLInputElement>('cPct').value);
    const exp = $<HTMLInputElement>('cExp').value;
    if (!code || !(pct >= 1 && pct <= 80)) { flash('Pon un código y un descuento entre 1 y 80 %'); return; }
    // La fecha del selector es la del día local; se guarda a medianoche de ese día.
    const expires = exp ? new Date(`${exp}T00:00:00`).getTime() : undefined;
    if (expires != null && expires + DAY < Date.now()) { flash('Esa fecha ya pasó'); return; }
    const list = (await getCoupons()).filter((c) => !(c.store === store && c.code.toLowerCase() === code.toLowerCase()));
    list.push({ id: crypto.randomUUID(), store, code, pct, checkedAt: Date.now(), ...(expires != null ? { expires } : {}) });
    await setCoupons(list);
    (e.target as HTMLFormElement).reset();
    void renderCoupons();
    flash('Cupón añadido');
  });
  void renderCoupons();
  // 1.4: enlaces a los cupones vigentes de cada tienda (agregador externo).
  $('couponLinks').innerHTML = STORE_IDS.map((id) => `<a class="crow" href="${COUPON_URLS[id]}" target="_blank" rel="noopener noreferrer">${logo(id, STORES[id].name)}<b>${STORES[id].name}</b><span class="mute">Ver cupones ↗</span></a>`).join('');
  void renderFees();
  initHealth();
  void initPc();
  $('pcRedo').addEventListener('click', () => void initPc(true).then(() => flash('Leído otra vez')));
  $('pcReset').addEventListener('click', async () => { await call('pcSet', { manual: {} }); await initPc(); flash('Cambios quitados'); });
  void initFx(s);

  // Navegación: marca la sección que se está viendo en la barra lateral.
  const navLinks = [...document.querySelectorAll<HTMLAnchorElement>('.side-nav a')];
  const spy = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) navLinks.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#${e.target.id}`));
  }, { rootMargin: '-40% 0px -55% 0px' });
  document.querySelectorAll<HTMLElement>('.content > section').forEach((sec) => spy.observe(sec));
}

void init();

/* ---------- 1.7 (14): lo que ocultaste ---------- */

async function renderHidden() {
  const st = await getSettings();
  const items = [
    ...(st.hiddenStores ?? []).map((id) => ({ k: 'store', v: id as string, html: `${logo(id, STORES[id].name)}<b>${STORES[id].name}</b><span class="mute">tienda</span>` })),
    ...(st.hiddenSellers ?? []).map((n) => ({ k: 'seller', v: n, html: `${logo('kinguin', 'Kinguin')}<b>${esc(n)}</b><span class="mute">vendedor de Kinguin</span>` })),
  ];
  $('hiddenNone').hidden = items.length > 0;
  $('hiddenList').innerHTML = items.map((i) => `<div class="crow">${i.html}<button type="button" data-unhide="${i.k}" data-v="${esc(i.v)}">Volver a mostrar</button></div>`).join('');
}
$('hiddenList').addEventListener('click', async (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-unhide]');
  if (!b) return;
  const st = await getSettings();
  if (b.dataset.unhide === 'store') await saveSettings({ hiddenStores: st.hiddenStores.filter((x) => x !== b.dataset.v) });
  else await saveSettings({ hiddenSellers: st.hiddenSellers.filter((x) => x !== b.dataset.v) });
  flash();
  void renderHidden();
});
void renderHidden();
browser.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.settings) void renderHidden(); });

/* ---------- 1.7 (10): la primera vez, tres pasos ---------- */

async function welcome() {
  const st = await getSettings();
  if (st.onboarded || location.hash !== '#bienvenida') return;
  const box = $('welcome');
  let step = 0;
  let payMode: 'usd' | 'dop' | 'paypal' = st.pay === 'paypal' ? 'paypal' : st.fxPct > 0 ? 'dop' : 'usd';
  let cur = st.localCurrency;
  let view: Settings['currency'] = st.currency;
  const opt = (name: string, v: string, on: boolean, ic: string, t: string, sub: string) =>
    `<label class="wel-opt${on ? ' on' : ''}"><input type="radio" name="${name}" value="${v}"${on ? ' checked' : ''}>${ICONS[ic]}<span>${t}<small>${sub}</small></span></label>`;
  const draw = async () => {
    box.querySelectorAll('.wel-dots i').forEach((d, i) => d.classList.toggle('on', i <= step));
    $('welStep').textContent = `Paso ${step + 1} de 3`;
    $('welBack').style.visibility = step ? 'visible' : 'hidden';
    $('welNext').textContent = step === 2 ? 'Empezar' : 'Siguiente';
    if (step === 0) {
      $('welT').textContent = '¿En qué moneda quieres ver los precios?';
      $('welP').textContent = 'Comparamos para cuentas de Steam de República Dominicana (LATAM-USD): solo verás claves que activan ahí.';
      $('welBody').innerHTML = `<label class="wel-sel">Tu moneda<select id="welCur">${Object.entries(CURRENCIES).map(([k, c]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(c.name)} · ${k}</option>`).join('')}</select></label>
        ${opt('view', 'both', view === 'both', 'globe', 'Dólares y tu moneda', 'El precio en USD con tu moneda al lado')}${opt('view', 'usd', view === 'usd', 'usd', 'Solo dólares', 'Como lo cobran las tiendas')}${opt('view', 'dop', view === 'dop', 'bank', 'Solo tu moneda', 'A la tasa del mercado')}`;
      $<HTMLSelectElement>('welCur').addEventListener('change', (e) => (cur = (e.target as HTMLSelectElement).value));
      $('welBody').querySelectorAll<HTMLInputElement>('input[name="view"]').forEach((r) => r.addEventListener('change', () => { view = r.value as Settings['currency']; void draw(); }));
    } else if (step === 1) {
      $('welT').textContent = '¿Cómo pagas normalmente?';
      $('welP').textContent = 'Cada tienda suma una comisión distinta según el método. Lo puedes cambiar luego.';
      $('welBody').innerHTML = opt('pay', 'usd', payMode === 'usd', 'card', 'Tarjeta en dólares', 'La comisión de la tienda y nada más')
        + opt('pay', 'dop', payMode === 'dop', 'usd', 'Tarjeta en pesos', 'Tu banco suma su recargo: al terminar te enseñamos a calcularlo con un cargo tuyo')
        + opt('pay', 'paypal', payMode === 'paypal', 'pp', 'PayPal', 'Suele costar un poco más en Eneba y Kinguin');
      $('welBody').querySelectorAll<HTMLInputElement>('input[name="pay"]').forEach((r) => r.addEventListener('change', () => { payMode = r.value as typeof payMode; void draw(); }));
    } else {
      $('welT').textContent = 'Tu PC';
      $('welP').textContent = 'Con esto te decimos en cada juego si tu PC lo corre. Lo lee el navegador y no sale de aquí.';
      $('welBody').innerHTML = '<p class="mute">Leyendo…</p>';
      const info = await call<{ auto: PcAuto; manual: PcManual }>('pcInfo', { gpu: detectGpu(), force: false }).catch(() => null);
      if (step !== 2) return;
      const gpu = info?.manual.gpu || info?.auto.gpu || '', cpu = info?.manual.cpu || info?.auto.cpu || '', ram = info?.manual.ramGB ?? info?.auto.ramGB ?? null;
      const row = (ic: string, t: string, v: string, ok: boolean) => `<div class="wel-pc">${ICONS[ic]}<b>${t}</b><span>${v ? esc(v) : 'Sin leer'}</span>${ok ? '<span class="chip ok">Bien</span>' : '<span class="chip warn">Revísalo</span>'}</div>`;
      $('welBody').innerHTML = row('gpu', 'Gráfica', gpu, !!gpu && !softwareGpu(gpu) && !!gpuScore(gpu)) + row('cpu', 'Procesador', cpu, !!cpu && !!cpuScore(cpu)) + row('ram', 'Memoria', ram ? `${ram} GB` : '', !!ram)
        + '<p class="mute wel-note">Si algo no cuadra (en un portátil el navegador puede ver la gráfica integrada), lo corriges en «Tu PC» al terminar.</p>';
    }
  };
  box.hidden = false;
  $('welBack').addEventListener('click', () => { step = Math.max(0, step - 1); void draw(); });
  $('welNext').addEventListener('click', async () => {
    if (step < 2) { step++; void draw(); return; }
    await saveSettings({ localCurrency: cur, currency: view, pay: payMode === 'paypal' ? 'paypal' : 'card', onboarded: true });
    box.hidden = true;
    if (payMode === 'dop') sessionStorage.setItem('wic-fx', '1');
    history.replaceState(null, '', payMode === 'dop' ? '#compra' : '#pc');
    location.reload();
  });
  await draw();
}
void welcome();
