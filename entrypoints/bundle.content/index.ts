import '@/lib/ui.css';
import { call } from '@/lib/api';
import { getSettings } from '@/lib/settings';
import type { BundleItem, Rates } from '@/lib/types';
import { STORES } from '@/lib/types';
import { esc, logo, money, TAG_SVG } from '@/lib/ui';

// 9: en la página de un pack de Steam (bundle o paquete), ¿sale mejor el pack o comprar cada juego donde esté más barato?
export default defineContentScript({
  matches: ['https://store.steampowered.com/bundle/*', 'https://store.steampowered.com/sub/*'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    const m = location.pathname.match(/^\/(bundle|sub)\/(\d+)/);
    if (!m) return;
    const [, kind, id] = m;

    // El bloque de compra visible (hay otro oculto para tabletas). Su precio ya descuenta lo que tienes, con tu sesión.
    const block = [...document.querySelectorAll<HTMLElement>('.game_area_purchase_game')].find((el) => !el.closest('.tablet_hidden') && el.querySelector('[data-price-final]'));
    const cents = block?.querySelector('[data-price-final]')?.getAttribute('data-price-final');
    const priceUSD = cents && /^\d+$/.test(cents) ? Number(cents) / 100 : null;
    if (!block || priceUSD == null) return;

    let appids: number[] = [];
    try {
      if (kind === 'bundle') {
        const d = await (await fetch(`/actions/ajaxresolvebundles?bundleids=${id}&cc=DO&l=english`, { credentials: 'same-origin' })).json();
        appids = (d?.[0]?.appids ?? []).map(Number);
      } else {
        const d = await (await fetch(`/api/packagedetails?packageids=${id}&cc=do`, { credentials: 'same-origin' })).json();
        appids = (d?.[id]?.data?.apps ?? []).map((a: any) => Number(a.id));
      }
    } catch { return; }
    appids = [...new Set(appids.filter(Boolean))];
    if (appids.length < 2) return;

    const ui = await createShadowRootUi(ctx, {
      name: 'where-is-cheap-bundle',
      position: 'inline',
      anchor: block.closest('.game_area_purchase_game_wrapper') ?? block,
      append: 'after',
      onMount(container) {
        const root = document.createElement('div');
        root.className = 'wic';
        root.style.margin = '0 0 16px';
        container.append(root);
        root.innerHTML = `<div class="strip">${TAG_SVG()}<div class="tx"><div class="t1">¿El pack o por separado?</div><div class="t2">Comparando los ${appids.length} juegos del pack en 4 tiendas…</div></div><span class="spin" style="margin-left:auto"></span></div>`;
        void run(root);
        return root;
      },
    });
    ui.mount();

    async function run(root: HTMLElement) {
      try {
        const [{ items, rates, omitted }, s] = await Promise.all([call<{ items: BundleItem[]; rates: Rates; omitted: number }>('bundle', { appids }), getSettings()]);
        const c = { rates };
        const need = items.filter((x) => !x.owned);
        const missing = need.filter((x) => x.priceUSD == null);
        const separate = need.reduce((t, x) => t + (x.priceUSD ?? 0), 0);
        const owned = items.length - need.length;
        const diff = Math.abs(priceUSD! - separate);
        const complete = !missing.length && !omitted;

        let t1: string;
        let t2: string;
        if (!need.length) { t1 = 'Ya tienes todos los juegos del pack'; t2 = 'No hace falta comprarlo.'; }
        else if (complete && separate + 0.01 < priceUSD!) { t1 = `Por separado ahorras <span class="num">${money(diff, c, s)}</span>`; t2 = `Pack ${money(priceUSD!, c, s)} · cada juego donde está más barato ${money(separate, c, s)}`; }
        else if (complete) { t1 = `El pack sale <span class="num">${money(diff, c, s)}</span> más barato`; t2 = `Pack ${money(priceUSD!, c, s)} · por separado, lo mejor que hay ${money(separate, c, s)}`; }
        else if (separate >= priceUSD!) { t1 = 'El pack sale más barato'; t2 = `Aun sin contar ${missing.length + omitted} ${missing.length + omitted === 1 ? 'juego' : 'juegos'} sin precio suelto, por separado ya suma ${money(separate, c, s)}.`; }
        else { t1 = 'No se puede comparar del todo'; t2 = `${missing.length + omitted} ${missing.length + omitted === 1 ? 'juego del pack no se vende' : 'juegos del pack no se venden'} sueltos o no respondieron.`; }
        if (owned && need.length) t2 += ` · ${owned} ya ${owned === 1 ? 'lo tienes' : 'los tienes'}`;

        const rows = items.map((x) => {
          const where = x.store === 'steam' ? 'Steam' : x.store ? STORES[x.store].name : '';
          const price = x.owned ? '<span class="chip ok">Ya lo tienes</span>' : x.priceUSD != null ? `<span class="pr"><span class="pn">${money(x.priceUSD, c, s)}</span><span class="pf">${where}</span></span>` : '<span class="chip gh">Sin precio suelto</span>';
          const lg = x.store ? logo(x.store, where) : logo('steam', 'Steam');
          return `<a class="row${x.owned ? ' no' : ''}" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${lg}<span class="rn"><b>${esc(x.name)}</b></span>${price}<span class="ir${x.owned ? ' ghost' : ''}">Ir</span></a>`;
        }).join('');
        root.innerHTML = `
          <div class="strip">${TAG_SVG()}<div class="tx"><div class="t1">${t1}</div><div class="t2">${t2}</div></div><button class="go ghost" data-a="toggle" aria-expanded="false">Ver juegos ▾</button></div>
          <div class="panel" hidden>
            <div class="ph"><b>${items.length} juegos</b>· el precio más bajo de cada uno, fuera o en Steam${omitted ? ` · solo los 25 primeros de ${appids.length}` : ''}</div>
            <div class="rows">${rows}</div>
            <div class="foot"><span>Precio final con comisión de cada tienda, un pedido por juego. Lo que ya tienes no cuenta.</span></div>
          </div>`;
        const panel = root.querySelector<HTMLElement>('.panel')!;
        root.querySelector('[data-a="toggle"]')!.addEventListener('click', (e) => {
          panel.hidden = !panel.hidden;
          const b = e.currentTarget as HTMLButtonElement;
          b.setAttribute('aria-expanded', String(!panel.hidden));
          b.textContent = panel.hidden ? 'Ver juegos ▾' : 'Ocultar ▴';
        });
      } catch (e) {
        root.innerHTML = `<div class="strip">${TAG_SVG()}<div class="tx"><div class="t1">No pudimos comparar el pack</div><div class="t2">${esc(String((e as Error).message ?? e))}</div></div></div>`;
      }
    }
  },
});
