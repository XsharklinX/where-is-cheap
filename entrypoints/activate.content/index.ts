import { activationURL, findKeys } from '@/lib/activate';
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
    // Las claves se revelan al pulsar «Ver clave» o al cargar la biblioteca: se vuelve a mirar cuando cambia la página.
    let t = 0;
    const mo = new MutationObserver(() => { clearTimeout(t); t = window.setTimeout(scan, 500); });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  },
});
