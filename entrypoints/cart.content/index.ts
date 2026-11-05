import '@/lib/ui.css';
import '@/lib/box.css';
import { call } from '@/lib/api';
import type { CartPlan } from '@/lib/compare';
import { getSettings } from '@/lib/settings';
import { cartAppids } from '@/lib/steamUser';
import type { Rates } from '@/lib/types';
import { STORES } from '@/lib/types';
import { esc, logo, money, TAG_SVG } from '@/lib/ui';
import { claimPage } from '@/lib/claim';

// F: en el carrito de Steam, reparte los juegos entre tiendas para pagar lo mínimo.
// 1.7 (7): dentro de la columna del total de Steam, debajo del botón de pagar. Si Steam cambia la página y no se
// encuentra ese botón, vuelve a la caja flotante de antes.
const PAY = /^(continue to payment|continuar (con el|al) pago|continuar al pago|purchase for myself|comprar para m[ií])$/i;

function payButton(): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>('button, a, div[role="button"]')) {
    const t = el.textContent?.trim() ?? '';
    if (t.length < 40 && PAY.test(t) && el.getBoundingClientRect().width > 120) return el;
  }
  return null;
}

export default defineContentScript({
  matches: ['https://store.steampowered.com/cart*'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    if (!claimPage(ctx, 'cart')) return;
    let ids: number[] = [];
    for (let i = 0; i < 10 && !ids.length; i++) {
      ids = await cartAppids();
      if (!ids.length) await new Promise((r) => setTimeout(r, 800));
    }
    if (!ids.length) return;
    let pay: HTMLElement | null = null;
    for (let i = 0; i < 12 && !pay; i++) {
      pay = payButton();
      if (!pay) await new Promise((r) => setTimeout(r, 500));
    }
    const inline = !!pay;

    const ui = await createShadowRootUi(ctx, {
      name: 'where-is-cheap-cart',
      position: 'inline',
      anchor: inline ? pay!.parentElement! : 'body',
      append: inline ? 'last' : 'last',
      onMount(container) {
        const root = document.createElement('div');
        root.className = inline ? 'wic cartin' : 'wic cartbox';
        container.append(root);
        root.innerHTML = inline
          ? `<div class="ci"><div class="ci-mk">${TAG_SVG('#262a33', 13)}Where is cheap</div><div class="ci-t">Repartiendo tu carrito entre 4 tiendas…</div></div>`
          : `<div class="strip">${TAG_SVG()}<div class="tx"><div class="t1">Repartiendo tu carrito…</div><div class="t2">${ids.length} ${ids.length === 1 ? 'juego' : 'juegos'} en 4 tiendas</div></div><span class="spin" style="margin-left:auto"></span></div>`;
        void run(root);
        return root;
      },
    });
    ui.mount();

    async function run(root: HTMLElement) {
      try {
        const [{ plan, rates, omitted }, s] = await Promise.all([call<{ plan: CartPlan; rates: Rates; omitted: number }>('cart', { appids: ids }), getSettings()]);
        const c = { rates };
        const save = plan.steamUSD - plan.totalUSD;
        const extra = plan.separateUSD - plan.totalUSD;
        const shops = new Set(plan.picks.map((p) => p.store).filter((x) => x !== 'steam')).size;
        if (inline) {
          const rows = plan.picks.map((p) => {
            const name = p.store === 'steam' ? 'Steam' : STORES[p.store].name;
            return `<a class="ci-r" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" title="${esc(`${p.name} en ${name}`)}">${logo(p.store, name)}<span>${esc(p.name)}</span><b>${money(p.priceUSD, c, s)}</b></a>`;
          }).join('');
          root.innerHTML = `<div class="ci">
            <div class="ci-mk">${TAG_SVG('#262a33', 13)}Where is cheap${omitted ? ' · solo los 8 primeros' : ''}</div>
            <div class="ci-tot"><span>Fuera de Steam</span><b>${money(plan.totalUSD, c, s)}</b></div>
            <div class="ci-sv">${save > 0.01 ? `Ahorras ${money(save, c, s)}${shops > 1 ? ` en ${shops} tiendas` : ''}` : 'Steam sale igual o más barato'}</div>
            <div class="ci-rows">${rows}</div>
            <div class="ci-f">${extra > 0.01 ? `Juntar pedidos ahorra ${money(extra, c, s)} · ` : ''}comisiones estimadas</div></div>`;
          return;
        }
        const rows = plan.picks.map((p) => {
          const name = p.store === 'steam' ? 'Steam' : STORES[p.store].name;
          return `<a class="row" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${logo(p.store, name)}<span class="rn"><b>${esc(p.name)}</b><span>${name}</span></span><span class="pr"><span class="pn">${money(p.priceUSD, c, s)}</span></span><span class="ir">Ir</span></a>`;
        }).join('');
        root.innerHTML = `
          <div class="panel">
            <div class="ph">${TAG_SVG('#17141a', 18)}<b>Tu carrito, más barato</b>${omitted ? `<span class="chip warn">solo los 8 primeros</span>` : ''}<button class="x" data-a="close" aria-label="Cerrar">×</button></div>
            <div class="rows">${rows}</div>
            <div class="tot">
              <div><span>En Steam</span><span class="num">${money(plan.steamUSD, c, s)}</span></div>
              <div><span>Por separado</span><span class="num">${money(plan.separateUSD, c, s)}</span></div>
              <div class="best"><span>Agrupado</span><span class="num">${money(plan.totalUSD, c, s)}</span></div>
            </div>
            <div class="foot"><span>${save > 0.01 ? `Ahorras ${money(save, c, s)} frente a Steam` : 'Steam sale igual o más barato'}${extra > 0.01 ? ` · juntar pedidos ahorra ${money(extra, c, s)} más` : ''} · comisiones estimadas</span></div>
          </div>`;
        root.querySelector('[data-a="close"]')!.addEventListener('click', () => ui.remove());
      } catch (e) {
        root.innerHTML = inline
          ? `<div class="ci"><div class="ci-mk">${TAG_SVG('#262a33', 13)}Where is cheap</div><div class="ci-t">No pudimos repartir el carrito: ${esc(String((e as Error).message ?? e))}</div></div>`
          : `<div class="strip">${TAG_SVG()}<div class="tx"><div class="t1">No pudimos repartir el carrito</div><div class="t2">${esc(String((e as Error).message ?? e))}</div></div></div>`;
      }
    }
  },
});
