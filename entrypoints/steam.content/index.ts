import '@/lib/ui.css';
import '@/lib/block.css';
import { appidFromUrl, call, friendlyError, streamCompare, trackClicks } from '@/lib/api';
import { alertHTML, dlcHTML, dlcToPrice, panelFootHTML, sellersToAsk, tableHTML, topHTML, type BlockState, type DlcPrice, type DlcView } from '@/lib/block';
import type { SellerNote } from '@/lib/stores/kinguin';
import { readEditions } from '@/lib/editions';
import { detectGpu, type RunCheck } from '@/lib/pc';
import { getSettings } from '@/lib/settings';
import { sessionFromDom } from '@/lib/steamUser';
import type { Compare, Settings } from '@/lib/types';
import { esc, swapRows, TAG_SVG, toast } from '@/lib/ui';

export default defineContentScript({
  matches: ['https://store.steampowered.com/app/*'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    const appid = appidFromUrl(location.href);
    if (!appid) return;
    // Q y E: que el background lea tu lista y tu biblioteca antes de comparar (comparte la lectura con user.content).
    await call('syncUser', { session: sessionFromDom(document) }).catch(() => {});

    const wrapper = document.querySelector('#game_area_purchase .game_area_purchase_game_wrapper');
    const anchor = wrapper ?? document.querySelector('#game_area_purchase');
    if (!anchor) return;

    // 10: el bloque recuerda si lo dejaste abierto, de un juego a otro.
    const st: BlockState = { open: !!(await browser.storage.local.get('blockOpen')).blockOpen, showNo: false, chart: false, editions: [] };
    let editionsRead = false;
    let target: number | null = await call<number | null>('getTarget', { appid }).catch(() => null);
    let last: Compare | null = null;
    let s: Settings = await getSettings();
    let run = 0;
    // 9: los DLC se leen una vez; sus precios fuera de Steam, solo al abrir la sección.
    let dlc: DlcView | null = null;
    let dlcAsked = false;

    const ui = await createShadowRootUi(ctx, {
      name: 'where-is-cheap',
      position: 'inline',
      anchor,
      append: wrapper ? 'after' : 'first',
      onMount(container) {
        const root = document.createElement('div');
        root.className = 'wic';
        root.style.margin = '0 0 16px';
        root.innerHTML = `<div class="blk${s.currency === 'usd' ? ' usd' : ''}"><div class="b-top"></div><div class="b-panel" hidden><div class="b-rows"></div><div class="b-pf"></div></div><div class="b-dlc"></div><div class="b-al"></div></div>`;
        container.append(root);
        wire(root);
        void load(root, false);
        return root;
      },
    });
    ui.mount();

    const $ = <T extends HTMLElement>(root: HTMLElement, sel: string) => root.querySelector<T>(sel)!;

    function paint(root: HTMLElement) {
      $(root, '.blk').classList.toggle('usd', s.currency === 'usd');
      $(root, '.b-top').innerHTML = topHTML(last, s, st);
      const panel = $(root, '.b-panel');
      panel.hidden = !st.open || !last;
      if (last) {
        swapRows($(root, '.b-rows'), tableHTML(last, s, st));
        $(root, '.b-pf').innerHTML = panelFootHTML(last, s);
        trackClicks($(root, '.blk'), last, root);
        askSellers(root);
      }
      paintDlc(root);
      // El aviso solo se repinta si no estás escribiendo en él.
      const al = $(root, '.b-al');
      const act = (root.getRootNode() as ShadowRoot).activeElement;
      if (!act || !al.contains(act)) {
        al.innerHTML = last && (last.owned || last.game.isFree) ? '' : alertHTML(target, last);
      }
    }

    /** 10: con la tabla abierta y Kinguin ya respondido, quién vende su oferta más barata. */
    function askSellers(root: HTMLElement) {
      if (!st.open || !last || last.pending?.includes('kinguin')) return;
      for (const { url, cents } of sellersToAsk(last, st)) {
        (st.sellers ??= {})[url] = null;
        call<SellerNote | null>('seller', { url, cents }).then((n) => { if (n) { st.sellers![url] = n; paint(root); } }).catch(() => {});
      }
    }

    function paintDlc(root: HTMLElement) {
      $(root, '.b-dlc').innerHTML = dlcHTML(dlc, last, s, st);
    }

    /** 9: busca fuera de Steam los DLC que te faltan, de dos en dos. */
    async function priceDlcs(root: HTMLElement) {
      if (!dlc) return;
      const queue = dlcToPrice(dlc).filter((d) => dlc!.prices[d.appid] === undefined || dlc!.prices[d.appid] === 'error');
      for (const d of queue) dlc.prices[d.appid] = 'loading';
      paintDlc(root);
      const work = async () => {
        for (let d = queue.shift(); d; d = queue.shift()) {
          const id = d.appid;
          dlc!.prices[id] = await call<DlcPrice>('dlcPrice', { appid: id }).catch(() => 'error' as const);
          paintDlc(root);
        }
      };
      await Promise.all([work(), work()]);
    }

    async function load(root: HTMLElement, fresh: boolean) {
      const my = ++run;
      s = await getSettings();
      if (fresh) last = null;
      paint(root);
      try {
        const c = await streamCompare(appid!, fresh, (p) => { if (my === run) { last = p; readEds(p); paint(root); } }, st.edition ? st.editions.find((e) => e.label === st.edition) : undefined);
        if (my !== run) return;
        if (c.game.isFree) { root.remove(); return; }
        last = c;
        readEds(c);
        paint(root);
        // 4: con la ficha ya leída, los requisitos están guardados y no se vuelve a pedir a Steam.
        if (!dlcAsked && !c.game.isDlc) {
          dlcAsked = true;
          call<Omit<DlcView, 'open' | 'prices'>>('dlcList', { appid }).then((r) => { if (r.total) { dlc = { ...r, open: false, prices: {} }; paintDlc(root); } }).catch(() => {});
        }
        if (st.run === undefined) {
          st.run = null;
          call<RunCheck>('canRun', { appid, gpu: detectGpu() }).then((r) => { st.run = r; if (my === run) paint(root); }).catch(() => {});
        }
      } catch (e) {
        if (my !== run) return;
        $(root, '.b-top').innerHTML = `<div class="b-h">${TAG_SVG('#1f1a22', 16)}<span class="b-k">No pudimos comparar precios</span></div><div class="b-main one"><span class="b-ic" style="color:var(--bad)">!</span><div><div class="b-t">${esc(friendlyError(e))}</div><div class="b-s"><button type="button" class="b-more" data-a="retry" style="margin:6px 0 0">Reintentar</button></div></div></div>`;
        $(root, '.b-panel').hidden = true;
      }
    }

    // 10 (ediciones): se leen una vez, con el nombre del juego que da Steam.
    function readEds(c: Compare) {
      if (editionsRead || st.edition) return;
      editionsRead = true;
      st.editions = readEditions(document, c.game.name);
    }

    function wire(root: HTMLElement) {
      root.addEventListener('click', (ev) => {
        const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-a],[data-ed]');
        if (!el) return;
        if (el.dataset.ed != null) {
          st.edition = el.dataset.ed || undefined;
          st.open = true;
          last = null;
          void load(root, false);
          return;
        }
        switch (el.dataset.a) {
          case 'toggle':
            st.open = !st.open;
            void browser.storage.local.set({ blockOpen: st.open });
            paint(root);
            break;
          case 'no': st.showNo = !st.showNo; paint(root); break;
          case 'chart': st.chart = !st.chart; paint(root); break;
          case 'refresh': void load(root, true); break;
          case 'retry': void load(root, true); break;
          case 'options': void call('options'); break;
          case 'pc': void call('options', { hash: 'pc' }); break;
          case 'dlc':
            if (!dlc) break;
            dlc.open = !dlc.open;
            paintDlc(root);
            if (dlc.open) void priceDlcs(root);
            break;
          case 't-edit': target = null; $(root, '.b-al').innerHTML = alertHTML(null, last); $(root, '#wic-target').focus(); break;
          case 't-clear':
            target = null;
            void call('setTarget', { appid, target: null });
            $(root, '.b-al').innerHTML = alertHTML(null, last);
            break;
        }
      });
      // 8: guardar el límite (Enter o «Guardar»).
      root.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const inp = $<HTMLInputElement>(root, '#wic-target');
        const n = Number(inp.value);
        if (!(n > 0)) { inp.setCustomValidity('Pon un precio mayor que 0'); inp.reportValidity(); return; }
        inp.setCustomValidity('');
        target = Math.round(n * 100) / 100;
        void call('setTarget', { appid, target, name: last?.game.name }).then(() => toast(root, `Te avisamos si baja de $${target!.toFixed(2)}`)).catch(() => toast(root, 'No se pudo guardar el aviso'));
        $(root, '.b-al').innerHTML = alertHTML(target, last);
      });
    }

    browser.storage.onChanged.addListener((ch, area) => {
      const root = ui.mounted as HTMLElement | undefined;
      if (area === 'local' && (ch.settings || ch.coupons || ch.feesLearned) && root?.isConnected) void load(root, false);
      // 4: si corriges tu PC en Ajustes, la línea se rehace sola.
      if (area === 'local' && ch.pcManual && root?.isConnected) void call<RunCheck>('canRun', { appid }).then((r) => { st.run = r; paint(root); }).catch(() => {});
    });
  },
});
