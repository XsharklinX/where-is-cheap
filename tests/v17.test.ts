import { describe, expect, it, vi } from 'vitest';

// box.ts importa api.ts (usa browser.*); para probar sus funciones puras basta con un browser vacío.
vi.stubGlobal('browser', { runtime: { getURL: (p: string) => p, sendMessage: async () => null }, storage: { local: { get: async () => ({}), set: async () => {} } } });

const { dropSince, sparkSVG } = await import('../lib/box');
const { rank } = await import('../lib/compare');
const { DEFAULT_SETTINGS } = await import('../lib/types');

const DAY = 86_400_000;
const NOW = new Date('2026-11-05T15:00:00').getTime();

describe('1.7 (11): bajó desde la última vez', () => {
  it('compara con el último día anterior a hoy', () => {
    const h = [{ t: NOW - 8 * DAY, steam: 20, best: 15 }, { t: NOW - 3 * DAY, steam: 20, best: 14.24 }, { t: NOW - 60_000, steam: 20, best: 11.04 }];
    expect(dropSince(h, 11.04, NOW)).toEqual({ usd: 3.2, at: NOW - 3 * DAY });
  });
  it('si subió, o bajó menos de $0,25 o del 2 %, no dice nada', () => {
    expect(dropSince([{ t: NOW - 2 * DAY, steam: 20, best: 10 }], 11, NOW)).toBeNull();
    expect(dropSince([{ t: NOW - 2 * DAY, steam: 20, best: 11.2 }], 11, NOW)).toBeNull();
    expect(dropSince([{ t: NOW - 2 * DAY, steam: 80, best: 60 }], 59.5, NOW)).toBeNull();
  });
  it('sin días anteriores (solo hoy), nada', () => {
    expect(dropSince([{ t: NOW - 3_600_000, steam: 20, best: 15 }], 11, NOW)).toBeNull();
    expect(dropSince([], 11, NOW)).toBeNull();
  });
});

describe('1.7 (12): historial en miniatura', () => {
  it('con menos de dos días no se dibuja', () => {
    expect(sparkSVG([], 11, NOW)).toBe('');
    expect(sparkSVG([{ t: NOW - 3_600_000, steam: 20, best: 12 }], 11, NOW)).toBe('');
  });
  it('dibuja la línea con el mínimo en verde y deja fuera lo de hace más de 90 días', () => {
    const h = [{ t: NOW - 200 * DAY, steam: 20, best: 1 }, { t: NOW - 30 * DAY, steam: 20, best: 14 }, { t: NOW - 10 * DAY, steam: 20, best: 9.1 }];
    const svg = sparkSVG(h, 11.04, NOW);
    expect(svg).toContain('<svg');
    expect(svg).toContain('#45d69b');
    // El punto de hace 200 días ($1) habría puesto el mínimo abajo del todo: no cuenta.
    expect((svg.match(/<circle/g) ?? []).length).toBe(2);
  });
});

describe('1.7 (14): tiendas ocultas', () => {
  it('rank quita las ofertas de una tienda oculta', () => {
    const game = { appid: 1, name: 'Hades', steamUSD: 24.99, isFree: false };
    const rates = { EUR: 0.9, DOP: 60, at: 0, fallback: false };
    const raw = [
      { store: 'eneba', title: 'Hades Steam Key GLOBAL', kind: 'key', regions: ['global'], price: 12.47, currency: 'USD', url: 'e1' },
      { store: 'ig', title: 'Hades', kind: 'key', regions: ['worldwide'], regionCheckedByStore: true, price: 11.88, currency: 'EUR', url: 'i1' },
    ] as any;
    expect(rank(game, raw, rates, DEFAULT_SETTINGS).map((o) => o.url)).toEqual(['i1', 'e1']);
    expect(rank(game, raw, rates, { ...DEFAULT_SETTINGS, hiddenStores: ['ig'] }).map((o) => o.url)).toEqual(['e1']);
  });
});
