// Con dos copias de la extensión a la vez (la de la Chrome Web Store y una descomprimida), cada una pintaba su caja,
// sus píldoras y sus tiras, y cada una con sus propios ajustes. La primera que llega se queda la página; la otra no pinta.
// Una copia vieja de la MISMA extensión (tras actualizarla sin recargar) tiene el mismo id: no bloquea a la nueva.
import type { ContentScriptContext } from 'wxt/utils/content-script-context';

export function claimPage(ctx: ContentScriptContext, key: string): boolean {
  const de = document.documentElement;
  const attr = `data-wic-${key}`;
  const mine = browser.runtime.id;
  const owner = de.getAttribute(attr);
  if (owner && owner !== mine) return false;
  de.setAttribute(attr, mine);
  ctx.onInvalidated(() => { if (de.getAttribute(attr) === mine) de.removeAttribute(attr); });
  return true;
}
