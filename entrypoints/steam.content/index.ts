import '@/lib/ui.css';
import { appidFromUrl, call, friendlyError, requestCompare, trackClicks } from '@/lib/api';
import { getSettings } from '@/lib/settings';
import type { Compare, Settings } from '@/lib/types';
import { esc, footHTML, headline, notesHTML, rowsHTML, TAG_SVG, verdictHTML } from '@/lib/ui';
import { syncSteamUser } from '@/lib/steamUser';

export default defineContentScript({
  matches: ['https://store.steampowered.com/app/*'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    const appid = appidFromUrl(location.href);
    if (!appid) return;
    // Q y E: lee biblioteca y lista de deseos de tu sesión antes de comparar (como mucho cada 30 min).
    await syncSteamUser().catch(() => {});

    const wrapper = document.querySelector('#game_area_purchase .game_area_purchase_game_wrapper');
    const anchor = wrapper ?? document.querySelector('#game_area_purchase');
    if (!anchor) return;

    const ui = await createShadowRootUi(ctx, {
      name: 'where-is-cheap',
      position: 'inline',
      anchor,
      append: wrapper ? 'after' : 'first',
      onMount(container) {
        const root = document.createElement('div');
        root.className = 'wic';
        root.style.margin = '0 0 16px';
        container.append(root);
        void load(root, false);
        return root;
      },
    });
    ui.mount();

    async function load(root: HTMLElement, fresh: boolean) {
      root.innerHTML = `<div class="strip">${TAG_SVG()}<div class="tx"><div class="t1">Buscando el mejor precio…</div><div class="t2">Instant Gaming, Eneba, Driffle y Kinguin</div></div><span class="spin" style="margin-left:auto"></span></div>`;
      try {
        const [c, s] = await Promise.all([requestCompare(appid!, fresh), getSettings()]);
        if (c.game.isFree) { root.remove(); return; }
        render(root, c, s);
      } catch (e) {
        root.innerHTML = `<div class="strip">${TAG_SVG()}<div class="tx"><div class="t1">No pudimos comparar precios</div><div class="t2">${esc(friendlyError(e))}</div></div><button class="go ghost" data-a="retry">Reintentar</button></div>`;
        root.querySelector('[data-a="retry"]')!.addEventListener('click', () => load(root, true));
      }
    }

    function render(root: HTMLElement, c: Compare, s: Settings) {
      const { t1, t2 } = headline(c, s);
      const n = c.offers.length;
      const label = (open: boolean) => (open ? 'Ocultar ▴' : `Ver ${n} ${n === 1 ? 'oferta' : 'ofertas'} ▾`);
      root.innerHTML = `
        <div class="strip">${TAG_SVG()}
          <div class="tx"><div class="t1">${t1}</div><div class="t2">${t2}</div></div>
          ${n ? `<button class="go${c.owned ? ' ghost' : ''}" data-a="toggle" aria-expanded="false">${label(false)}</button>` : ''}
        </div>
        ${notesHTML(c)}
        <div class="panel" hidden>
          ${verdictHTML(c)}
          <div class="ph"><b>${n} ${n === 1 ? 'oferta' : 'ofertas'}</b>· ordenadas por lo que pagas al final</div>
          <div class="rows">${rowsHTML(c, s)}</div>
          <div class="foot">${footHTML(c, s)}<button data-a="refresh">Actualizar</button><button data-a="options">Ajustes</button></div>
        </div>`;
      const panel = root.querySelector<HTMLElement>('.panel')!;
      root.querySelector('[data-a="toggle"]')?.addEventListener('click', (ev) => {
        const b = ev.currentTarget as HTMLButtonElement;
        panel.hidden = !panel.hidden;
        b.setAttribute('aria-expanded', String(!panel.hidden));
        b.textContent = label(!panel.hidden);
      });
      root.querySelector('[data-a="refresh"]')?.addEventListener('click', () => load(root, true));
      root.querySelector('[data-a="options"]')?.addEventListener('click', () => void call('options'));
      trackClicks(root, c);
    }

    browser.storage.onChanged.addListener((ch, area) => {
      const root = ui.mounted as HTMLElement | undefined;
      if (area === 'local' && (ch.settings || ch.coupons) && root?.isConnected) void load(root, false);
    });
  },
});
