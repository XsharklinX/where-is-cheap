import type { Fit, Kind, RawOffer } from './types';

// Regiones en las que una clave de Steam activa con una cuenta de República Dominicana.
const OK_DO = new Set([
  'global', 'worldwide', 'ww', 'row', 'rest of world', 'rest of the world', 'latam', 'latin america',
  'south america', 'south_america', 'americas', 'dominican republic', 'dominican_republic',
]);

export function regionFit(o: Pick<RawOffer, 'regions' | 'regionCheckedByStore' | 'regionBlockedByStore' | 'kind'>): { fit: Fit; text: string } {
  if (o.kind === 'account') return { fit: 'warn', text: 'Es una cuenta, no una clave' };
  if (o.regionCheckedByStore) return { fit: 'ok', text: 'Activa en RD' };
  if (o.regionBlockedByStore) return { fit: 'no', text: 'No activa en RD' };
  const labels = o.regions.map((r) => r.toLowerCase().trim()).filter(Boolean);
  if (!labels.length) return { fit: 'warn', text: 'Región sin indicar' };
  if (labels.some((r) => OK_DO.has(r))) return { fit: 'ok', text: 'Activa en RD' };
  return { fit: 'no', text: `No activa en RD (${prettyRegion(o.regions[0])})` };
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
