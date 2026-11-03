import type { Compare, Edition } from './types';
import { toast } from './ui';

export async function call<T = unknown>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
  const r = await browser.runtime.sendMessage({ type, ...payload });
  if (!r?.ok) throw new Error(r?.error ?? 'Sin respuesta de la extensión');
  return r.data as T;
}

/** Mensaje de error para el usuario, en vez del técnico del navegador. */
export function friendlyError(e: unknown): string {
  const m = String((e as Error)?.message ?? e);
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Sin conexión o una tienda no respondió. Prueba otra vez en un momento.';
  if (/unexpected token|json/i.test(m)) return 'Steam no respondió bien (puede estar saturado). Prueba otra vez en un momento.';
  if (/steam no devolvió/i.test(m)) return 'Steam no tiene datos de este juego para tu región.';
  if (/disconnected|port closed|receiving end/i.test(m)) return 'La extensión se reinició. Prueba otra vez.';
  return m;
}

export const requestCompare = (appid: number, fresh = false) => call<Compare>('compare', { appid, fresh });

/**
 * 1: comparación por partes. onPart recibe la comparación cada vez que responde una tienda; la promesa se
 * resuelve con la definitiva (con historial y veredicto).
 */
export function streamCompare(appid: number, fresh: boolean, onPart: (c: Compare) => void, edition?: Edition): Promise<Compare> {
  return new Promise((resolve, reject) => {
    let port: ReturnType<typeof browser.runtime.connect>;
    try { port = browser.runtime.connect({ name: 'compare' }); } catch (e) { reject(e); return; }
    let settled = false;
    port.onMessage.addListener((m: any) => {
      if (m.type === 'part') onPart(m.data);
      else {
        settled = true;
        port.disconnect();
        if (m.type === 'done') resolve(m.data); else reject(new Error(m.error));
      }
    });
    port.onDisconnect.addListener(() => { if (!settled) reject(new Error('port closed')); });
    port.postMessage({ appid, fresh, edition });
  });
}

export const appidFromUrl = (url?: string): number | null => {
  const m = url?.match(/^https:\/\/store\.steampowered\.com\/app\/(\d+)/);
  return m ? Number(m[1]) : null;
};

/** Copia en el mismo clic (antes de que la pestaña nueva le quite el foco a esta); si no puede, con la API moderna. */
async function copy(text: string): Promise<boolean> {
  let ok = false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    ok = document.execCommand('copy');
    ta.remove();
  } catch { /* se prueba con la API moderna */ }
  if (ok) return true;
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/**
 * O: al pulsar «Ir» en cualquier fila se apunta como compra pendiente de confirmar, con lo que hace falta para
 * aprender la comisión real (3). 4: si esa tienda tiene cupón, el código se copia al portapapeles.
 */
export function trackClicks(root: HTMLElement | ShadowRoot, c: Compare, toastRoot: HTMLElement | ShadowRoot = root) {
  root.querySelectorAll<HTMLAnchorElement>('a[data-store][data-i]').forEach((a) =>
    a.addEventListener('click', () => {
      const o = c.offers[Number(a.dataset.i)];
      if (!o) return;
      const net = o.priceUSD > 0 ? Math.round(o.price * (1 - o.couponUSD / o.priceUSD) * 100) / 100 : o.price;
      void call('click', {
        entry: { appid: c.game.appid, name: c.game.name + (c.edition ? ` (${c.edition})` : ''), store: o.store, paidUSD: o.totalUSD, steamUSD: c.game.steamUSD, net, currency: o.currency, pay: c.pay, ownedAtClick: c.owned },
      }).catch(() => {});
      if (o.coupon) {
        void copy(o.coupon).then((ok) => toast(toastRoot, ok ? `Cupón ${o.coupon} copiado: pégalo al pagar` : `Tu cupón: ${o.coupon}`));
      }
    }),
  );
}
