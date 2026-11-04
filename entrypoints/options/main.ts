import '@/lib/ui.css';
import './options.css';
import { call } from '@/lib/api';
import { couponExpired } from '@/lib/compare';
import { getCoupons, setCoupons } from '@/lib/data';
import type { FeeTable, Learned } from '@/lib/fees';
import { cpuScore, detectGpu, GPU_CATALOG, gpuScore, softwareGpu, type PcAuto, type PcManual } from '@/lib/pc';
import { fxFromCharge, getRates } from '@/lib/rates';
import { getSettings, saveSettings } from '@/lib/settings';
import type { Pay, Settings, StoreId } from '@/lib/types';
import { COUPON_URLS, CURRENCIES, STORE_IDS, STORES } from '@/lib/types';
import { andList, esc, logo, shortDate, TAG_SVG } from '@/lib/ui';

document.getElementById('brand')!.innerHTML = `${TAG_SVG('#121014', 30)}<h1>Where is cheap</h1><span class="ver">v${browser.runtime.getManifest().version}</span>`;
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
      <span class="pcc-ic">🖥️</span><b>Gráfica</b>
      <input id="pcGpu" maxlength="120" list="gpu-list" value="${esc(manual.gpu ?? '')}" placeholder="${esc(auto.gpu || 'Escribe o elige tu gráfica (p. ej. NVIDIA GeForce GTX 1080)')}">
      <span class="v" id="pcGpuS">${gpuState(manual.gpu || auto.gpu)}</span>
    </div>
    <div class="pcc">
      <span class="pcc-ic">⚙️</span><b>Procesador</b>
      <input id="pcCpu" maxlength="120" value="${esc(manual.cpu ?? '')}" placeholder="${esc(auto.cpu || 'Por ejemplo: AMD Ryzen 5 5600X')}">
      <span class="v" id="pcCpuS">${cpuState(manual.cpu || auto.cpu)}</span>
    </div>
    <div class="pcc">
      <span class="pcc-ic">🧠</span><b>Memoria</b>
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
  const { table, checked, learned, pay } = await call<{ table: FeeTable; checked: Partial<Record<StoreId, number>>; learned: Learned; pay: Pay }>('fees');
  const box = $('fees');
  const fmt = (f: { pct: number; fixed: number }) => (f.pct === 0 && f.fixed === 0 ? 'sin comisión' : [f.pct ? `${f.pct}%` : '', f.fixed ? `$${f.fixed.toFixed(2)} por pedido` : ''].filter(Boolean).join(' + '));
  box.innerHTML = STORE_IDS.map((id) => {
    const n = learned[id]?.[pay]?.length ?? 0;
    const st = checked[id]
      ? `<span class="chip ok">comprobada el ${shortDate(checked[id]!)} · ${n} ${n === 1 ? 'compra' : 'compras'}</span><button type="button" data-reset="${id}">Volver a la estimada</button>`
      : table[id][pay].pct === 0 && table[id][pay].fixed === 0 ? '<span class="chip ok">no cobra comisión</span>' : '<span class="chip warn">estimada</span>';
    return `<div class="crow">${logo(id, STORES[id].name)}<b>${STORES[id].name}</b><span class="mono">${fmt(table[id][pay])}</span>${st}</div>`;
  }).join('');
  // 15: qué tiendas siguen con «est.» y cómo quitarlo.
  const left = STORE_IDS.filter((id) => !checked[id] && (table[id][pay].pct || table[id][pay].fixed)).map((id) => STORES[id].name);
  box.innerHTML += left.length
    ? `<p class="mute">Siguen estimadas: <b>${andList(left)}</b>. Compra desde «Ir» en ${left.length === 1 ? 'esa tienda' : 'una de ellas'} y, cuando la extensión te pregunte «¿Lo compraste?», escribe el total que pagaste: con eso calcula la comisión real y quita el «est.» de sus precios. Con ${pay === 'card' ? 'tarjeta' : 'PayPal'}, que es lo que tienes elegido arriba.</p>`
    : `<p class="mute">Todas las comisiones están comprobadas con compras tuyas. Con ${pay === 'card' ? 'tarjeta' : 'PayPal'}, que es lo que tienes elegido arriba.</p>`;
  box.querySelectorAll<HTMLButtonElement>('[data-reset]').forEach((b) => b.addEventListener('click', async () => {
    await call('feesReset', { store: b.dataset.reset });
    void renderFees();
    flash(`${STORES[b.dataset.reset as StoreId].name}: vuelve a la comisión estimada`);
  }));
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
  paint(cur > 0 ? 'dop' : 'usd');
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
    const k = seg.dataset.k as 'pay' | 'currency' | 'dropPct' | 'alertEvery';
    const paint = (v: string) => seg.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === v)));
    paint(String(s[k]));
    seg.addEventListener('click', async (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b?.dataset.v) return;
      paint(b.dataset.v);
      await saveSettings({ [k]: k === 'dropPct' || k === 'alertEvery' ? Number(b.dataset.v) : b.dataset.v } as Partial<Settings>);
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
