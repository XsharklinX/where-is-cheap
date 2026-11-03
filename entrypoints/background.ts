import { gather, planCart, rank, savings, type CartItem } from '@/lib/compare';
import { getCoupons, getHistory, getLedger, getNames, getUser, getWish, setHistory, setLedger, setNames, setUser, setWish, type LedgerEntry, type SteamUser } from '@/lib/data';
import { addPoint, verdict } from '@/lib/history';
import { sameGame } from '@/lib/match';
import { getRates } from '@/lib/rates';
import { getSettings } from '@/lib/settings';
import { searchDriffle } from '@/lib/stores/driffle';
import { searchEneba } from '@/lib/stores/eneba';
import { searchIG } from '@/lib/stores/ig';
import { searchKinguin } from '@/lib/stores/kinguin';
import type { Compare, Game, RawOffer, StoreId } from '@/lib/types';
import { STORE_IDS } from '@/lib/types';

const TTL = 30 * 60 * 1000;
type Cached = { game: Game; raw: RawOffer[]; failed: StoreId[]; at: number };
const SEARCHERS = { ig: searchIG, eneba: (q: string) => searchEneba(q), driffle: (q: string) => searchDriffle(q), kinguin: searchKinguin };

/* ---------- Steam ---------- */

async function steamGame(appid: number): Promise<Game> {
  const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=do&l=english`);
  const d = (await r.json())?.[appid];
  if (!d?.success) throw new Error('Steam no devolvió el juego');
  const p = d.data.price_overview;
  const usd = p && p.currency === 'USD';
  const names = await getNames();
  if (names[appid] !== d.data.name) await setNames({ ...names, [appid]: String(d.data.name) });
  return {
    appid,
    name: String(d.data.name),
    isFree: !!d.data.is_free,
    steamUSD: usd ? p.final / 100 : null,
    steamInitialUSD: usd ? p.initial / 100 : null,
    steamDiscount: usd ? p.discount_percent : 0,
    isDlc: d.data.type === 'dlc',
    baseAppid: d.data.fullgame?.appid ? Number(d.data.fullgame.appid) : undefined,
  };
}

/** C: del nombre visto en una página al appid de Steam, solo si el nombre coincide exacto. */
async function findAppid(name: string): Promise<number | null> {
  const r = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&cc=do&l=english`);
  const d = await r.json();
  const hit = (d.items ?? []).find((it: any) => it.type === 'app' && sameGame(it.name, name));
  return hit ? Number(hit.id) : null;
}

/* ---------- comparar ---------- */

async function cached(appid: number, fresh: boolean): Promise<Cached> {
  const key = `cmp:${appid}`;
  let c = (await browser.storage.session.get(key))[key] as Cached | undefined;
  if (fresh || !c || Date.now() - c.at > TTL) {
    const s = await getSettings();
    const game = await steamGame(appid);
    const { raw, failed } = game.isFree ? { raw: [], failed: [] as StoreId[] } : await gather(game.name, SEARCHERS, s.country);
    c = { game, raw, failed, at: Date.now() };
    if (failed.length < STORE_IDS.length) await browser.storage.session.set({ [key]: c });
  }
  return c;
}

async function compareApp(appid: number, fresh: boolean): Promise<Compare> {
  const [c, s, rates, coupons, user] = await Promise.all([cached(appid, fresh), getSettings(), getRates(), getCoupons(), getUser()]);
  const offers = rank(c.game, c.raw, rates, s, coupons);
  const top = offers.find((o) => o.fit === 'ok');
  let history = await getHistory(appid);
  if (!c.game.isFree) {
    history = addPoint(history, { t: Date.now(), steam: c.game.steamUSD, best: top?.totalUSD ?? null, store: top?.store });
    await setHistory(appid, history);
  }
  const best = top ? Math.min(top.totalUSD, c.game.steamUSD ?? Infinity) : c.game.steamUSD;
  return {
    game: c.game, offers, failed: c.failed, rates, pay: s.pay, at: c.at, history,
    verdict: verdict(history, best ?? null, c.game.steamDiscount ?? 0),
    owned: user.owned.includes(appid),
    ownsBase: c.game.isDlc && c.game.baseAppid && user.at ? user.owned.includes(c.game.baseAppid) : null,
  };
}

async function setBadge(tabId: number | undefined, c: Compare) {
  if (tabId == null) return;
  const save = savings(c);
  await browser.action.setBadgeText({ tabId, text: save ? `-${save.pct}%` : '' });
  if (save) await browser.action.setBadgeBackgroundColor({ tabId, color: '#45d69b' });
}

/* ---------- E: lista de deseos y avisos ---------- */

async function syncUser(u: SteamUser) {
  await setUser(u);
  const wish = await getWish();
  const next: typeof wish = {};
  for (const id of u.wishlist) next[id] = wish[id] ?? { appid: id };
  // Se conservan los límites puestos a mano aunque el juego ya no esté en la lista de Steam.
  for (const [id, w] of Object.entries(wish)) if (w.target != null && !next[+id]) next[+id] = w;
  await setWish(next);
}

async function checkWishlist(limit = 12) {
  const [wish, s, user] = await Promise.all([getWish(), getSettings(), getUser()]);
  const items = Object.values(wish).map((w) => ({ ...w }))
    .filter((w) => !user.owned.includes(w.appid))
    .sort((a, b) => (b.target != null ? 1 : 0) - (a.target != null ? 1 : 0) || (a.checkedAt ?? 0) - (b.checkedAt ?? 0))
    .slice(0, limit);
  for (const w of items) {
    try {
      const c = await compareApp(w.appid, true);
      const top = c.offers.find((o) => o.fit === 'ok');
      const save = savings(c);
      Object.assign(w, { name: c.game.name, lastBest: top?.totalUSD, lastStore: top?.store, lastUrl: top?.url, steamUSD: c.game.steamUSD, checkedAt: Date.now() });
      const hitTarget = top && w.target != null && top.totalUSD <= w.target;
      const hitDrop = top && s.dropAlerts && save && save.pct >= s.dropPct;
      const newLow = top && (w.notifiedPrice == null || top.totalUSD < w.notifiedPrice - 0.01);
      if ((hitTarget || hitDrop) && newLow && top) {
        const why = hitTarget ? `tu límite era $${w.target!.toFixed(2)}` : `−${save!.pct}% frente a Steam`;
        await browser.notifications.create(`wish:${w.appid}`, {
          type: 'basic',
          iconUrl: browser.runtime.getURL('/icon/128.png'),
          title: `${c.game.name} bajó a $${top.totalUSD.toFixed(2)}`,
          message: `En ${top.store === 'ig' ? 'Instant Gaming' : top.store[0].toUpperCase() + top.store.slice(1)} · activa en RD · ${why}`,
          buttons: [{ title: 'Ver oferta' }],
        });
        w.notifiedAt = Date.now();
        w.notifiedPrice = top.totalUSD;
      }
    } catch { /* se reintenta en la siguiente vuelta */ }
    // Se vuelve a leer y solo se tocan los datos de la revisión: un límite puesto mientras tanto se respeta.
    const fresh = await getWish();
    const cur = fresh[w.appid];
    if (cur) {
      const notifiedNow = w.notifiedAt != null && w.notifiedAt !== cur.notifiedAt;
      fresh[w.appid] = {
        ...cur,
        name: w.name, lastBest: w.lastBest, lastStore: w.lastStore, lastUrl: w.lastUrl, steamUSD: w.steamUSD, checkedAt: w.checkedAt,
        ...(notifiedNow ? { notifiedAt: w.notifiedAt, notifiedPrice: w.notifiedPrice } : {}),
      };
      await setWish(fresh);
    }
  }
}

async function openWishOffer(nid: string) {
  if (!nid.startsWith('wish:')) return;
  const w = (await getWish())[Number(nid.slice(5))];
  await browser.tabs.create({ url: w?.lastUrl ?? `https://store.steampowered.com/app/${nid.slice(5)}/` });
  await browser.notifications.clear(nid);
}

/* ---------- O: ahorro ---------- */

async function logClick(e: Omit<LedgerEntry, 'id' | 'at' | 'state'>) {
  const l = await getLedger();
  // Un clic repetido al mismo juego en la misma hora no cuenta dos veces.
  const dup = l.find((x) => x.appid === e.appid && x.state === 'pending' && Date.now() - x.at < 3_600_000);
  if (dup) Object.assign(dup, e, { at: Date.now() });
  else l.unshift({ ...e, id: crypto.randomUUID(), at: Date.now(), state: 'pending' });
  await setLedger(l.slice(0, 200));
}

/* ---------- C: detección en cualquier página ---------- */

const DETECT_ID = 'wic-detect';
async function syncDetection() {
  const s = await getSettings();
  const has = await browser.permissions.contains({ origins: ['<all_urls>'] });
  const reg = await browser.scripting.getRegisteredContentScripts({ ids: [DETECT_ID] }).catch(() => []);
  if (s.detectAnywhere && has && !reg.length) {
    await browser.scripting.registerContentScripts([{
      id: DETECT_ID,
      js: ['content-scripts/detect.js'],
      matches: ['<all_urls>'],
      excludeMatches: ['https://store.steampowered.com/*', 'https://*.eneba.com/*', 'https://*.instant-gaming.com/*', 'https://*.kinguin.net/*', 'https://driffle.com/*'],
      runAt: 'document_idle',
      persistAcrossSessions: true,
    }]);
  } else if ((!s.detectAnywhere || !has) && reg.length) {
    await browser.scripting.unregisterContentScripts({ ids: [DETECT_ID] });
  }
}

/* ---------- mensajes ---------- */


async function handle(msg: any, sender: any): Promise<unknown> {
  switch (msg?.type) {
    case 'compare': {
      const c = await compareApp(Number(msg.appid), !!msg.fresh);
      await setBadge(sender.tab?.id, c).catch(() => {});
      return c;
    }
    case 'detect': {
      const appid = await findAppid(String(msg.name));
      if (!appid) return null;
      if (sender.tab?.id != null) await browser.storage.session.set({ [`det:${sender.tab.id}`]: appid });
      return compareApp(appid, false);
    }
    case 'tabGame': {
      const m = String(msg.url ?? '').match(/^https:\/\/store\.steampowered\.com\/app\/(\d+)/);
      if (m) return Number(m[1]);
      const k = `det:${Number(msg.tabId)}`;
      return ((await browser.storage.session.get(k))[k] as number | undefined) ?? null;
    }
    case 'userdata': await syncUser(msg.user); return true;
    case 'wishlist': {
      const [wish, user, names] = await Promise.all([getWish(), getUser(), getNames()]);
      return { items: Object.values(wish).map((w) => ({ ...w, name: w.name ?? names[w.appid] })), user };
    }
    case 'setTarget': {
      const wish = await getWish();
      const w = wish[msg.appid] ?? { appid: msg.appid };
      w.target = msg.target == null ? undefined : Number(msg.target);
      w.notifiedPrice = undefined;
      wish[msg.appid] = w;
      await setWish(wish);
      return true;
    }
    case 'checkWishlist': await checkWishlist(Number(msg.limit) || 12); return true;
    case 'click': await logClick(msg.entry); return true;
    case 'ledger': return getLedger();
    case 'ledgerSet': {
      const l = await getLedger();
      const e = l.find((x) => x.id === msg.id);
      if (e) e.state = msg.state;
      await setLedger(l);
      return l;
    }
    case 'cart': {
      const s = await getSettings();
      const items: CartItem[] = [];
      for (const appid of (msg.appids as number[]).slice(0, 8)) {
        try {
          const c = await compareApp(appid, false);
          items.push({ appid, name: c.game.name, steamUSD: c.game.steamUSD, offers: c.offers });
        } catch { /* juego que Steam no devuelve: se salta */ }
      }
      return { plan: planCart(items, s.pay), rates: await getRates(), omitted: Math.max(0, (msg.appids as number[]).length - 8) };
    }
    case 'syncDetection': await syncDetection(); return true;
    case 'options': await browser.runtime.openOptionsPage(); return true;
  }
  return undefined;
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: any, sender, sendResponse) => {
    handle(msg, sender).then((data) => sendResponse({ ok: true, data }), (e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
    return true;
  });

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') browser.runtime.openOptionsPage();
    browser.alarms.create('wishlist', { periodInMinutes: 360, delayInMinutes: 5 });
    void syncDetection();
  });
  browser.runtime.onStartup.addListener(() => void syncDetection());
  browser.alarms.onAlarm.addListener((a) => { if (a.name === 'wishlist') void checkWishlist(); });
  browser.notifications.onClicked.addListener((id) => void openWishOffer(id));
  browser.notifications.onButtonClicked.addListener((id) => void openWishOffer(id));
  browser.tabs.onRemoved.addListener((id) => void browser.storage.session.remove(`det:${id}`));
  browser.tabs.onUpdated.addListener((id, info) => { if (info.url) void browser.storage.session.remove(`det:${id}`); });

  // P: Alt+W abre el panel lateral (Chrome) o la barra lateral (Firefox).
  const anyBrowser = browser as any;
  if (anyBrowser.sidePanel?.setPanelBehavior) anyBrowser.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  browser.commands.onCommand.addListener((cmd, tab) => {
    if (cmd !== 'open-panel') return;
    if (anyBrowser.sidePanel?.open && tab?.windowId != null) anyBrowser.sidePanel.open({ windowId: tab.windowId });
    else anyBrowser.sidebarAction?.open?.();
  });
});
