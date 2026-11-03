import css from '@/lib/ui.css?inline';
import { call, trackClicks } from '@/lib/api';
import { getSettings } from '@/lib/settings';
import type { Compare } from '@/lib/types';
import { esc, money, rowsHTML, TAG_SVG } from '@/lib/ui';
import { candidates } from '@/lib/detect';

// C: se registra solo si activas «Detectar juegos fuera de Steam» y das el permiso.
// Busca un nombre de juego en datos estructurados y títulos; solo enseña algo si Steam tiene un juego con ese nombre exacto.
export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  main() {
    let lastKey = '';
    let host: HTMLElement | null = null;
    let stopped = false;

    async function scan() {
      if (stopped) return;
      const names = candidates(document, location.href);
      const key = location.href + '|' + names.join('|');
      if (key === lastKey) return;
      lastKey = key;
      host?.remove();
      host = null;
      for (const name of names.slice(0, 3)) {
        try {
          const c = await call<Compare | null>('detect', { name });
          // Si mientras tanto cambió la página o se desactivó, el resultado ya no vale.
          if (stopped || key !== lastKey) return;
          if (c && !c.game.isFree) { await show(c, key); return; }
        } catch { /* siguiente candidato */ }
      }
    }

    async function show(c: Compare, key: string) {
      const s = await getSettings();
      if (stopped || key !== lastKey) return;
      host?.remove();
      const top = c.offers.find((o) => o.fit === 'ok');
      host = document.createElement('where-is-cheap-pill');
      const sh = host.attachShadow({ mode: 'open' });
      sh.innerHTML = `<style>${css}
        .pill{position:fixed;right:18px;bottom:18px;z-index:2147483000;width:340px;max-width:calc(100vw - 36px)}
        .pill .strip{cursor:pointer}
        .pill .panel{max-height:60vh;overflow:auto}
        .x{margin-left:auto;background:none;border:0;color:var(--mute);font-size:18px;line-height:1;padding:0 4px}
      </style>
      <div class="wic pill">
        <div class="panel" hidden><div class="ph"><b>${esc(c.game.name)}</b><button class="x" data-a="close" aria-label="Cerrar">×</button></div><div class="rows">${rowsHTML(c, s, true)}</div></div>
        <div class="strip" role="button" tabindex="0" aria-expanded="false">${TAG_SVG()}<div class="tx"><div class="t1">${esc(c.game.name)}</div><div class="t2">${c.owned ? 'Ya lo tienes' : top ? `desde <b style="color:var(--tag)">${money(top.totalUSD, c, s)}</b> · activa en RD` : 'Sin oferta que active en RD'}</div></div><span class="chip gh" style="margin-left:auto">Ver</span></div>
      </div>`;
      const panel = sh.querySelector<HTMLElement>('.panel')!;
      const strip = sh.querySelector<HTMLElement>('.strip')!;
      const toggle = () => { panel.hidden = !panel.hidden; strip.setAttribute('aria-expanded', String(!panel.hidden)); };
      strip.addEventListener('click', toggle);
      strip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      sh.querySelector('[data-a="close"]')!.addEventListener('click', () => host?.remove());
      trackClicks(sh, c);
      document.documentElement.append(host);
    }

    void scan();
    // Páginas que cambian sin recargar (YouTube, Twitch, Reddit).
    let href = location.href;
    const timer = setInterval(() => { if (location.href !== href) { href = location.href; setTimeout(scan, 1500); } }, 1000);
    // Al desactivar la detección en ajustes, las pestañas ya abiertas dejan de buscar y quitan la etiqueta.
    browser.storage.onChanged.addListener((ch, area) => {
      if (area === 'local' && ch.settings && (ch.settings.newValue as { detectAnywhere?: boolean } | undefined)?.detectAnywhere === false) {
        stopped = true;
        clearInterval(timer);
        host?.remove();
        host = null;
      }
    });
  },
});
