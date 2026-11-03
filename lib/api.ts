import type { Compare } from './types';

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
  return m;
}

export const requestCompare = (appid: number, fresh = false) => call<Compare>('compare', { appid, fresh });

export const appidFromUrl = (url?: string): number | null => {
  const m = url?.match(/^https:\/\/store\.steampowered\.com\/app\/(\d+)/);
  return m ? Number(m[1]) : null;
};

/** O: al pulsar «Ir» en cualquier fila se apunta como compra pendiente de confirmar. */
export function trackClicks(root: ParentNode, c: Compare) {
  root.querySelectorAll<HTMLAnchorElement>('a.row[data-store]').forEach((a) =>
    a.addEventListener('click', () => {
      void call('click', {
        entry: { appid: c.game.appid, name: c.game.name, store: a.dataset.store, paidUSD: Number(a.dataset.total), steamUSD: c.game.steamUSD },
      }).catch(() => {});
    }),
  );
}
