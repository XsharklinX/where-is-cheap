import { gather, planCart, rank, savings, type CartItem } from '@/lib/compare';
import { getCoupons, getHistory, getLearned, getLedger, getNames, getSteamStatus, getUser, getWish, setHistory, setLearned, setLedger, setNames, setSteamStatus, setUser, setWish, type LedgerEntry, type SteamStatus, type SteamUser, type WishItem } from '@/lib/data';
import { mergeFees, plausible, round2 } from '@/lib/fees';
import { addPoint, nextSale, verdict } from '@/lib/history';
import { getLow, toLow, waitWorth } from '@/lib/low';
import { norm, sameGame } from '@/lib/match';
import { getRates, withFx } from '@/lib/rates';
import { getSettings, saveSettings } from '@/lib/settings';
import { canRun, gameReqs, ramFromBytes, softwareGpu, type GameReqs, type PcAuto, type PcManual, effectiveSpecs } from '@/lib/pc';
import { fetchDlcs, fetchNames, readSteamUser, sessionFromHtml, type SteamSession } from '@/lib/steamUser';
import { searchDriffle } from '@/lib/stores/driffle';
import { searchEneba } from '@/lib/stores/eneba';
import { searchIG } from '@/lib/stores/ig';
import { parseKinguinSeller, searchKinguin, type SellerNote } from '@/lib/stores/kinguin';
import { parseEpic, parseSteamFree, type FreeGame } from '@/lib/free';
import { parseHistory, refundable, REFUND_DAYS } from '@/lib/refunds';
import type { BundleItem, Compare, Edition, Game, HistLow, RawOffer, SearchHit, StoreId, Verdict } from '@/lib/types';
import { STORE_IDS, STORES } from '@/lib/types';

const TTL = 30 * 60 * 1000;
type Cached = { game: Game; raw: RawOffer[]; failed: StoreId[]; at: number };
type Part = Cached & { pending: StoreId[] };
const SEARCHERS = { ig: searchIG, eneba: (q: string) => searchEneba(q), driffle: (q: string) => searchDriffle(q), kinguin: searchKinguin };

/* ---------- Steam ---------- */

async function steamGame(appid: number): Promise<Game> {
  const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=do&l=english`);
  const d = (await r.json())?.[appid];
  if (!d?.success) throw new Error('Steam no devolvió el juego');
  const p = d.data.price_overview;
  const usd = p && p.currency === 'USD';
  // 4: los requisitos salen de la misma respuesta; se guardan para «¿Lo corre mi PC?».
  // 9: y la lista de DLC.
  await browser.storage.session.set({ [`app:${appid}`]: { reqs: gameReqs(d.data.pc_requirements), dlc: (d.data.dlc ?? []).map(Number).filter(Boolean) } satisfies AppExtra }).catch(() => {});
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

/* ---------- 4: ¿Lo corre mi PC? ---------- */

/** 4 y 9: lo que no hace falta para comparar precios pero sale de la misma ficha (requisitos y DLC). */
type AppExtra = { reqs: GameReqs | null; dlc: number[] };
async function steamApp(appid: number): Promise<AppExtra> {
  const k = `app:${appid}`;
  const read = async () => (await browser.storage.session.get(k))[k] as AppExtra | undefined;
  const got = await read();
  if (got) return got;
  await steamGame(appid);
  return (await read()) ?? { reqs: null, dlc: [] };
}

/** Procesador y memoria con chrome.system (una vez por semana); la gráfica la manda la página, que tiene WebGL. */
async function readPc(gpu?: string, force = false): Promise<PcAuto> {
  const cur = (await browser.storage.local.get('pcAuto')).pcAuto as PcAuto | undefined;
  let next: PcAuto = cur ?? { cpu: '', threads: 0, ramGB: null, gpu: '', at: 0 };
  let changed = false;
  if (force || !cur || Date.now() - cur.at > 7 * 86_400_000) {
    const sys = (browser as any).system;
    try {
      const c = await sys?.cpu?.getInfo();
      if (c) next = { ...next, cpu: String(c.modelName ?? '').replace(/\s+/g, ' ').trim(), threads: Number(c.numOfProcessors) || 0 };
    } catch { /* Firefox no tiene chrome.system */ }
    try {
      const m = await sys?.memory?.getInfo();
      if (m?.capacity) next = { ...next, ramGB: ramFromBytes(m.capacity) };
    } catch { /* idem */ }
    if (!next.threads) next = { ...next, threads: navigator.hardwareConcurrency || 0 };
    next = { ...next, at: Date.now() };
    changed = true;
  }
  // Una gráfica por software (aceleración apagada) no pisa a una de verdad ya leída.
  if (gpu && gpu !== next.gpu && (!softwareGpu(gpu) || !next.gpu || force)) { next = { ...next, gpu }; changed = true; }
  if (changed) await browser.storage.local.set({ pcAuto: next });
  return next;
}

const pcManual = async () => ((await browser.storage.local.get('pcManual')).pcManual as PcManual | undefined) ?? {};

/** C: del nombre visto en una página al appid de Steam, solo si el nombre coincide exacto. */
async function findAppid(name: string): Promise<number | null> {
  const r = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&cc=do&l=english`);
  const d = await r.json();
  const hit = (d.items ?? []).find((it: any) => it.type === 'app' && sameGame(it.name, name));
  return hit ? Number(hit.id) : null;
}

/** 7: buscador de la ventana y del panel. */
async function searchSteam(q: string): Promise<SearchHit[]> {
  const r = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&cc=do&l=english`);
  const d = await r.json();
  return (d.items ?? []).filter((it: any) => it.type === 'app').slice(0, 6).map((it: any): SearchHit => ({
    appid: Number(it.id),
    name: String(it.name),
    img: String(it.tiny_image ?? ''),
    steamUSD: it.price?.currency === 'USD' ? it.price.final / 100 : null,
  }));
}

/* ---------- comparar ---------- */

// 1: una búsqueda en marcha por juego; quien llegue después (la ventana mientras la franja carga) se engancha a ella.
const live = new Map<string, { last?: Part; listeners: Set<(p: Part) => void>; done: Promise<Cached> }>();

function editionGame(g: Game, ed: Edition): Game {
  const disc = ed.steamUSD != null && ed.steamInitialUSD ? Math.round((1 - ed.steamUSD / ed.steamInitialUSD) * 100) : 0;
  return { ...g, name: ed.name, steamUSD: ed.steamUSD, steamInitialUSD: ed.steamInitialUSD, steamDiscount: disc, isDlc: false };
}

async function loadRaw(appid: number, fresh: boolean, ed?: Edition, onPart?: (p: Part) => void): Promise<Cached> {
  const key = ed ? `cmp:${appid}:ed:${norm(ed.name)}` : `cmp:${appid}`;
  const running = live.get(key);
  if (running) {
    if (onPart) { running.listeners.add(onPart); if (running.last) onPart(running.last); }
    try { return await running.done; } finally { if (onPart) running.listeners.delete(onPart); }
  }
  if (!fresh) {
    const c = (await browser.storage.session.get(key))[key] as Cached | undefined;
    if (c && Date.now() - c.at <= TTL) return c;
  }
  const entry: { last?: Part; listeners: Set<(p: Part) => void>; done: Promise<Cached> } = { listeners: new Set(onPart ? [onPart] : []), done: null as any };
  const emit = (p: Part) => { entry.last = p; for (const l of entry.listeners) l(p); };
  entry.done = (async () => {
    const s = await getSettings();
    let game = await steamGame(appid);
    if (ed) game = editionGame(game, ed);
    else if (await hasTwin(game.name, appid)) game = { ...game, twin: true };
    if (game.isFree) return { game, raw: [], failed: [], at: Date.now() };
    emit({ game, raw: [], failed: [], at: Date.now(), pending: [...STORE_IDS] });
    const { raw, failed } = await gather(game.name, SEARCHERS, s.country, (p) => emit({ game, ...p, at: Date.now() }));
    const c: Cached = { game, raw, failed, at: Date.now() };
    if (failed.length < STORE_IDS.length) await browser.storage.session.set({ [key]: c });
    return c;
  })();
  live.set(key, entry);
  try { return await entry.done; } finally { live.delete(key); }
}

/**
 * Otro juego de Steam con exactamente el mismo nombre («Hollow» de 2017 y «Hollow» de 2026). Las tiendas solo dan el
 * nombre, así que no se puede saber de cuál es la clave: sus ofertas pasan a dudosas y nunca salen como mejor precio.
 */
const twins = new Map<string, Promise<boolean>>();
function hasTwin(name: string, appid: number): Promise<boolean> {
  const k = `${appid}|${norm(name)}`;
  if (!twins.has(k)) {
    twins.set(k, (async () => {
      // La búsqueda normal de Steam (no storesearch, que ordena por popularidad y se salta los nombres iguales).
      const r = await fetch(`https://store.steampowered.com/search/results/?term=${encodeURIComponent(name)}&json=1&category1=998&cc=do&l=english&count=25`);
      const d = await r.json();
      return (d.items ?? []).some((it: any) => {
        const id = Number(String(it.logo ?? '').match(/\/apps\/(\d+)\//)?.[1]);
        return id && id !== appid && norm(String(it.name)) === norm(name);
      });
    })().catch(() => false));
  }
  return twins.get(k)!;
}

const TWIN_TEXT = 'Hay otro juego con este nombre';
const TWIN_WHY = 'Steam tiene más de un juego que se llama igual y la tienda no dice cuál vende. Comprueba en la tienda que es este (año y portada) antes de comprar.';

const within = <T,>(p: Promise<T>, ms: number, def: T) => Promise.race([p, new Promise<T>((r) => setTimeout(() => r(def), ms))]);

async function compareApp(appid: number, fresh: boolean, opts: { edition?: Edition; onPart?: (c: Compare) => void } = {}): Promise<Compare> {
  const ed = opts.edition;
  const [s, rates0, coupons, user, learned, hist0] = await Promise.all([getSettings(), getRates(), getCoupons(), getUser(), getLearned(), getHistory(appid)]);
  const rates = withFx(rates0, s.fxPct);
  const { table, checked } = mergeFees(learned, s.pay);
  // 2: el mínimo histórico se pide a la vez que las tiendas y no las retrasa más de 3 s.
  const lowP = ed ? Promise.resolve(null) : getLow(appid).catch(() => null);
  const owned = user.owned.includes(appid);
  const build = (c: Cached, pending: StoreId[], history = hist0, v: Verdict = { kind: 'none', title: '', detail: '' }, low: HistLow | null = null): Compare => ({
    game: c.game,
    offers: rank(c.game, c.raw, rates, s, coupons, table).map((o) => (c.game.twin && o.fit === 'ok' ? { ...o, fit: 'warn' as const, fitText: TWIN_TEXT, fitWhy: TWIN_WHY } : o)),
    failed: c.failed, rates, pay: s.pay, at: c.at, history,
    verdict: v, owned,
    ownsBase: c.game.isDlc && c.game.baseAppid && user.at ? user.owned.includes(c.game.baseAppid) : null,
    pending, low, feesChecked: checked, edition: ed?.label,
  });
  const c = await loadRaw(appid, fresh, ed, opts.onPart ? (p) => opts.onPart!(build(p, p.pending)) : undefined);
  const first = build(c, []);
  const top = first.offers.find((o) => o.fit === 'ok');
  const best = top ? Math.min(top.totalUSD, c.game.steamUSD ?? Infinity) : c.game.steamUSD;
  if (ed) {
    return { ...first, verdict: { kind: 'none', title: 'Otra edición', detail: 'El historial y el veredicto son de la edición estándar.' } };
  }
  let history = hist0;
  if (!c.game.isFree) {
    history = addPoint(history, { t: Date.now(), steam: c.game.steamUSD, best: top?.totalUSD ?? null, store: top?.store });
    await setHistory(appid, history);
  }
  const lc = await within(lowP, 3000, null);
  const low = lc ? toLow(lc, c.game.steamInitialUSD) : null;
  return { ...first, history, low, verdict: verdict(history, best ?? null, c.game.steamDiscount ?? 0, Date.now(), low) };
}

async function setBadge(tabId: number | undefined, c: Compare) {
  if (tabId == null) return;
  const save = savings(c);
  await browser.action.setBadgeText({ tabId, text: save ? `-${save.pct}%` : '' });
  if (save) await browser.action.setBadgeBackgroundColor({ tabId, color: '#45d69b' });
}

/* ---------- Q y E: leer tu cuenta de Steam ---------- */

const EVERY = 10 * 60 * 1000;
let reading: Promise<SteamStatus> | null = null;

/**
 * Lee la lista de deseos y la biblioteca. La sesión llega de una página de Steam abierta (con su token) o, si no hay
 * ninguna, se pide /about/ con tus cookies. El token se guarda solo en memoria (storage.session), nunca en disco.
 */
function syncSteam(force: boolean, fromPage?: SteamSession): Promise<SteamStatus> {
  reading ??= (async () => {
    const last = await getSteamStatus();
    if (fromPage?.loggedIn && fromPage.token) await browser.storage.session.set({ steamSess: fromPage });
    if (!force && last?.status === 'ok' && Date.now() - last.at < EVERY) return last;
    let s = fromPage;
    if (!s?.loggedIn) {
      try {
        const html = await (await fetch('https://store.steampowered.com/about/', { credentials: 'include', cache: 'no-store' })).text();
        s = sessionFromHtml(html);
      } catch { /* sin conexión: se prueba con la sesión guardada */ }
    }
    if (!s?.loggedIn) {
      const saved = (await browser.storage.session.get('steamSess')).steamSess as SteamSession | undefined;
      if (saved?.loggedIn) s = saved;
    }
    // Guarda también la sesión que llega de /about/ (con tus cookies): el reembolso y las horas la necesitan.
    if (s?.loggedIn && s.token) await browser.storage.session.set({ steamSess: s });
    const r = await readSteamUser(s ?? { loggedIn: false });
    let st: SteamStatus;
    if (r.status === 'ok' && (r.wishlist.length || r.owned.length)) {
      await syncUser({ wishlist: r.wishlist, owned: r.owned, at: Date.now() });
      st = { status: 'ok', at: Date.now(), source: r.source, wishlist: r.wishlist.length, owned: r.owned.length };
    } else if (r.status === 'ok') {
      // Steam no devolvió nada: no se borra lo que hubiera guardado.
      st = { status: 'empty', at: Date.now(), source: r.source };
    } else {
      st = { status: r.status, at: Date.now(), error: r.error };
    }
    await setSteamStatus(st);
    return st;
  })().finally(() => { reading = null; });
  return reading;
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
  await fillNames(Object.keys(next).map(Number));
}

/** Los nombres que falten se piden a Steam de una vez, para que ningún juego salga como «App 123». */
async function fillNames(appids: number[]) {
  const names = await getNames();
  const missing = appids.filter((id) => !names[id]);
  if (!missing.length) return;
  const got = await fetchNames(missing);
  if (Object.keys(got).length) await setNames({ ...(await getNames()), ...got });
}

let checking: Promise<void> | null = null;
/** Revisa la lista de deseos. Si ya hay una revisión en marcha, espera a esa en vez de empezar otra. */
function checkWishlist(limit = 12): Promise<void> {
  checking ??= runCheck(limit).finally(() => { checking = null; });
  return checking;
}

/** Una escritura de la lista detrás de otra, para que dos búsquedas a la vez no se pisen. */
let wishWrite: Promise<unknown> = Promise.resolve();

/**
 * 9: precio de un juego que se ve en la lista de deseos de Steam y aún no se había revisado. Si está en tu lista,
 * se guarda como una revisión más (sin avisos: esos los da la revisión periódica).
 */
async function badgeFor(appid: number) {
  const c = await compareApp(appid, false);
  // Gratis, ya tuyo o con otro juego del mismo nombre (no se sabe de cuál es la oferta): sin píldora.
  if (c.game.isFree || c.owned || c.game.twin) return null;
  const top = c.offers.find((o) => o.fit === 'ok');
  const badge: Badge = { best: top?.totalUSD ?? null, store: top?.store ?? null, url: top?.url ?? null, steamUSD: c.game.steamUSD, at: Date.now() };
  wishWrite = wishWrite.then(async () => {
    const wish = await getWish();
    const cur = wish[appid];
    if (!cur) {
      // 1: juegos que no están en tu lista: se recuerdan un día, para no volver a buscarlos en cada página de Steam.
      const cache = ((await browser.storage.local.get('badgeCache')).badgeCache ?? {}) as Record<number, Badge>;
      cache[appid] = badge;
      const keep = Object.entries(cache).filter(([, b]) => Date.now() - b.at < BADGE_TTL).sort((a, b) => b[1].at - a[1].at).slice(0, 1500);
      await browser.storage.local.set({ badgeCache: Object.fromEntries(keep) });
      return;
    }
    wish[appid] = { ...cur, name: c.game.name, lastBest: top?.totalUSD, lastStore: top?.store, lastUrl: top?.url, steamUSD: c.game.steamUSD, steamInitialUSD: c.game.steamInitialUSD, steamDiscount: c.game.steamDiscount, checkedAt: Date.now() };
    await setWish(wish);
  }).catch(() => {});
  await wishWrite;
  return badge;
}
type Badge = { best: number | null; store: StoreId | null; url: string | null; steamUSD: number | null; at: number };
const BADGE_TTL = 24 * 3_600_000;

async function runCheck(limit: number) {
  const [wish, s, user] = await Promise.all([getWish(), getSettings(), getUser()]);
  const items = Object.values(wish).map((w) => ({ ...w }))
    .filter((w) => !user.owned.includes(w.appid))
    .sort((a, b) => (b.target != null ? 1 : 0) - (a.target != null ? 1 : 0) || (a.checkedAt ?? 0) - (b.checkedAt ?? 0))
    .slice(0, limit);
  await browser.storage.session.set({ wishCheck: { done: 0, total: items.length } });
  let done = 0;
  const found: Found[] = [];
  for (const w of items) {
    try {
      const c = await compareApp(w.appid, true);
      const top = c.offers.find((o) => o.fit === 'ok');
      const save = savings(c);
      const prev = w.checkedAt ? (w.lastBest != null && (w.steamUSD == null || w.lastBest < w.steamUSD) ? w.lastBest : w.steamUSD ?? null) : null;
      Object.assign(w, { name: c.game.name, lastBest: top?.totalUSD, lastStore: top?.store, lastUrl: top?.url, steamUSD: c.game.steamUSD, steamInitialUSD: c.game.steamInitialUSD, steamDiscount: c.game.steamDiscount, checkedAt: Date.now() });
      // 8: el límite vale para lo más barato de hoy, sea una tienda o Steam (en rebajas, Steam puede bajar de él).
      const steamWins = c.game.steamUSD != null && (!top || c.game.steamUSD <= top.totalUSD);
      const price = steamWins ? c.game.steamUSD : top?.totalUSD ?? null;
      const hitTarget = price != null && w.target != null && price <= w.target;
      // El aviso general solo salta si el juego bajó de verdad desde la revisión anterior (un 5 % o más), no por estar
      // ya rebajado: en las tiendas de claves muchos juegos están a −60 % todo el año.
      const fell = prev != null && price != null && price < prev * 0.95;
      const hitDrop = !!top && !steamWins && s.dropAlerts && !!save && save.pct >= s.dropPct && fell;
      const newLow = price != null && (w.notifiedPrice == null || price < w.notifiedPrice - 0.01);
      if ((hitTarget || hitDrop) && newLow && price != null) {
        found.push({ appid: w.appid, name: c.game.name, price, store: steamWins ? 'steam' : top!.store, pct: save?.pct ?? 0, target: hitTarget ? w.target : undefined });
        w.notifiedAt = Date.now();
        w.notifiedPrice = price;
      }
    } catch { /* se reintenta en la siguiente vuelta */ }
    // Se vuelve a leer y solo se tocan los datos de la revisión: un límite puesto mientras tanto se respeta.
    wishWrite = wishWrite.then(async () => {
      const fresh = await getWish();
      const cur = fresh[w.appid];
      if (!cur) return;
      const notifiedNow = w.notifiedAt != null && w.notifiedAt !== cur.notifiedAt;
      fresh[w.appid] = {
        ...cur,
        name: w.name, lastBest: w.lastBest, lastStore: w.lastStore, lastUrl: w.lastUrl, steamUSD: w.steamUSD, steamInitialUSD: w.steamInitialUSD, steamDiscount: w.steamDiscount, checkedAt: w.checkedAt,
        ...(notifiedNow ? { notifiedAt: w.notifiedAt, notifiedPrice: w.notifiedPrice } : {}),
      };
      await setWish(fresh);
    }).catch(() => {});
    await wishWrite;
    await browser.storage.session.set({ wishCheck: { done: ++done, total: items.length } });
  }
  await browser.storage.session.remove('wishCheck');
  await notifyFound(found, s);
}

/** Un juego que bajó, para el aviso. */
type Found = { appid: number; name: string; price: number; store: StoreId | 'steam'; pct: number; target?: number };
const HOUR = 3_600_000;
const MUTE_BUTTON = { title: 'Silenciar 1 día' };
const muted = (s: { mutedUntil: number }) => s.mutedUntil > Date.now();

/**
 * Un solo aviso por revisión. Los límites que pusiste avisan al momento; las bajadas generales esperan en una cola y
 * salen como mucho una vez cada alertEvery horas. Con los avisos silenciados, lo que llega se descarta.
 */
async function notifyFound(found: Found[], s: Awaited<ReturnType<typeof getSettings>>) {
  const st = await browser.storage.local.get(['alertQueue', 'alertLast']);
  const queue = { ...((st.alertQueue as Record<number, Found> | undefined) ?? {}) };
  for (const f of found) queue[f.appid] = f;
  const list = Object.values(queue);
  if (muted(s)) { if (list.length) await browser.storage.local.set({ alertQueue: {} }); return; }
  if (!list.length) return;
  const now = Date.now();
  const urgent = list.some((f) => f.target != null);
  if (!urgent && now - ((st.alertLast as number | undefined) ?? 0) < s.alertEvery * HOUR) {
    await browser.storage.local.set({ alertQueue: queue });
    return;
  }
  const where = (f: Found) => (f.store === 'steam' ? 'Steam' : STORES[f.store].name);
  if (list.length === 1) {
    const f = list[0];
    await browser.notifications.create(`wish:${f.appid}${f.store === 'steam' ? ':steam' : ''}`, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title: `${f.name} bajó a $${f.price.toFixed(2)}`,
      message: `En ${where(f)}${f.store === 'steam' ? '' : ' · activa en RD'} · ${f.target != null ? `tu límite era $${f.target.toFixed(2)}` : `−${f.pct}% frente a Steam`}`,
      buttons: [{ title: f.store === 'steam' ? 'Ver en Steam' : 'Ver oferta' }, MUTE_BUTTON],
    });
  } else {
    // Primero los que llegaron a tu límite; luego los de más descuento.
    list.sort((a, b) => (a.target != null ? 0 : 1) - (b.target != null ? 0 : 1) || b.pct - a.pct);
    const shown = list.slice(0, 3).map((f) => `${f.name} $${f.price.toFixed(2)}${f.target != null ? ' (tu límite)' : f.pct ? ` (−${f.pct}%)` : ''}`);
    await browser.notifications.create('drops', {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title: `${list.length} juegos de tu lista bajaron`,
      message: shown.join(', ') + (list.length > 3 ? ` y ${list.length - 3} más.` : '.'),
      buttons: [{ title: 'Ver la lista' }, MUTE_BUTTON],
    });
  }
  await browser.storage.local.set({ alertQueue: {}, alertLast: now });
}

async function openNotification(nid: string) {
  if (nid === 'drops' || nid === 'sale-live') {
    await browser.tabs.create({ url: browser.runtime.getURL('/wishlist.html' as any) });
  } else if (nid === 'free') {
    const list = ((await browser.storage.session.get('freeGames')).freeGames ?? []) as FreeGame[];
    const wish = list.filter((g) => g.inWishlist);
    for (const g of (wish.length ? wish : list).slice(0, 3)) await browser.tabs.create({ url: g.url });
  } else if (nid.startsWith('refund:')) {
    await browser.tabs.create({ url: 'https://help.steampowered.com/es/wizard/HelpWithPurchase' });
  } else if (nid === 'sale') {
    await browser.tabs.create({ url: browser.runtime.getURL('/wishlist.html?f=wait' as any) });
  } else if (nid.startsWith('wish:')) {
    const [id, where] = nid.slice(5).split(':');
    const w = (await getWish())[Number(id)];
    const steam = `https://store.steampowered.com/app/${id}/`;
    await browser.tabs.create({ url: where === 'steam' ? steam : w?.lastUrl ?? steam });
  } else return;
  await browser.notifications.clear(nid);
}

/** 6: la lista completa para la página de la lista de deseos, con lo que hace falta para filtrar y ordenar. */
async function wishlistFull() {
  await fillNames(Object.keys(await getWish()).map(Number)).catch(() => {});
  const [wish, user, names, s, rates] = await Promise.all([getWish(), getUser(), getNames(), getSettings(), getRates()]);
  const now = Date.now();
  const items = await Promise.all(Object.values(wish).filter((w) => !user.owned.includes(w.appid)).map(async (w) => {
    const [hist, lc] = await Promise.all([getHistory(w.appid), getLow(w.appid, { fetch: false })]);
    // Mejor precio de hace unos días (el punto más reciente con al menos 5 días), para «bajaron esta semana».
    const old = [...hist].reverse().find((p) => now - p.t >= 5 * 86_400_000 && now - p.t <= 14 * 86_400_000 && p.best != null);
    const low = lc ? toLow(lc, w.steamInitialUSD) : null;
    return { ...w, name: w.name ?? names[w.appid], before: old?.best ?? null, low, wait: waitWorth(w, low) };
  }));
  const run = (await browser.storage.session.get('wishCheck')).wishCheck ?? null;
  return { items, user, rates: withFx(rates, s.fxPct), sale: nextSale(now), run };
}

/* ---------- 11: aviso antes de las grandes rebajas ---------- */

async function checkSale() {
  const now = Date.now();
  const sale = nextSale(now);
  if (muted(await getSettings())) return;
  // Cuando empiezan: un aviso el primer o segundo día, y una revisión de la lista para que los precios estén al día.
  if (sale.live) {
    const tagLive = `${sale.name}-${new Date(sale.start).getFullYear()}-live`;
    if (now - sale.start > 2 * 86_400_000 || (await browser.storage.local.get('saleNotified')).saleNotified === tagLive) return;
    await browser.storage.local.set({ saleNotified: tagLive });
    void checkWishlist(40).catch(() => {});
    await browser.notifications.create('sale-live', {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title: `Empezaron las ${sale.name.replace(/^Rebajas/, 'rebajas')}`,
      message: `${sale.endsIn === 1 ? 'Terminan mañana' : `Terminan en ${sale.endsIn} días`}. Las tiendas de claves también bajan estos días: estamos revisando tu lista para ver dónde sale más barato cada juego.`,
      buttons: [{ title: 'Ver la lista' }, MUTE_BUTTON],
    });
    return;
  }
  if (sale.days < 1 || sale.days > 7) return;
  const tag = `${sale.name}-${new Date(sale.start).getFullYear()}`;
  if ((await browser.storage.local.get('saleNotified')).saleNotified === tag) return;
  const [wish, user, names] = await Promise.all([getWish(), getUser(), getNames()]);
  const waits: { name: string; pct: number }[] = [];
  for (const w of Object.values(wish)) {
    if (user.owned.includes(w.appid)) continue;
    const lc = await getLow(w.appid, { fetch: false });
    const low = lc ? toLow(lc, w.steamInitialUSD) : null;
    if (low && waitWorth(w, low)) waits.push({ name: w.name ?? names[w.appid] ?? `App ${w.appid}`, pct: low.pct });
  }
  // Las de otoño (Black Friday) se avisan aunque no haya juegos con un mínimo guardado: es cuando más baja todo.
  if (!waits.length && !sale.bf) return;
  waits.sort((a, b) => b.pct - a.pct);
  const list = waits.slice(0, 3).map((x) => `${x.name} (−${x.pct}%)`).join(', ');
  const n = waits.length;
  await browser.notifications.create('sale', {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title: `${sale.name} en ${sale.days} ${sale.days === 1 ? 'día' : 'días'}`,
    message: n
      ? `${n === 1 ? 'Un juego de tu lista llegó a estar bastante más barato' : `${n} juegos de tu lista llegaron a estar bastante más baratos`} que hoy: ${list}${n > 3 ? '…' : ''}. Mejor espera.`
      : 'Steam y las tiendas de claves bajan precios esa semana. Si no te corre prisa, espera para comprar.',
    buttons: [{ title: 'Ver la lista' }, MUTE_BUTTON],
  });
  await browser.storage.local.set({ saleNotified: tag });
}

/* ---------- O: ahorro y 3: comisiones reales ---------- */

async function logClick(e: Omit<LedgerEntry, 'id' | 'at' | 'state'>) {
  const l = await getLedger();
  // Un clic repetido al mismo juego en la misma hora no cuenta dos veces.
  const dup = l.find((x) => x.appid === e.appid && x.state === 'pending' && Date.now() - x.at < 3_600_000);
  if (dup) Object.assign(dup, e, { at: Date.now() });
  else l.unshift({ ...e, id: crypto.randomUUID(), at: Date.now(), state: 'pending' });
  await setLedger(l.slice(0, 200));
}

async function confirmPurchase(id: string, state: LedgerEntry['state'], paid?: number, paidCur: 'USD' | 'EUR' = 'USD') {
  const l = await getLedger();
  const e = l.find((x) => x.id === id);
  if (!e) return l;
  e.state = state;
  if (state === 'bought' && paid != null && paid > 0) {
    // Todo se pasa a dólares: el precio sin comisión va en la moneda de la tienda y el total en la que diga el usuario.
    const rates = await getRates();
    const toUSD = (n: number, cur: 'USD' | 'EUR' | undefined) => (cur === 'EUR' ? n / rates.EUR : n);
    e.paidUSD = round2(toUSD(paid, paidCur));
    e.paidConfirmed = true;
    const netUSD = e.net != null ? round2(toUSD(e.net, e.currency)) : null;
    if (netUSD != null && e.pay && plausible(netUSD, e.paidUSD)) {
      const learned = await getLearned();
      const per = (learned[e.store] ??= {});
      const list = (per[e.pay] ??= []);
      list.push({ net: netUSD, fee: round2(e.paidUSD - netUSD), at: Date.now() });
      per[e.pay] = list.slice(-6);
      await setLearned(learned);
    }
  }
  await setLedger(l);
  return l;
}

/* ---------- 9: packs de Steam frente a claves sueltas ---------- */

async function mapLimit<T, R>(list: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) { const k = i++; out[k] = await fn(list[k]); }
  }));
  return out;
}

async function bundle(appids: number[]) {
  const user = await getUser();
  const items = await mapLimit(appids.slice(0, 25), 3, async (appid): Promise<BundleItem> => {
    const owned = user.owned.includes(appid);
    try {
      const c = await compareApp(appid, false);
      const top = c.offers.find((o) => o.fit === 'ok');
      const steam = c.game.steamUSD;
      const url = `https://store.steampowered.com/app/${appid}/`;
      if (top && (steam == null || top.totalUSD < steam)) return { appid, name: c.game.name, owned, store: top.store, priceUSD: top.totalUSD, url: top.url };
      return { appid, name: c.game.name, owned, store: steam != null ? 'steam' : null, priceUSD: steam, url };
    } catch {
      return { appid, name: (await getNames())[appid] ?? `App ${appid}`, owned, store: null, priceUSD: null, url: `https://store.steampowered.com/app/${appid}/` };
    }
  });
  const s = await getSettings();
  return { items, rates: withFx(await getRates(), s.fxPct), omitted: Math.max(0, appids.length - 25) };
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
      excludeMatches: ['https://store.steampowered.com/*', 'https://*.eneba.com/*', 'https://*.instant-gaming.com/*', 'https://*.kinguin.net/*', 'https://*.driffle.com/*', 'https://driffle.com/*'],
      runAt: 'document_idle',
      persistAcrossSessions: true,
    }]);
  } else if ((!s.detectAnywhere || !has) && reg.length) {
    await browser.scripting.unregisterContentScripts({ ids: [DETECT_ID] });
  }
}

/* ---------- 6: reembolso ---------- */

/** La consulta con el token de la sesión de Steam, si la hay guardada (solo en memoria). */
async function steamSessionQ(): Promise<string | null> {
  const saved = (await browser.storage.session.get('steamSess')).steamSess as SteamSession | undefined;
  return saved?.loggedIn && saved.token && saved.steamid ? `access_token=${encodeURIComponent(saved.token)}&steamid=${saved.steamid}` : null;
}

/**
 * 6: compras recientes de Steam (< 14 días) con menos de 2 h jugadas → una notificación por compra. El historial se
 * lee con la sesión de store.steampowered.com y las horas, de IPlayerService/GetOwnedGames. No avisa dos veces de la
 * misma compra. Si Steam cambia su maqueta o no hay sesión, no hace nada.
 */
async function checkRefunds() {
  if (muted(await getSettings())) return;
  const st = await syncSteam(false);
  if (st.status !== 'ok') return;
  let html: string;
  try {
    html = await (await fetch('https://store.steampowered.com/account/history/', { credentials: 'include', cache: 'no-store' })).text();
  } catch { return; }
  const purchases = parseHistory(html).filter((p) => p.type === 'Purchase');
  if (!purchases.length) return;
  const now = Date.now();
  const q = await steamSessionQ();
  const owned: { appid: number; playtime: number }[] = [];
  if (q) {
    try {
      const o = await (await fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?${q}&include_played_free_games=true`)).json();
      owned.push(...(o?.response?.games ?? []).map((g: any) => ({ appid: Number(g.appid), playtime: Number(g.playtime_forever ?? 0) })));
    } catch { /* sin horas: cuenta como «sin jugar» */ }
  }
  const notified = ((await browser.storage.local.get('refundNotified')).refundNotified ?? {}) as Record<string, number>;
  for (const p of purchases) {
    if (now - p.date > REFUND_DAYS * 86_400_000) continue;
    const key = `${p.name}|${p.date}`;
    if (notified[key]) continue;
    // Sin appid no se pueden saber las horas jugadas: mejor no avisar que avisar con un dato inventado.
    const appid = await findAppid(p.name).catch(() => null);
    if (appid == null) continue;
    const g = owned.find((x) => x.appid === appid);
    if (!g || !refundable(p.date, g.playtime, now)) continue;
    notified[key] = now;
    await browser.notifications.create(`refund:${key}`, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title: `${p.name}: aún puedes pedir reembolso`,
      message: g.playtime === 0 ? 'Lo compraste hace menos de 14 días y apenas lo has jugado. Steam reembolsa las compras con menos de 2 h de juego.' : `Lo compraste hace menos de 14 días y llevas ${g.playtime} min jugados. Steam reembolsa las compras con menos de 2 h de juego.`,
      buttons: [{ title: 'Solicitar reembolso' }, MUTE_BUTTON],
    });
  }
  await browser.storage.local.set({ refundNotified: notified });
}

/* ---------- 7: juegos gratis ---------- */

/** Los gratis de ahora: Epic (el de la semana) y Steam (para quedártelos). Marcados si están en tu lista. */
async function freeGames(): Promise<FreeGame[]> {
  const [epic, steam, wish, user] = await Promise.all([
    fetch('https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=es-ES&country=DO').then((r) => r.json()).catch(() => null),
    fetch('https://store.steampowered.com/search/results/?maxprice=free&specials=1&json=1&cc=do&l=english').then((r) => r.json()).catch(() => null),
    getWish(),
    getUser(),
  ]);
  // Si las dos caen, que la ventana lo diga en vez de enseñar «Nada gratis ahora».
  if (epic == null && steam == null) throw new Error('Epic y Steam no respondieron');
  const list = [...(epic ? parseEpic(epic) : []), ...(steam ? parseSteamFree(steam) : [])];
  const ownedSet = new Set(user.owned);
  for (const g of list) g.inWishlist = g.appid != null && !!wish[g.appid] && !ownedSet.has(g.appid);
  await browser.storage.session.set({ freeGames: list });
  return list;
}

/** 7: si alguno de los gratis está en tu lista de deseos, un aviso (una vez por juego y por tanda). */
async function checkFree() {
  if (muted(await getSettings())) return;
  const list = await freeGames().catch(() => [] as FreeGame[]);
  const inWish = list.filter((g) => g.inWishlist);
  if (!inWish.length) return;
  const seen = ((await browser.storage.local.get('freeNotified')).freeNotified ?? {}) as Record<string, number>;
  const fresh = inWish.filter((g) => !seen[g.url]);
  if (!fresh.length) return;
  const names = fresh.slice(0, 3).map((g) => g.name).join(', ') + (fresh.length > 3 ? ` y ${fresh.length - 3} más` : '');
  const one = fresh.length === 1;
  await browser.notifications.create('free', {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title: one ? `${fresh[0].name} está gratis` : `${fresh.length} juegos de tu lista están gratis`,
    message: one ? `En ${fresh[0].store === 'epic' ? 'Epic (esta semana)' : 'Steam (para siempre)'}. Entra y quédatelo.` : `${names}. Entra y quédatelos.`,
    buttons: [{ title: 'Ver juegos gratis' }, MUTE_BUTTON],
  });
  for (const g of fresh) seen[g.url] = Date.now();
  await browser.storage.local.set({ freeNotified: seen });
}

/* ---------- mensajes ---------- */

async function handle(msg: any, sender: any): Promise<unknown> {
  switch (msg?.type) {
    case 'compare': {
      const c = await compareApp(Number(msg.appid), !!msg.fresh, { edition: msg.edition });
      if (!msg.edition) await setBadge(sender.tab?.id, c).catch(() => {});
      return c;
    }
    case 'detect': {
      const appid = await findAppid(String(msg.name));
      if (!appid) return null;
      if (sender.tab?.id != null) await browser.storage.session.set({ [`det:${sender.tab.id}`]: appid });
      return compareApp(appid, false);
    }
    case 'canRun': {
      const [auto, manual, reqs] = await Promise.all([readPc(msg.gpu ? String(msg.gpu).slice(0, 120) : undefined), pcManual(), steamApp(Number(msg.appid))]);
      return canRun(effectiveSpecs(auto, manual), reqs.reqs);
    }
    case 'dlcList': {
      // 9: los DLC del juego, con su precio en Steam y si ya los tienes (solo si la biblioteca vino con los DLC).
      const info = await steamApp(Number(msg.appid));
      if (!info.dlc.length) return { items: [], total: 0, ownedKnown: false };
      const [list, user, status] = await Promise.all([fetchDlcs(info.dlc), getUser(), getSteamStatus()]);
      const ownedKnown = user.at > 0 && !!status && !String(status.source ?? '').includes('GetOwnedGames');
      const own = new Set(user.owned);
      const items = list.map((d) => ({ ...d, owned: ownedKnown && own.has(d.appid) }))
        .sort((a, b) => Number(a.soon) - Number(b.soon) || Number(a.owned) - Number(b.owned) || (b.steamUSD ?? -1) - (a.steamUSD ?? -1));
      return { items, total: info.dlc.length, ownedKnown };
    }
    case 'dlcPrice': {
      const c = await compareApp(Number(msg.appid), false);
      const top = c.offers.find((o) => o.fit === 'ok');
      return { steamUSD: c.game.steamUSD, best: top ? { store: top.store, totalUSD: top.totalUSD, url: top.url } : null };
    }
    case 'seller': {
      // 10: quién vende la oferta más barata de Kinguin (la búsqueda no lo dice; la página del producto sí).
      const url = String(msg.url ?? '');
      if (!/^https:\/\/www\.kinguin\.net\/category\/\d+/.test(url)) return null;
      const k = `seller:${url}`;
      const got = (await browser.storage.local.get(k))[k] as { at: number; note: SellerNote | null } | undefined;
      if (got && Date.now() - got.at < 24 * 3_600_000) return got.note;
      const r = await fetch(url);
      if (!r.ok) return null;
      const note = parseKinguinSeller(await r.text(), msg.cents != null ? Number(msg.cents) : undefined);
      await browser.storage.local.set({ [k]: { at: Date.now(), note } });
      return note;
    }
    case 'pcInfo': return { auto: await readPc(msg.gpu ? String(msg.gpu).slice(0, 120) : undefined, !!msg.force), manual: await pcManual() };
    case 'pcSet': {
      const m = msg.manual as PcManual;
      const clean: PcManual = {};
      if (m?.cpu?.trim()) clean.cpu = m.cpu.trim().slice(0, 120);
      if (m?.gpu?.trim()) clean.gpu = m.gpu.trim().slice(0, 120);
      if (m?.ramGB != null && Number(m.ramGB) > 0) clean.ramGB = Math.min(1024, Number(m.ramGB));
      await browser.storage.local.set({ pcManual: clean });
      return clean;
    }
    case 'search': return searchSteam(String(msg.q ?? '').slice(0, 80));
    case 'tabGame': {
      const m = String(msg.url ?? '').match(/^https:\/\/store\.steampowered\.com\/app\/(\d+)/);
      if (m) return Number(m[1]);
      const k = `det:${Number(msg.tabId)}`;
      return ((await browser.storage.session.get(k))[k] as number | undefined) ?? null;
    }
    case 'syncUser': return syncSteam(!!msg.force, msg.session);
    case 'userdata': await syncUser(msg.user); return true;
    case 'steamStatus': return getSteamStatus();
    case 'wishlist': {
      const [wish, user, names] = await Promise.all([getWish(), getUser(), getNames()]);
      return { items: Object.values(wish).map((w) => ({ ...w, name: w.name ?? names[w.appid] })), user };
    }
    case 'wishlistFull': return wishlistFull();
    case 'openWishlist': await browser.tabs.create({ url: browser.runtime.getURL('/wishlist.html' as any) }); return true;
    case 'setTargets': {
      // 13: muchos límites de una vez, en una sola escritura.
      await (wishWrite = wishWrite.then(async () => {
        const wish = await getWish();
        for (const [id, t] of Object.entries(msg.targets as Record<string, number | null>)) {
          const w: WishItem = wish[+id] ?? { appid: +id };
          w.target = t == null ? undefined : Number(t);
          w.notifiedPrice = undefined;
          wish[+id] = w;
        }
        await setWish(wish);
      }).catch(() => {}));
      return true;
    }
    case 'setTarget': {
      const wish = await getWish();
      const w: WishItem = wish[msg.appid] ?? { appid: msg.appid };
      w.target = msg.target == null ? undefined : Number(msg.target);
      if (msg.name && !w.name) w.name = String(msg.name);
      w.notifiedPrice = undefined;
      wish[msg.appid] = w;
      await setWish(wish);
      return true;
    }
    case 'wishBadges': {
      // 9: lo que ya se sabe de cada juego revisado, para la píldora de la lista de deseos de Steam.
      // 1: y lo que se buscó en el último día de juegos que no están en tu lista.
      const out: Record<number, Omit<Badge, 'at'>> = {};
      const cache = ((await browser.storage.local.get('badgeCache')).badgeCache ?? {}) as Record<number, Badge>;
      for (const [id, b] of Object.entries(cache)) if (Date.now() - b.at < BADGE_TTL) out[+id] = b;
      for (const w of Object.values(await getWish())) if (w.checkedAt) out[w.appid] = { best: w.lastBest ?? null, store: w.lastStore ?? null, url: w.lastUrl ?? null, steamUSD: w.steamUSD ?? null };
      return out;
    }
    case 'badgeFor': return badgeFor(Number(msg.appid));
    case 'getTarget': return (await getWish())[msg.appid]?.target ?? null;
    case 'checkWishlist': await checkWishlist(msg.all ? 500 : Number(msg.limit) || 12); return true;
    case 'click': await logClick(msg.entry); return true;
    case 'ledger': return getLedger();
    case 'ledgerSet': return confirmPurchase(String(msg.id), msg.state, msg.paid == null ? undefined : Number(msg.paid), msg.currency === 'EUR' ? 'EUR' : 'USD');
    case 'fees': {
      const s = await getSettings();
      const learned = await getLearned();
      return { ...mergeFees(learned, s.pay), learned, pay: s.pay };
    }
    case 'feesReset': {
      const learned = await getLearned();
      delete learned[msg.store as StoreId];
      await setLearned(learned);
      return true;
    }
    case 'cart': {
      const s = await getSettings();
      const { table } = mergeFees(await getLearned(), s.pay);
      const items: CartItem[] = [];
      for (const appid of (msg.appids as number[]).slice(0, 8)) {
        try {
          const c = await compareApp(appid, false);
          items.push({ appid, name: c.game.name, steamUSD: c.game.steamUSD, offers: c.offers });
        } catch { /* juego que Steam no devuelve: se salta */ }
      }
      return { plan: planCart(items, s.pay, table), rates: withFx(await getRates(), s.fxPct), omitted: Math.max(0, (msg.appids as number[]).length - 8) };
    }
    case 'bundle': return bundle((msg.appids as number[]).map(Number).filter(Boolean));
    case 'syncDetection': await syncDetection(); return true;
    case 'refunds': await checkRefunds(); return true;
    case 'freeGames': return freeGames();
    case 'options':
      // 4: «Tu PC» abre Ajustes en su sección.
      if (msg.hash === 'pc') await browser.tabs.create({ url: browser.runtime.getURL('/options.html#pc' as any) });
      else await browser.runtime.openOptionsPage();
      return true;
  }
  return undefined;
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: any, sender, sendResponse) => {
    handle(msg, sender).then((data) => sendResponse({ ok: true, data }), (e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
    return true;
  });

  // 1: la comparación por partes va por un puerto: cada tienda llega en cuanto responde.
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== 'compare') return;
    let closed = false;
    port.onDisconnect.addListener(() => { closed = true; });
    port.onMessage.addListener(async (m: any) => {
      const send = (x: unknown) => { if (!closed) try { port.postMessage(x); } catch { closed = true; } };
      try {
        const c = await compareApp(Number(m.appid), !!m.fresh, { edition: m.edition, onPart: (p) => send({ type: 'part', data: p }) });
        send({ type: 'done', data: c });
        if (!m.edition) await setBadge(port.sender?.tab?.id, c).catch(() => {});
      } catch (e: any) {
        send({ type: 'error', error: String(e?.message ?? e) });
      }
    });
  });

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') browser.runtime.openOptionsPage();
    // Solo si no existen: recargar o actualizar la extensión no debe adelantar la revisión (ni sus avisos).
    void (async () => {
      if (!(await browser.alarms.get('wishlist'))) browser.alarms.create('wishlist', { periodInMinutes: 360, delayInMinutes: 5 });
      if (!(await browser.alarms.get('sale'))) browser.alarms.create('sale', { periodInMinutes: 720, delayInMinutes: 10 });
      if (!(await browser.alarms.get('refund'))) browser.alarms.create('refund', { periodInMinutes: 1440, delayInMinutes: 20 });
      if (!(await browser.alarms.get('free'))) browser.alarms.create('free', { periodInMinutes: 720, delayInMinutes: 15 });
    })();
    void syncDetection();
  });
  browser.runtime.onStartup.addListener(() => void syncDetection());
  // 11: «wic cuphead» en la barra de direcciones. Sugiere juegos de Steam con el precio de Steam y, si ya lo conoce,
  // el mejor precio fuera; al elegir uno se abre su ficha, donde está la comparación completa.
  const xml = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
  let omniRun = 0;
  browser.omnibox.setDefaultSuggestion({ description: 'Buscar el mejor precio de <match>%s</match> en Where is cheap' });
  browser.omnibox.onInputChanged.addListener((text, suggest) => {
    const my = ++omniRun;
    const q = text.trim();
    if (q.length < 2) return;
    void (async () => {
      const [hits, wish] = await Promise.all([searchSteam(q.slice(0, 80)).catch(() => [] as SearchHit[]), getWish()]);
      if (my !== omniRun) return;
      suggest(hits.slice(0, 5).map((h) => {
        const w = wish[h.appid];
        const steam = h.steamUSD != null ? `Steam $${h.steamUSD.toFixed(2)}` : 'no se vende en Steam';
        const out = w?.lastBest != null && w.lastStore && (h.steamUSD == null || w.lastBest < h.steamUSD) ? ` · $${w.lastBest.toFixed(2)} en ${STORES[w.lastStore].name}` : '';
        return { content: `https://store.steampowered.com/app/${h.appid}/`, description: `<match>${xml(h.name)}</match> <dim>${xml(steam + out)}</dim>` };
      }));
    })();
  });
  browser.omnibox.onInputEntered.addListener((text, disposition) => {
    void (async () => {
      let url = text.startsWith('https://store.steampowered.com/app/') ? text : null;
      if (!url) {
        const [first] = await searchSteam(text.trim().slice(0, 80)).catch(() => [] as SearchHit[]);
        url = first ? `https://store.steampowered.com/app/${first.appid}/` : `https://store.steampowered.com/search/?term=${encodeURIComponent(text.trim())}`;
      }
      if (disposition === 'currentTab') await browser.tabs.update({ url });
      else await browser.tabs.create({ url, active: disposition === 'newForegroundTab' });
    })();
  });
  browser.alarms.onAlarm.addListener((a) => {
    if (a.name === 'wishlist') void syncSteam(false).catch(() => {}).then(() => checkWishlist());
    if (a.name === 'sale') void checkSale();
    if (a.name === 'refund') void checkRefunds();
    if (a.name === 'free') void checkFree();
  });
  browser.notifications.onClicked.addListener((id) => void openNotification(id));
  browser.notifications.onButtonClicked.addListener((id, i) => {
    // El segundo botón de todos los avisos es «Silenciar 1 día».
    if (i === 1) void saveSettings({ mutedUntil: Date.now() + 24 * HOUR }).then(() => browser.notifications.clear(id));
    else void openNotification(id);
  });
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
