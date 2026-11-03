// 6 (fase D): recordatorio de reembolso. Lee el historial de compras de Steam (store.steampowered.com/account/history/)
// y, cruzando con las horas jugadas de IPlayerService/GetOwnedGames, avisa una vez por compra reciente (< 14 días)
// con menos de 2 h jugadas. Solo se piden datos de Steam, con la sesión del usuario.

export interface SteamPurchase { name: string; date: number; total: number | null; type: string }

const ROW = /<tr[^>]*class="[^"]*\b(?:wallet_table_row|wallet_row)\b[^"]*"[^>]*>[\s\S]*?<\/tr>/gi;
const CELL = (cls: string) => new RegExp(`<td[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/td>`, 'i');

function strip(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMoney(s: string): number | null {
  const m = s.match(/[-+]?\d[\d.,]*/);
  if (!m) return null;
  const n = Number(m[0].replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Compras del historial de Steam. La página carga más compras por AJAX al hacer scroll: solo se leen las que vienen
 * en el HTML inicial (suficiente para las más recientes). Si Steam cambia la maqueta, devuelve [] y no avisa.
 */
export function parseHistory(html: string): SteamPurchase[] {
  const rows = html.match(ROW) ?? [];
  const out: SteamPurchase[] = [];
  for (const row of rows) {
    const cell = (cls: string) => { const m = row.match(CELL(cls)); return m ? strip(m[1]) : ''; };
    const date = Date.parse(cell('wht_date'));
    if (!Number.isFinite(date)) continue;
    const name = cell('wht_items');
    const type = cell('wht_type');
    if (!name && !type) continue;
    out.push({ name, date, total: parseMoney(cell('wht_total')), type });
  }
  return out;
}

export const REFUND_DAYS = 14;
export const REFUND_MINUTES = 120;

/** < 14 días desde la compra y < 2 h jugadas. Sin dato de horas (null) cuenta como «aún sin jugar». */
export function refundable(date: number, playtimeMinutes: number | null, now = Date.now()): boolean {
  if (now - date > REFUND_DAYS * 86_400_000) return false;
  return playtimeMinutes == null || playtimeMinutes < REFUND_MINUTES;
}
