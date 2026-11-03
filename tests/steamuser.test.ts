import { describe, expect, it } from 'vitest';
import { fetchNames, readSteamUser, sessionFromHtml } from '../lib/steamUser';

// Atributos reales de #application_config (de store.steampowered.com/about/), con sesión y sin ella.
const html = (logged: boolean) => `<div id="application_config" style="display: none;"  data-config="{}" data-userinfo="{&quot;logged_in&quot;:${logged}${logged ? ',&quot;steamid&quot;:&quot;76561198000000001&quot;' : ''},&quot;country_code&quot;:&quot;DO&quot;}" data-store_user_config="{&quot;webapi_token&quot;:&quot;${logged ? 'TOK' : ''}&quot;,&quot;shoppingcart&quot;:null}"></div>`;

/** Un Steam de mentira: responde según la URL y apunta lo que se le pidió. */
function fakeSteam(r: Record<string, unknown>) {
  const asked: string[] = [];
  const f = (async (url: string) => {
    asked.push(url);
    const k = Object.keys(r).find((x) => url.includes(x));
    return { ok: true, json: async () => (k ? r[k] : {}) } as Response;
  }) as unknown as typeof fetch;
  return { f, asked };
}

describe('Q y E: leer la cuenta de Steam', () => {
  it('lee la sesión del HTML de Steam', () => {
    expect(sessionFromHtml(html(true))).toEqual({ loggedIn: true, steamid: '76561198000000001', token: 'TOK' });
    expect(sessionFromHtml(html(false))).toEqual({ loggedIn: false, steamid: undefined, token: undefined });
    expect(sessionFromHtml('<html></html>').loggedIn).toBe(false);
  });
  it('sin sesión no pregunta nada', async () => {
    const { f, asked } = fakeSteam({});
    expect((await readSteamUser({ loggedIn: false }, f)).status).toBe('logged-out');
    expect(asked).toEqual([]);
  });
  it('con userdata completo no usa la API', async () => {
    const { f, asked } = fakeSteam({ userdata: { rgWishlist: [10, 20], rgOwnedApps: [30] } });
    const r = await readSteamUser({ loggedIn: true, steamid: '1', token: 'T' }, f);
    expect(r).toMatchObject({ status: 'ok', wishlist: [10, 20], owned: [30], source: 'userdata' });
    expect(asked).toHaveLength(1);
  });
  it('si userdata llega vacío, usa la API oficial con el token', async () => {
    const { f, asked } = fakeSteam({
      userdata: { rgWishlist: [], rgOwnedApps: [] },
      GetWishlist: { response: { items: [{ appid: 367520, priority: 1 }, { appid: 1145360 }] } },
      GetOwnedGames: { response: { games: [{ appid: 1245620 }] } },
    });
    const r = await readSteamUser({ loggedIn: true, steamid: '765', token: 'T K' }, f);
    expect(r).toMatchObject({ status: 'ok', wishlist: [367520, 1145360], owned: [1245620], source: 'userdata+GetWishlist+GetOwnedGames' });
    expect(asked[1]).toContain('access_token=T%20K&steamid=765');
  });
  it('sin token no hay plan B, y queda vacío (el background no borra lo guardado)', async () => {
    const { f } = fakeSteam({ userdata: { rgWishlist: [] } });
    expect(await readSteamUser({ loggedIn: true }, f)).toMatchObject({ status: 'ok', wishlist: [], owned: [] });
  });
});

describe('fetchNames', () => {
  it('saca los nombres de GetItems y pide de 100 en 100', async () => {
    const calls: string[] = [];
    const f = (async (url: string) => {
      calls.push(url);
      const ids = JSON.parse(decodeURIComponent(url.split('input_json=')[1])).ids.map((x: any) => x.appid);
      return new Response(JSON.stringify({ response: { store_items: ids.map((appid: number) => ({ appid, name: `Juego ${appid}` })) } }));
    }) as typeof fetch;
    const ids = Array.from({ length: 150 }, (_, i) => i + 1);
    const n = await fetchNames(ids, f);
    expect(calls.length).toBe(2);
    expect(n[1]).toBe('Juego 1');
    expect(n[150]).toBe('Juego 150');
  });
  it('si Steam falla, devuelve vacío sin romper', async () => {
    const f = (async () => { throw new Error('red'); }) as typeof fetch;
    expect(await fetchNames([1, 2], f)).toEqual({});
  });
});
