import { describe, expect, it } from 'vitest';
import { autoBoughtIds, type LedgerEntry } from '../lib/data';
import { local, localNum, localRate } from '../lib/ui';
import { DEFAULT_SETTINGS, type Settings } from '../lib/types';

// Monedas locales (1.4) y ahorro que se cuenta solo (1.4).

const rates = { EUR: 0.9, DOP: 60, fx: { DOP: 60, ARS: 350, MXN: 18 }, at: 0, fallback: false };
const s = (currency: Settings['currency'], localCurrency: string): Settings => ({ ...DEFAULT_SETTINGS, currency, localCurrency });

describe('monedas locales (1.4)', () => {
  it('tasa y número redondeado', () => {
    expect(localRate({ rates }, s('both', 'ARS'))).toBe(350);
    expect(localNum(10, { rates }, s('both', 'MXN'))).toBe('180');
  });
  it('formatea con el símbolo de cada moneda', () => {
    expect(local(10, { rates }, s('dop', 'ARS'))).toBe('AR$ 3,500');
    expect(local(10, { rates }, s('dop', 'DOP'))).toBe('RD$ 600');
    expect(local(10, { rates }, s('dop', 'VES'))).toBe('Bs. 600');
  });
  it('si falta la tasa de esa moneda, cae a RD$', () => {
    expect(localRate({ rates }, s('both', 'XYZ'))).toBe(60);
    expect(localRate({ rates: { EUR: 0.9, DOP: 60, at: 0, fallback: false } }, s('both', 'ARS'))).toBe(60);
  });
});

describe('ahorro que se cuenta solo (1.4)', () => {
  const entry = (id: string, appid: number, state: LedgerEntry['state'], ownedAtClick?: boolean): LedgerEntry =>
    ({ id, appid, name: 'Juego', store: 'ig', paidUSD: 10, steamUSD: 20, at: 0, state, ...(ownedAtClick != null ? { ownedAtClick } : {}) });

  it('solo los pendientes que no tenías al pulsar «Ir» y ahora están en tu biblioteca', () => {
    const ledger = [
      entry('a', 1, 'pending', false),
      entry('b', 2, 'pending', true),
      entry('c', 3, 'pending'), // sin marcar: no se auto-confirma
      entry('d', 4, 'bought', false),
    ];
    expect(autoBoughtIds(ledger, [1, 3, 4])).toEqual(['a']);
  });
});
