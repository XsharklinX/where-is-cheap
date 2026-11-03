import { call } from './api';

// Se ejecuta dentro de store.steampowered.com, con tu sesión: Steam devuelve tu lista de deseos y tu biblioteca.
// Si no has iniciado sesión, las listas llegan vacías y no se guarda nada.
const EVERY = 30 * 60 * 1000;

export async function syncSteamUser(): Promise<void> {
  const last = Number(sessionStorage.getItem('wic-user-at') ?? 0);
  if (Date.now() - last < EVERY) return;
  const r = await fetch('/dynamicstore/userdata/', { credentials: 'same-origin' });
  if (!r.ok) return;
  const d = await r.json();
  const wishlist: number[] = (d.rgWishlist ?? []).map(Number);
  const owned: number[] = (d.rgOwnedApps ?? []).map(Number);
  sessionStorage.setItem('wic-user-at', String(Date.now()));
  if (!wishlist.length && !owned.length) return;
  await call('userdata', { user: { wishlist, owned, at: Date.now() } });
}

/** F: juegos del carrito. Primero la API oficial con el token de la página; si no, los enlaces del carrito. */
export async function cartAppids(): Promise<number[]> {
  try {
    const cfg = document.querySelector<HTMLElement>('#application_config')?.dataset.store_user_config;
    const token = cfg ? JSON.parse(cfg).webapi_token : null;
    if (token) {
      const r = await fetch(`https://api.steampowered.com/IAccountCartService/GetCart/v1/?access_token=${token}&user_country=DO`);
      const items: any[] = (await r.json())?.response?.cart?.line_items ?? [];
      const pkgs = items.map((i) => i.packageid).filter(Boolean);
      const apps: number[] = [];
      for (const p of pkgs) {
        const d = await (await fetch(`/api/packagedetails?packageids=${p}&cc=do`)).json();
        const first = d?.[p]?.data?.apps?.[0]?.id;
        if (first) apps.push(Number(first));
      }
      if (apps.length) return [...new Set(apps)];
    }
  } catch { /* se prueba con los enlaces */ }
  const item = document.querySelector('[class*="cart" i] [class*="item" i]');
  const scope = item?.parentElement?.closest('[class*="cart" i]');
  if (!scope) return [];
  const ids = [...scope.querySelectorAll<HTMLAnchorElement>('a[href*="/app/"]')]
    .map((a) => Number(a.href.match(/\/app\/(\d+)/)?.[1]))
    .filter(Boolean);
  return [...new Set(ids)];
}
