import { describe, expect, it } from 'vitest';
import { parseHistory, refundable, REFUND_DAYS } from '../lib/refunds';

const row = (o: { type?: string; items?: string; date?: string; total?: string } = {}) =>
  `<tr class="wallet_table_row" onclick="ShowWalletOrderDetails('123')"><td class="wht_type"><div>${o.type ?? 'Purchase'}</div></td><td class="wht_items"><div>${o.items ?? 'Hollow Knight'}</div></td><td class="wht_date"><div>${o.date ?? 'Oct 28, 2026'}</div></td><td class="wht_total"><div>${o.total ?? '$19.99'}</div></td></tr>`;

describe('historial de compras de Steam (1.3, fase D, idea 6)', () => {
  it('lee fecha, nombre, tipo y total', () => {
    const p = parseHistory(`<table class="wallet_table">${row()}</table>`);
    expect(p).toHaveLength(1);
    expect(p[0].name).toBe('Hollow Knight');
    expect(p[0].type).toBe('Purchase');
    expect(p[0].total).toBe(19.99);
    expect(p[0].date).toBe(Date.parse('Oct 28, 2026'));
  });
  it('ignora las filas sin fecha y las que no son filas de compra', () => {
    expect(parseHistory(`<table>${row({ date: '' })}<tr class="other"></tr></table>`)).toHaveLength(0);
  });
  it('lee también el formato de fila corto (wallet_row)', () => {
    const p = parseHistory(`<tr class="wallet_row"><td class="wht_date">Nov 1, 2026</td><td class="wht_items">DLC Name</td><td class="wht_type">Purchase</td></tr>`);
    expect(p[0]).toMatchObject({ name: 'DLC Name', type: 'Purchase', total: null });
  });
});

describe('reembolsable (fase D, idea 6)', () => {
  const now = Date.UTC(2026, 10, 3);
  it('reciente y poco jugado (o sin dato de horas)', () => {
    expect(refundable(now - 5 * 86_400_000, 60, now)).toBe(true);
    expect(refundable(now - 5 * 86_400_000, null, now)).toBe(true);
    expect(refundable(now - 5 * 86_400_000, 119, now)).toBe(true);
  });
  it('más de 2 h jugadas o más de 14 días', () => {
    expect(refundable(now - 5 * 86_400_000, 121, now)).toBe(false);
    expect(refundable(now - (REFUND_DAYS + 1) * 86_400_000, 30, now)).toBe(false);
  });
});
