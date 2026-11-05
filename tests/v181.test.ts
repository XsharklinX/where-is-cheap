import { describe, expect, it } from 'vitest';
import { sameGame } from '../lib/match';
import { parseIG } from '../lib/stores/ig';

describe('1.8.1: remakes con el año en el título', () => {
  it('«Resident Evil 4 (2023)» es el Resident Evil 4 de 2023 de Steam', () => {
    expect(sameGame('Resident Evil 4', 'Resident Evil 4 (2023) PC Steam CD Key', 2023)).toBe(true);
    expect(sameGame('Resident Evil 4', 'Resident Evil 4 (2023) RoW Steam CD Key', 2023)).toBe(true);
  });
  it('«Amerzone (2025)» sí; el de 1999 no', () => {
    const n = "Amerzone - The Explorer's Legacy";
    expect(sameGame(n, "Amerzone: The Explorer's Legacy (2025) Steam (PC) Key GLOBAL", 2025)).toBe(true);
    expect(sameGame(n, "Amerzone: The Explorer's Legacy (2025) PC Steam CD Key", 2025)).toBe(true);
    expect(sameGame(n, "Amerzone: The Explorer's Legacy (1999) PC Steam CD Key", 2025)).toBe(false);
    expect(sameGame(n, "Amerzone - The Explorer’s Legacy (1999) (Global) (PC) - Steam - Digital Key", 2025)).toBe(false);
  });
  it('sin año conocido, o con la edición detrás del año, se sigue rechazando', () => {
    expect(sameGame('Resident Evil 4', 'Resident Evil 4 (2023) PC Steam CD Key')).toBe(false);
    expect(sameGame("Amerzone - The Explorer's Legacy", "Amerzone: The Explorer's Legacy (2025) Deluxe Edition PC Steam CD Key", 2025)).toBe(false);
    // El original de 2005 no pasa por el remake de 2023.
    expect(sameGame('Resident Evil 4', 'Resident Evil 4 (2005) PC Steam CD Key', 2023)).toBe(false);
  });
  it('lo de siempre sigue igual', () => {
    expect(sameGame('Haven', 'Haven (Global) (PC) - Steam - Digital Key', 2020)).toBe(true);
    expect(sameGame('Haven', 'Haven Park (Global) (PC / Mac / Linux) - Steam - Digital Key', 2020)).toBe(false);
  });
});

describe('1.8.1: historial limpio al actualizar', async () => {
  const { cleanHistories } = await import('../lib/data');
  it('quita el «mejor precio» guardado y deja Steam; no toca otras claves', () => {
    const r = cleanHistories({ 'hist:1245620': [{ t: 1, steam: 59.99, best: 35.81, store: 'ig' }, { t: 2, steam: 59.99, best: 63.59 }], wish: { a: 1 }, 'cmpLast:x': {} });
    expect(r).toEqual({ 'hist:1245620': [{ t: 1, steam: 59.99, best: null }, { t: 2, steam: 59.99, best: null }] });
  });
});

describe('1.8.1: Instant Gaming agotado', () => {
  const hit = (x: Record<string, unknown>) => ({ type: 'Steam', is_prepaid: 0, is_subscription: 0, price: 31.99, name: 'Elden Ring', prod_id: 16976, seo_name: 'elden-ring', country_whitelist: ['DO'], is_dlc: 0, ...x });
  it('has_stock 0 no sale; 1 o sin el campo, sí', () => {
    const r = parseIG({ hits: [hit({ has_stock: 0 }), hit({ has_stock: 1, prod_id: 2 }), hit({ prod_id: 3 })] });
    expect(r.map((o) => o.url)).toEqual(['https://www.instant-gaming.com/en/2-buy-elden-ring/', 'https://www.instant-gaming.com/en/3-buy-elden-ring/']);
  });
});
