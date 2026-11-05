import '@/lib/ui.css';
import '@/lib/block.css';
import '@/lib/box.css';
import { appidFromUrl, call, friendlyError, streamCompare } from '@/lib/api';
import { blockCase } from '@/lib/block';
import { boxShell, createBox } from '@/lib/box';
import { savings } from '@/lib/compare';
import { editionTitle, readEditions } from '@/lib/editions';
import { detectGpu, type RunCheck } from '@/lib/pc';
import { getSettings } from '@/lib/settings';
import { sessionFromDom } from '@/lib/steamUser';
import type { Compare, Edition, Settings } from '@/lib/types';
import { STORES } from '@/lib/types';
import { norm } from '@/lib/match';
import { claimPage } from '@/lib/claim';

const TAG_INLINE = '<svg width="12" height="12" viewBox="0 0 34 34" aria-hidden="true" style="vertical-align:-1px;margin-right:5px"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11.4a2.5 2.5 0 0 1 1.77.73l9.6 9.6a2.5 2.5 0 0 1 0 3.54l-11.4 11.4a2.5 2.5 0 0 1-3.54 0l-9.6-9.6A2.5 2.5 0 0 1 4 17.9Z" fill="#ffb547"/><circle cx="11" cy="11" r="2.6" fill="#1b2838"/></svg>';
const usd = (n: number) => `$${n.toFixed(2)}`;
const escT = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

export default defineContentScript({
  matches: ['https://store.steampowered.com/app/*'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    if (!claimPage(ctx, 'app')) return;
    const appid = appidFromUrl(location.href);
    if (!appid) return;
    // Q y E: que el background lea tu lista y tu biblioteca antes de comparar (comparte la lectura con user.content).
    await call('syncUser', { session: sessionFromDom(document) }).catch(() => {});

    const wrapper = document.querySelector('#game_area_purchase .game_area_purchase_game_wrapper');
    const anchor = wrapper ?? document.querySelector('#game_area_purchase');
    if (!anchor) return;

    let s: Settings = await getSettings();
    let run = 0;
    let editions: Edition[] = [];
    let editionsDone = false;
    let edition: Edition | undefined;
    let box: ReturnType<typeof createBox> | null = null;
    let host: HTMLElement | null = null;

    const ui = await createShadowRootUi(ctx, {
      name: 'where-is-cheap',
      position: 'inline',
      anchor,
      append: wrapper ? 'after' : 'first',
      onMount(container) {
        const root = document.createElement('div');
        root.className = 'wic';
        root.innerHTML = boxShell('steam', s);
        container.append(root);
        box = createBox(root, appid, 'steam', s, {
          refresh: () => void load(true),
          options: (hash) => void call('options', hash ? { hash } : undefined),
          std: () => { edition = undefined; box!.st.edition = undefined; box!.st.pane = null; void load(false); },
          edition: (label) => { const e = editions.find((x) => x.label === label); if (e) void pickEdition(e); },
        }, root);
        void load(false);
        return root;
      },
    });
    ui.mount();
    host = ui.shadowHost;
    // La caja la quita WXT al recargar la extensión; la fila de la derecha y las tiras son nuestras.
    ctx.onInvalidated(() => document.querySelectorAll('.wic-glance, .wic-strip').forEach((el) => el.remove()));

    async function load(fresh: boolean) {
      const my = ++run;
      s = await getSettings();
      box!.setSettings(s);
      if (fresh) box!.set(null);
      try {
        const c = await streamCompare(appid!, fresh, (p) => { if (my === run) { box!.set(p); glance(p); } }, edition);
        if (my !== run) return;
        if (c.game.isFree) { ui.remove(); return; }
        box!.set(c);
        glance(c);
        // 5: que el buscador de Steam sepa el precio de este juego durante un día (usa la comparación ya guardada).
        if (!edition) void call('badgeFor', { appid }).catch(() => {});
        if (box!.st.run === undefined) {
          box!.st.run = null;
          call<RunCheck>('canRun', { appid, gpu: detectGpu() }).then((r) => { box!.st.run = r; box!.paint(); }).catch(() => {});
        }
        if (!editionsDone && !edition) { editionsDone = true; editions = readEditions(document, c.game.name); box!.st.editions = editions; box!.paint(); void stripEditions(); }
      } catch (e) {
        if (my !== run) return;
        box!.error(friendlyError(e));
      }
    }

    /* ---------- 3: la fila «Fuera de Steam» en la columna derecha ---------- */
    function glance(c: Compare) {
      if (edition) return;
      const col = document.querySelector('.glance_ctn_responsive_left');
      if (!col) return;
      let row = col.querySelector<HTMLElement>('.wic-glance');
      const top = c.offers.find((o) => o.fit === 'ok');
      const k = blockCase(c, s);
      if (k !== 'best' || !top || c.owned) { row?.remove(); return; }
      if (!row) {
        row = document.createElement('div');
        row.className = 'dev_row wic-glance';
        row.style.cssText = 'cursor:pointer;margin:6px -6px;padding:4px 6px;border-radius:2px;background:linear-gradient(90deg,rgba(255,181,71,.10),rgba(255,181,71,0) 85%)';
        row.title = 'Ver dónde comprarlo fuera de Steam';
        row.tabIndex = 0;
        const go = () => { host?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
        row.addEventListener('click', go);
        row.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
        const after = col.querySelector('.release_date') ?? col.querySelector('.user_reviews');
        if (after) after.after(row); else col.prepend(row);
      }
      const save = savings(c);
      row.innerHTML = `<div class="subtitle column" style="color:#c7a25a">Fuera de Steam:</div><div class="summary column" style="color:#ffb547;font-weight:700">${TAG_INLINE}${usd(top.totalUSD)} en ${STORES[top.store].name}${save ? `<span style="margin-left:6px;background:#4c6b22;color:#beee11;font-weight:400;padding:0 4px">-${save.pct}%</span>` : ''}</div>`;
    }

    /* ---------- 4: una tira bajo cada caja de edición de Steam ---------- */
    function boxFor(e: Edition): Element | null {
      for (const el of document.querySelectorAll('#game_area_purchase .game_area_purchase_game')) {
        if (el.closest('.dynamic_bundle_description')) continue;
        if (norm(editionTitle(el.querySelector('h1, h2.title, .title')?.textContent ?? '')) === norm(e.name)) return el;
      }
      return null;
    }

    async function stripEditions() {
      for (const e of editions.slice(1)) {
        const el = boxFor(e);
        if (!el) continue;
        const strip = document.createElement('div');
        strip.className = 'wic-strip';
        // 1.8: antes se metía bajo la caja con margen negativo y los botones de Steam (que cuelgan 17 px) la tapaban.
        // Ahora va justo debajo de esos botones, como una línea aparte.
        strip.style.cssText = 'margin:0 0 20px;padding:8px 14px;background:rgba(0,0,0,.22);border-radius:3px;box-shadow:inset 3px 0 0 #ffb547;font:12.5px "Motiva Sans",Arial,sans-serif;color:#c6d4df;display:flex;align-items:center;gap:6px;flex-wrap:wrap';
        strip.innerHTML = `${TAG_INLINE}<span style="color:#8f98a0">Fuera de Steam: buscando…</span>`;
        (el.closest('.game_area_purchase_game_wrapper') ?? el).after(strip);
        const act = el.querySelector('.game_purchase_action');
        if (act) {
          const gap = strip.getBoundingClientRect().top - act.getBoundingClientRect().bottom;
          if (gap > 8) strip.style.marginTop = `${Math.round(8 - gap)}px`;
        }
        try {
          const c = await streamCompare(appid!, false, () => {}, e);
          const top = c.offers.find((o) => o.fit === 'ok');
          const steam = e.steamUSD ?? c.game.steamUSD;
          if (!top) strip.innerHTML = `${TAG_INLINE}<span style="color:#8f98a0">Fuera de Steam no hay ofertas de esta edición que activen en RD.</span>`;
          else if (steam != null && steam <= top.totalUSD) strip.innerHTML = `${TAG_INLINE}<span>Steam es lo más barato para esta edición. Fuera, desde ${usd(top.totalUSD)} en ${STORES[top.store].name}.</span>`;
          else {
            offerUpsell(e, top.totalUSD);
            strip.innerHTML = `${TAG_INLINE}<span>Fuera de Steam: <b style="color:#ffb547">${usd(top.totalUSD)}</b> en ${STORES[top.store].name}</span><span style="color:#8f98a0">· activa en RD${steam ? ` · ahorras ${usd(steam - top.totalUSD)}` : ''}</span><a href="#" data-ed="${escT(e.label)}" style="color:#67c1f5;margin-left:6px">Ver ofertas ▸</a>`;
            strip.querySelector('a')!.addEventListener('click', (ev) => { ev.preventDefault(); void pickEdition(e); });
          }
        } catch {
          strip.remove();
        }
      }
    }

    /** 1.8 (4): si fuera de Steam otra edición cuesta como mucho $10 o un 25 % más que la estándar, la caja lo dice. Se queda la que menos sube. */
    function offerUpsell(e: Edition, edUSD: number) {
      const c = box!.current();
      if (!c || c.edition || c.owned) return;
      const std = c.offers.find((o) => o.fit === 'ok');
      if (!std) return;
      const diff = Math.round((edUSD - std.totalUSD) * 100) / 100;
      if (diff > 10 && diff > std.totalUSD * 0.25) return;
      const cur = box!.st.upsell;
      if (cur && cur.diff <= diff) return;
      box!.st.upsell = { label: e.label, usd: edUSD, diff };
      box!.paint();
    }

    /** «Ver ofertas» de una tira: la caja grande pasa a esa edición. */
    async function pickEdition(e: Edition) {
      edition = e;
      box!.st.full = true;
      box!.st.edition = e.label;
      host?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      box!.st.pane = 'stores';
      await load(false);
    }

    browser.storage.onChanged.addListener((ch, area) => {
      if (area !== 'local' || !(ui.mounted as HTMLElement | undefined)?.isConnected) return;
      if (ch.settings || ch.coupons || ch.feesLearned) void load(false);
      // 4: si corriges tu PC en Ajustes, la línea se rehace sola.
      if (ch.pcManual) void call<RunCheck>('canRun', { appid }).then((r) => { box!.st.run = r; box!.paint(); }).catch(() => {});
    });
  },
});
