import type { Fit, Kind, RawOffer } from './types';

// Regiones en las que una clave de Steam activa con una cuenta de República Dominicana.
const OK_DO = new Set([
  'global', 'worldwide', 'ww', 'row', 'rest of world', 'rest of the world', 'latam', 'latin america',
  'south america', 'south_america', 'americas', 'dominican republic', 'dominican_republic',
]);

const STORE_NAME: Record<RawOffer['store'], string> = { ig: 'Instant Gaming', eneba: 'Eneba', driffle: 'Driffle', kinguin: 'Kinguin' };
const ACCOUNT = 'tu cuenta de Steam es de RD (LATAM-USD)';

/** Si la clave activa en una cuenta de RD, y por qué (13: el globo de ayuda de la etiqueta). */
export function regionFit(o: Pick<RawOffer, 'regions' | 'regionCheckedByStore' | 'regionBlockedByStore' | 'kind'> & { store?: RawOffer['store'] }): { fit: Fit; text: string; why: string } {
  const gift = o.kind === 'gift' ? ' Es un regalo de Steam: se añade desde la bandeja de regalos y Steam comprueba la región al aceptarlo.' : '';
  if (o.kind === 'account') return { fit: 'warn', text: 'Es una cuenta, no una clave', why: 'Te venden el acceso a otra cuenta de Steam que ya tiene el juego, no una clave para la tuya. Si el dueño la recupera, lo pierdes.' };
  if (o.regionCheckedByStore) return { fit: 'ok', text: 'Activa en RD', why: `${o.store ? STORE_NAME[o.store] : 'La tienda'} confirma que esta clave activa en República Dominicana.${gift}` };
  if (o.regionBlockedByStore) return { fit: 'no', text: 'No activa en RD', why: `${o.store ? STORE_NAME[o.store] : 'La tienda'} dice que esta clave no activa en República Dominicana: Steam la rechazaría.` };
  const labels = o.regions.map((r) => r.toLowerCase().trim()).filter(Boolean);
  if (!labels.length) return { fit: 'warn', text: 'Región sin indicar', why: 'La tienda no dice en qué región activa. Pregunta al vendedor antes de comprar o elige otra oferta.' };
  const ok = labels.find((r) => OK_DO.has(r));
  if (ok) {
    const name = prettyRegion(ok);
    const why = name === 'Global' || name === 'Resto del mundo'
      ? `Clave ${name.toLowerCase()}: activa en cualquier cuenta, también en la tuya.`
      : `Clave ${name}: activa en las cuentas de esa región, y ${ACCOUNT}.`;
    return { fit: 'ok', text: 'Activa en RD', why: why + gift };
  }
  const name = prettyRegion(o.regions[0]);
  return { fit: 'no', text: `No activa en RD (${name})`, why: `Clave de ${name}: Steam solo la activa en cuentas de esa región, y ${ACCOUNT}. Con VPN tampoco: Steam mira el país de la cuenta.` };
}

export function prettyRegion(r: string): string {
  const s = r.replace(/_/g, ' ').trim();
  const map: Record<string, string> = {
    global: 'Global', worldwide: 'Global', latam: 'LATAM', europe: 'Europa', 'united states': 'EE. UU.',
    'north america': 'Norteamérica', 'united kingdom': 'Reino Unido', turkey: 'Turquía', argentina: 'Argentina',
    brazil: 'Brasil', india: 'India', 'south america': 'Sudamérica', row: 'Resto del mundo',
    emea: 'EMEA', asia: 'Asia', cis: 'CEI', 'latin america': 'LATAM',
  };
  return map[s.toLowerCase()] ?? s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function kindLabel(k: Kind): string {
  return k === 'key' ? 'Clave Steam' : k === 'gift' ? 'Regalo de Steam' : 'Cuenta de Steam';
}
