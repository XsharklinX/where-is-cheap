import { activationURL, findKeys } from '@/lib/activate';
import { call } from '@/lib/api';
import { priceOff, readPagePrice, type Expect } from '@/lib/health';
import { esc } from '@/lib/ui';

// 5 (fase D): en las páginas de pedido de Eneba, Kinguin, Driffle e Instant Gaming detecta la clave de Steam que
// te han dado y ofrece un botón para activarla en Steam. Con una clave va directo; con varias, despliega la lista.
const ICON = browser.runtime.getURL('/stores/steam.png');

export default defineContentScript({
  matches: ['https://*.eneba.com/*', 'https://*.kinguin.net/*', 'https://*.instant-gaming.com/*', 'https://*.driffle.com/*', 'https://driffle.com/*'],
  main() {
    let keys: string[] = [];
    let host: HTMLElement | null = null;
    let open = false;

    const css = `
      :host{all:initial}
      *{box-sizing:border-box}
      .k{position:fixed;right:18px;bottom:18px;z-index:2147483000;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
      .btn{display:flex;align-items:center;gap:9px;background:#ffb547;color:#17141a;font-weight:700;font-size:14px;line-height:1.2;padding:10px 14px;border:0;border-radius:10px;text-decoration:none;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35)}
      .btn:hover{filter:brightness(1.05)}
      .btn img{border-radius:3px}
      .btn small{font-weight:500;opacity:.72;font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .panel{position:absolute;right:0;bottom:54px;width:330px;max-height:55vh;overflow:auto;background:#17141a;border:1px solid #2a242f;border-radius:12px;padding:8px;box-shadow:0 12px 32px rgba(0,0,0,.5)}
      .panel a{display:flex;justify-content:space-between;align-items:center;gap:10px;color:#e8e4ec;text-decoration:none;font-size:13px;padding:9px 10px;border-radius:8px}
      .panel a:hover{background:#241e29}
      .panel code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:13px;letter-spacing:.5px}
      .panel .go{color:#ffb547;font-weight:700;white-space:nowrap}
    `;

    function render() {
      const old = host;
      host = document.createElement('where-is-cheap-key');
      const sh = host.attachShadow({ mode: 'open' });
      const one = keys.length === 1;
      const btn = one
        ? `<a class="btn" href="${activationURL(keys[0])}" target="_blank" rel="noopener noreferrer"><img src="${ICON}" alt="" width="20" height="20"><span>Activar en Steam</span><small>${esc(keys[0])}</small></a>`
        : `<button type="button" class="btn" data-a="toggle"><img src="${ICON}" alt="" width="20" height="20"><span>Activar ${keys.length} claves en Steam</span></button>`;
      const list = one ? '' : `<div class="panel"${open ? '' : ' hidden'}>${keys.map((k) => `<a href="${activationURL(k)}" target="_blank" rel="noopener noreferrer"><code>${esc(k)}</code><span class="go">Activar ↗</span></a>`).join('')}</div>`;
      sh.innerHTML = `<style>${css}</style><div class="k">${list}${btn}</div>`;
      sh.querySelector('[data-a="toggle"]')?.addEventListener('click', () => {
        open = !open;
        sh.querySelector<HTMLElement>('.panel')!.hidden = !open;
      });
      old?.remove();
      document.documentElement.append(host);
    }

    function scan() {
      const found = findKeys(document.body?.innerText ?? '').slice(0, 20);
      const changed = found.length !== keys.length || found.some((k, i) => k !== keys[i]);
      if (!changed && host) return;
      keys = found;
      open = false;
      if (found.length) render();
      else { host?.remove(); host = null; }
    }

    void scan();
    void checkPrice();

    /* 1.8 (12): si llegaste desde «Ir», comprobar que el precio de la página es el que dijimos. Si no se puede leer, nada. */
    async function checkPrice() {
      const exp = await call<Expect | null>('arrived', { url: location.href }).catch(() => null);
      if (!exp) return;
      let seen: { price: number; currency: string } | null = null;
      for (let i = 0; i < 12 && !seen; i++) {
        seen = readPagePrice(document);
        if (!seen) await new Promise((r) => setTimeout(r, 800));
      }
      if (!seen || seen.currency !== exp.currency || !priceOff(exp.price, seen.price)) return;
      void call('seen', { url: exp.url, price: seen.price, currency: seen.currency }).catch(() => {});
      const sym = exp.currency === 'EUR' ? '€' : '$';
      const m = (n: number) => `${sym}${n.toFixed(2)}`;
      const up = seen.price > exp.price;
      const bar = document.createElement('where-is-cheap-price');
      const sh = bar.attachShadow({ mode: 'open' });
      sh.innerHTML = `<style>
        :host{all:initial}
        .b{position:fixed;left:18px;bottom:18px;z-index:2147483000;max-width:440px;display:flex;gap:10px;align-items:flex-start;background:#17141a;color:#f3eee8;border:1px solid #2c2730;box-shadow:inset 3px 0 0 #ffb547,0 10px 28px rgba(0,0,0,.45);border-radius:10px;padding:11px 12px 11px 15px;font:13px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif}
        b{color:#ffb547} .up{color:#ffd166} .dn{color:#45d69b}
        small{display:block;color:#a69ea6;font-size:12px;margin-top:2px}
        button{flex:none;background:none;border:0;color:#a69ea6;font-size:18px;line-height:1;cursor:pointer;padding:0 2px}
        button:hover{color:#fff}
      </style><div class="b" role="status"><svg width="14" height="14" viewBox="0 0 34 34" aria-hidden="true" style="flex:none;margin-top:3px"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11.4a2.5 2.5 0 0 1 1.77.73l9.6 9.6a2.5 2.5 0 0 1 0 3.54l-11.4 11.4a2.5 2.5 0 0 1-3.54 0l-9.6-9.6A2.5 2.5 0 0 1 4 17.9Z" fill="#ffb547"/></svg><div>Aquí sale a <b class="${up ? 'up' : 'dn'}">${m(seen.price)}</b>, no a ${m(exp.price)} como vimos al buscar${up ? '' : ': mejor para ti'}.<small>Antes de la comisión y del cupón. La próxima vez que compares ${esc(exp.name)} usaremos este precio.</small></div><button type="button" aria-label="Cerrar">×</button></div>`;
      sh.querySelector('button')!.addEventListener('click', () => bar.remove());
      document.documentElement.append(bar);
    }

    // Las claves se revelan al pulsar «Ver clave» o al cargar la biblioteca: se vuelve a mirar cuando cambia la página.
    let t = 0;
    const mo = new MutationObserver(() => { clearTimeout(t); t = window.setTimeout(scan, 500); });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  },
});
