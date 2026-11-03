// Q y E: lista de deseos y biblioteca de tu cuenta de Steam.
// Se leen con tu sesión de store.steampowered.com: desde el background (que manda tus cookies porque la extensión
// tiene permiso sobre esa web) o desde la ficha de un juego. Nada sale de este navegador salvo a Steam.

/** Lo que dice la página de Steam de quién eres. */
export interface SteamSession { loggedIn: boolean; steamid?: string; token?: string }

const unent = (s: string) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** De los atributos de #application_config (HTML o DOM) a la sesión. Pura: se prueba sin red. */
export function parseSession(userinfo: string | null | undefined, userConfig: string | null | undefined): SteamSession {
  let info: any = {};
  let cfg: any = {};
  try { info = JSON.parse(userinfo ?? '{}'); } catch { /* sin datos */ }
  try { cfg = JSON.parse(userConfig ?? '{}'); } catch { /* sin datos */ }
  return { loggedIn: !!info.logged_in, steamid: info.steamid ? String(info.steamid) : undefined, token: cfg.webapi_token || undefined };
}

export function sessionFromHtml(html: string): SteamSession {
  const tag = html.match(/<div[^>]*id="application_config"[^>]*>/)?.[0] ?? '';
  const attr = (n: string) => { const m = tag.match(new RegExp(`${n}="([^"]*)"`)); return m ? unent(m[1]) : null; };
  return parseSession(attr('data-userinfo'), attr('data-store_user_config'));
}

export function sessionFromDom(doc: Document): SteamSession {
  const el = doc.querySelector<HTMLElement>('#application_config');
  return parseSession(el?.dataset.userinfo, el?.dataset.store_user_config);
}

/** Lo que se ha podido leer. status dice por qué está vacío, si lo está. */
export interface UserRead { status: 'ok' | 'logged-out' | 'error'; wishlist: number[]; owned: number[]; steamid?: string; error?: string; source?: string }

const ids = (list: any[] | undefined, k?: string) => [...new Set((list ?? []).map((x) => Number(k ? x?.[k] : x)).filter((n) => n > 0))];

/**
 * Lee la cuenta. Primero /dynamicstore/userdata/ (lista y biblioteca de una vez); si la lista llega vacía, la API
 * oficial de la lista de deseos con el token de la sesión; si la biblioteca llega vacía, la de juegos que tienes.
 */
export async function readSteamUser(session: SteamSession, f: typeof fetch = fetch): Promise<UserRead> {
  if (!session.loggedIn) return { status: 'logged-out', wishlist: [], owned: [] };
  try {
    const r = await f(`https://store.steampowered.com/dynamicstore/userdata/?t=${Date.now()}`, { credentials: 'include', cache: 'no-store' });
    const d = r.ok ? await r.json() : {};
    let wishlist = ids(d.rgWishlist);
    let owned = ids(d.rgOwnedApps);
    const src = ['userdata'];
    const q = session.token && session.steamid ? `access_token=${encodeURIComponent(session.token)}&steamid=${session.steamid}` : null;
    if (!wishlist.length && q) {
      const w = await (await f(`https://api.steampowered.com/IWishlistService/GetWishlist/v1/?${q}`)).json().catch(() => null);
      wishlist = ids(w?.response?.items, 'appid');
      if (wishlist.length) src.push('GetWishlist');
    }
    if (!owned.length && q) {
      const o = await (await f(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?${q}&include_played_free_games=true`)).json().catch(() => null);
      owned = ids(o?.response?.games, 'appid');
      if (owned.length) src.push('GetOwnedGames');
    }
    return { status: 'ok', wishlist, owned, steamid: session.steamid, source: src.join('+') };
  } catch (e) {
    return { status: 'error', wishlist: [], owned: [], error: String((e as Error)?.message ?? e) };
  }
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
  const list = [...scope.querySelectorAll<HTMLAnchorElement>('a[href*="/app/"]')]
    .map((a) => Number(a.href.match(/\/app\/(\d+)/)?.[1]))
    .filter(Boolean);
  return [...new Set(list)];
}

/**
 * Nombres de muchos juegos de una vez (IStoreBrowseService/GetItems, sin clave). Sin esto, los juegos de la lista
 * que aún no se han revisado salían como «App 274170». Pide de 100 en 100; lo que falle se queda sin nombre.
 */
export async function fetchNames(appids: number[], f: typeof fetch = fetch): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  for (let i = 0; i < appids.length; i += 100) {
    const input = { ids: appids.slice(i, i + 100).map((appid) => ({ appid })), context: { language: 'english', country_code: 'DO' } };
    try {
      const r = await f(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`);
      const d = r.ok ? await r.json() : null;
      for (const it of d?.response?.store_items ?? []) if (it?.appid && it.name) out[Number(it.appid)] = String(it.name);
    } catch { /* se reintenta en la próxima lectura */ }
  }
  return out;
}

/** 9: un DLC tal como lo da Steam en RD. */
export interface DlcInfo { appid: number; name: string; steamUSD: number | null; soon: boolean }

/** 9: nombre, precio en RD y si ya salió, de muchos DLC de una vez (GetItems, de 100 en 100, 200 como mucho). */
export async function fetchDlcs(appids: number[], f: typeof fetch = fetch, now = Date.now()): Promise<DlcInfo[]> {
  const out: DlcInfo[] = [];
  const list = appids.slice(0, 200);
  for (let i = 0; i < list.length; i += 100) {
    const input = { ids: list.slice(i, i + 100).map((appid) => ({ appid })), context: { language: 'english', country_code: 'DO' }, data_request: { include_release: true } };
    try {
      const r = await f(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`);
      const d = r.ok ? await r.json() : null;
      for (const it of d?.response?.store_items ?? []) {
        if (!it?.appid || it.success !== 1 || it.visible === false || !it.name) continue;
        const cents = it.best_purchase_option?.final_price_in_cents;
        const rel = Number(it.release?.steam_release_date ?? 0) * 1000;
        out.push({ appid: Number(it.appid), name: String(it.name), steamUSD: cents != null ? Number(cents) / 100 : null, soon: !!it.release?.is_coming_soon || rel > now });
      }
    } catch { /* lo que falle no sale */ }
  }
  return out;
}
