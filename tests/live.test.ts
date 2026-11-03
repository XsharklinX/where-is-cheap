// Prueba contra las tiendas de verdad. Solo con LIVE=1 (en Git Bash: LIVE=1 npx vitest run tests/live.test.ts). Fuera del navegador no hay reglas
// de cabecera, así que aquí se pone a mano el Referer que en la extensión pone public/rules.json.
import { describe, expect, it } from 'vitest';
import { gather, rank, savings } from '../lib/compare';
import { searchDriffle } from '../lib/stores/driffle';
import { searchEneba } from '../lib/stores/eneba';
import { searchIG } from '../lib/stores/ig';
import { searchKinguin } from '../lib/stores/kinguin';
import { DEFAULT_SETTINGS, type Game } from '../lib/types';

declare const process: { env: Record<string, string | undefined> };
const live = process.env.LIVE === '1';
const realFetch = globalThis.fetch;
globalThis.fetch = (input: any, init: any = {}) => {
  const url = String(input);
  const headers = new Headers(init.headers);
  headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36');
  if (url.includes('algolia.net')) headers.set('Referer', 'https://www.instant-gaming.com/');
  return realFetch(input, { ...init, headers });
};

async function steam(appid: number): Promise<Game> {
  const d = (await (await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=do&l=english`)).json())[appid].data;
  return { appid, name: d.name, isFree: d.is_free, steamUSD: d.price_overview ? d.price_overview.final / 100 : null };
}

describe.skipIf(!live)('en vivo', () => {
  for (const appid of [1145360, 1245620, 367520, 1086940]) {
    it(`appid ${appid}`, async () => {
      const game = await steam(appid);
      const { raw, failed } = await gather(game.name, { ig: searchIG, eneba: (q) => searchEneba(q), driffle: (q) => searchDriffle(q), kinguin: searchKinguin }, 'DO');
      const offers = rank(game, raw, { EUR: 0.8933, DOP: 60.67, at: 0, fallback: true }, DEFAULT_SETTINGS);
      console.log(`\n${game.name} · Steam ${game.steamUSD} · crudas ${raw.length} · fallaron [${failed}]`);
      for (const o of offers) console.log(`  ${o.store.padEnd(8)} ${o.kind.padEnd(7)} ${o.fit.padEnd(4)} ${o.totalUSD.toFixed(2).padStart(7)}  ${o.title}`);
      console.log('  ahorro', savings({ game, offers }));
      expect(failed).toEqual([]);
    }, 60000);
  }
});
