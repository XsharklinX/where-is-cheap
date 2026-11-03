// Emparejado estricto de títulos: la oferta tiene que ser el mismo juego y la misma edición.
// Mejor perder una oferta que enseñar el precio de un DLC o de la secuela.

const NOISE = new Set([
  'pc', 'mac', 'linux', 'windows', 'steam', 'key', 'cd', 'gift', 'account', 'digital', 'download',
  'global', 'worldwide', 'ww', 'row', 'europe', 'eu', 'latam', 'na', 'north', 'america', 'us', 'usa',
  'uk', 'cis', 'ru', 'turkey', 'argentina', 'brazil', 'india', 'asia', 'emea', 'region', 'free',
  'altergift', 'code', 'eu', 'emea',
]);

const ROMAN: Record<string, string> = { ii: '2', iii: '3', iv: '4', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };

export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[™®©]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => ROMAN[w] ?? w)
    .join(' ');
}

function dropTrailingNoise(words: string[]): string[] {
  const w = [...words];
  while (w.length && NOISE.has(w[w.length - 1])) w.pop();
  return w;
}

function dropStandard(s: string): string {
  return s.replace(/ standard( edition)?$/, '').trim();
}

/** Quita de un título de tienda la plataforma, la región y el tipo de producto. */
export function cleanOfferTitle(title: string): string {
  const group = (_m: string, inner: string) => (dropTrailingNoise(norm(inner).split(' ')).join('') === '' ? ' ' : ` ${inner} `);
  let t = title.replace(/\(([^)]*)\)/g, group).replace(/\[([^\]]*)\]/g, group);
  const parts = t.split(/\s[-–|]\s/);
  while (parts.length > 1 && dropTrailingNoise(norm(parts[parts.length - 1]).split(' ')).join('') === '') parts.pop();
  t = parts.join(' - ');
  return dropStandard(dropTrailingNoise(norm(t).split(' ')).join(' '));
}

export function sameGame(steamName: string, offerTitle: string): boolean {
  const a = dropStandard(norm(steamName));
  const b = cleanOfferTitle(offerTitle);
  return a.length > 0 && a === b;
}
