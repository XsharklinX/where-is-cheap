import '@/lib/ui.css';
import './options.css';
import { call } from '@/lib/api';
import { getCoupons, setCoupons } from '@/lib/data';
import { getSettings, saveSettings } from '@/lib/settings';
import type { Settings, StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';
import { esc, logo, TAG_SVG } from '@/lib/ui';

document.getElementById('brand')!.innerHTML = `${TAG_SVG('#121014', 30)}<h1>Where is cheap</h1>`;
const saved = document.getElementById('saved')!;
let timer = 0;

function flash(msg = 'Guardado') {
  saved.textContent = msg;
  clearTimeout(timer);
  timer = window.setTimeout(() => (saved.textContent = ''), 2200);
}

async function renderCoupons() {
  const list = await getCoupons();
  const box = document.getElementById('coupons')!;
  box.innerHTML = list.length
    ? list.map((c) => `<div class="crow">${logo(c.store, STORES[c.store].name)}<b class="mono">${esc(c.code)}</b><span>−${c.pct}% en ${STORES[c.store].name}</span><span class="mute">apuntado el ${new Date(c.checkedAt).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' })}</span><button type="button" data-del="${c.id}" aria-label="Borrar cupón ${esc(c.code)}">Borrar</button></div>`).join('')
    : '<p class="mute">Ninguno todavía.</p>';
  box.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    await setCoupons((await getCoupons()).filter((c) => c.id !== b.dataset.del));
    void renderCoupons();
    flash('Cupón borrado');
  }));
}

async function init() {
  const s = await getSettings();
  document.querySelectorAll<HTMLElement>('.seg').forEach((seg) => {
    const k = seg.dataset.k as 'pay' | 'currency' | 'dropPct';
    const paint = (v: string) => seg.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === v)));
    paint(String(s[k]));
    seg.addEventListener('click', async (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b?.dataset.v) return;
      paint(b.dataset.v);
      await saveSettings({ [k]: k === 'dropPct' ? Number(b.dataset.v) : b.dataset.v } as Partial<Settings>);
      flash();
    });
  });
  for (const id of ['marketplaces', 'accounts', 'dropAlerts'] as const) {
    const el = document.getElementById(id) as HTMLInputElement;
    el.checked = s[id];
    el.addEventListener('change', async () => { await saveSettings({ [id]: el.checked }); flash(); });
  }

  // C: el permiso para leer todas las páginas se pide aquí, con el clic del usuario.
  const det = document.getElementById('detectAnywhere') as HTMLInputElement;
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

  document.getElementById('addCoupon')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const store = (document.getElementById('cStore') as HTMLSelectElement).value as StoreId;
    const code = (document.getElementById('cCode') as HTMLInputElement).value.trim();
    const pct = Number((document.getElementById('cPct') as HTMLInputElement).value);
    if (!code || !(pct >= 1 && pct <= 80)) { flash('Pon un código y un descuento entre 1 y 80 %'); return; }
    const list = (await getCoupons()).filter((c) => !(c.store === store && c.code.toLowerCase() === code.toLowerCase()));
    list.push({ id: crypto.randomUUID(), store, code, pct, checkedAt: Date.now() });
    await setCoupons(list);
    (e.target as HTMLFormElement).reset();
    void renderCoupons();
    flash('Cupón añadido');
  });
  void renderCoupons();
}

void init();
