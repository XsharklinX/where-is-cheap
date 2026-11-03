// 1.3, idea 4: «¿Lo corre mi PC?». Lee tus componentes (procesador y memoria con chrome.system, gráfica con WebGL),
// los requisitos de Steam (appdetails, en inglés) y los compara con una tabla de rendimiento propia y aproximada.
// Las puntuaciones son relativas: gráficas ≈ Time Spy / 100, procesadores ≈ PassMark / 1000. Solo sirven para comparar.

export type PcPart = 'cpu' | 'gpu' | 'ram';

/** Lo que leyó el navegador. */
export interface PcAuto { cpu: string; threads: number; ramGB: number | null; gpu: string; at: number }
/** Lo que corrigió el usuario en Ajustes (vacío = usar lo leído). */
export interface PcManual { cpu?: string; gpu?: string; ramGB?: number }
export interface PcSpecs { cpu: string; gpu: string; ramGB: number | null; threads: number }

export interface Reqs { cpu?: string; gpu?: string; ram?: string }
export interface GameReqs { min: Reqs; rec: Reqs }

export type PartLevel = 'rec' | 'min' | 'below' | 'unknown';
export interface PartCheck { part: PcPart; mine: string; min?: string; rec?: string; level: PartLevel; why?: string }
export type RunLevel = 'yes' | 'tight' | 'no' | 'unknown' | 'nopc';
export interface RunCheck { level: RunLevel; parts: PartCheck[]; integrated: boolean }

/* ---------- requisitos de Steam ---------- */

const decode = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Del HTML de pc_requirements.minimum o .recommended a procesador, memoria y gráfica. */
export function parseReqs(html: string | undefined): Reqs {
  if (!html) return {};
  const text = decode(html.replace(/<br\s*\/?>|<\/li>|<\/p>|<li>/gi, '\n').replace(/<[^>]+>/g, ''));
  const out: Reqs = {};
  for (const raw of text.split('\n')) {
    const m = raw.trim().match(/^(processor|cpu|memory|ram|system memory|graphics|graphics card|video card|video|gpu)\s*\*?\s*:\s*(.+)$/i);
    if (!m) continue;
    const k = m[1].toLowerCase();
    const v = m[2].trim();
    if (/processor|cpu/.test(k)) out.cpu ??= v;
    else if (/memory|ram/.test(k)) out.ram ??= v;
    else out.gpu ??= v;
  }
  return out;
}

/** pc_requirements de appdetails: a veces llega como [] y a veces el mínimo trae también lo recomendado. */
export function gameReqs(pc: any): GameReqs | null {
  if (!pc || Array.isArray(pc)) return null;
  let min = String(pc.minimum ?? '');
  let rec = String(pc.recommended ?? '');
  if (!rec) {
    const at = min.search(/<strong>\s*recommended/i);
    if (at > 0) { rec = min.slice(at); min = min.slice(0, at); }
  }
  const r = { min: parseReqs(min), rec: parseReqs(rec) };
  return r.min.cpu || r.min.gpu || r.min.ram || r.rec.cpu || r.rec.gpu || r.rec.ram ? r : null;
}

/** Memoria pedida, en GB. */
export function ramNeed(s: string | undefined): number | null {
  const m = s?.match(/(\d+(?:[.,]\d+)?)\s*(gb|mb|g\b)/i);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return m[2].toLowerCase() === 'mb' ? n / 1024 : n;
}

/* ---------- la gráfica ---------- */

/** De lo que da WebGL («ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)») al modelo. */
export function cleanGpu(renderer: string): string {
  let s = renderer.trim();
  const angle = s.match(/^ANGLE \((.*)\)$/);
  if (angle) {
    const parts = angle[1].split(',').map((x) => x.trim());
    s = parts.length >= 2 ? parts[1] : parts[0];
  }
  return s.replace(/\(0x[0-9a-f]+\)/gi, '').replace(/\b(Direct3D\d*|vs_\d_\d|ps_\d_\d|D3D\d+|OpenGL.*|Vulkan.*)\b/gi, '').replace(/\((R|TM)\)/gi, '').replace(/\s+/g, ' ').trim();
}

/** El navegador no ve tu gráfica (aceleración apagada o software). */
export const softwareGpu = (s: string) => /swiftshader|llvmpipe|software|microsoft basic render/i.test(s);

const NV: Record<string, number> = {
  'rtx 5090': 480, 'rtx 5080': 320, 'rtx 5070 ti': 280, 'rtx 5070': 220, 'rtx 5060 ti': 165, 'rtx 5060': 140, 'rtx 5050': 105,
  'rtx 4090': 360, 'rtx 4080 super': 285, 'rtx 4080': 280, 'rtx 4070 ti super': 240, 'rtx 4070 ti': 225, 'rtx 4070 super': 205, 'rtx 4070': 178, 'rtx 4060 ti': 135, 'rtx 4060': 105, 'rtx 4050': 85,
  'rtx 3090 ti': 215, 'rtx 3090': 195, 'rtx 3080 ti': 190, 'rtx 3080': 175, 'rtx 3070 ti': 145, 'rtx 3070': 135, 'rtx 3060 ti': 115, 'rtx 3060': 88, 'rtx 3050 ti': 60, 'rtx 3050': 63,
  'rtx 2080 ti': 145, 'rtx 2080 super': 120, 'rtx 2080': 112, 'rtx 2070 super': 105, 'rtx 2070': 92, 'rtx 2060 super': 87, 'rtx 2060': 76,
  'gtx 1660 ti': 63, 'gtx 1660 super': 61, 'gtx 1660': 55, 'gtx 1650 super': 52, 'gtx 1650 ti': 40, 'gtx 1650': 37, 'gtx 1630': 23,
  'gtx 1080 ti': 98, 'gtx 1080': 74, 'gtx 1070 ti': 68, 'gtx 1070': 60, 'gtx 1060': 42, 'gtx 1050 ti': 25, 'gtx 1050': 19, 'gt 1030': 11, 'gt 1010': 6,
  'gtx 980 ti': 55, 'gtx 980': 42, 'gtx 970': 35, 'gtx 960': 23, 'gtx 950': 20, 'gtx 780 ti': 33, 'gtx 780': 28, 'gtx 770': 22, 'gtx 760': 17, 'gtx 750 ti': 15, 'gtx 750': 12,
  'gt 740': 7, 'gt 730': 5, 'gt 720': 3, 'gt 710': 3, 'gtx 690': 25, 'gtx 680': 21, 'gtx 670': 19, 'gtx 660 ti': 15, 'gtx 660': 13, 'gtx 650 ti': 10, 'gtx 650': 7, 'gt 640': 4, 'gt 630': 3,
  'gtx 590': 18, 'gtx 580': 13, 'gtx 570': 11, 'gtx 560 ti': 9, 'gtx 560': 8, 'gtx 550 ti': 6, 'gts 450': 5, 'gtx 480': 11, 'gtx 470': 9, 'gtx 465': 8, 'gtx 460': 7, 'gts 250': 4, 'gtx 285': 5, 'gtx 280': 4.5, 'gtx 275': 4.5, 'gtx 260': 4,
  'mx 570': 24, 'mx 550': 22, 'mx 450': 20, 'mx 350': 13, 'mx 330': 12, 'mx 250': 12, 'mx 230': 9, 'mx 150': 11, 'mx 130': 7, 'mx 110': 5,
};
const AMD: Record<string, number> = {
  'rx 9070 xt': 250, 'rx 9070': 220, 'rx 9060 xt': 145, 'rx 9060': 125,
  'rx 7900 xtx': 300, 'rx 7900 xt': 265, 'rx 7900 gre': 225, 'rx 7800 xt': 200, 'rx 7700 xt': 175, 'rx 7700': 160, 'rx 7600 xt': 112, 'rx 7600': 107,
  'rx 6950 xt': 215, 'rx 6900 xt': 205, 'rx 6800 xt': 190, 'rx 6800': 165, 'rx 6750 xt': 130, 'rx 6700 xt': 125, 'rx 6700': 115, 'rx 6650 xt': 100, 'rx 6600 xt': 97, 'rx 6600': 85, 'rx 6500 xt': 50, 'rx 6400': 38,
  'rx 5700 xt': 95, 'rx 5700': 85, 'rx 5600 xt': 78, 'rx 5600': 70, 'rx 5500 xt': 50, 'rx 5500': 45, 'rx 5300': 40,
  'rx 590': 50, 'rx 580': 45, 'rx 570': 39, 'rx 560': 22, 'rx 550': 14, 'rx 480': 42, 'rx 470': 37, 'rx 460': 21,
  'r9 fury x': 55, 'r9 fury': 50, 'r9 nano': 48, 'r9 390x': 43, 'r9 390': 40, 'r9 380x': 30, 'r9 380': 27, 'r9 290x': 38, 'r9 290': 35, 'r9 285': 25, 'r9 280x': 27, 'r9 280': 24, 'r9 270x': 20, 'r9 270': 18,
  'r7 370': 15, 'r7 360': 12, 'r7 265': 15, 'r7 260x': 12, 'r7 260': 10, 'r7 250': 6, 'r7 240': 4,
  'hd 7990': 40, 'hd 7970': 26, 'hd 7950': 22, 'hd 7870': 18, 'hd 7850': 15, 'hd 7790': 11, 'hd 7770': 9, 'hd 7750': 7,
  'hd 6990': 20, 'hd 6970': 15, 'hd 6950': 13, 'hd 6870': 11, 'hd 6850': 9, 'hd 6790': 8, 'hd 6770': 7, 'hd 6750': 6, 'hd 6670': 4, 'hd 6570': 3,
  'hd 5970': 17, 'hd 5870': 13, 'hd 5850': 11, 'hd 5830': 9, 'hd 5770': 7, 'hd 5750': 6, 'hd 5670': 3.5, 'hd 5570': 2.5,
  'hd 4890': 6, 'hd 4870': 5, 'hd 4850': 4, 'hd 4770': 3.5, 'hd 4670': 2,
  'radeon vii': 88, 'vega 64': 72, 'vega 56': 64,
  '890m': 40, '880m': 35, '780m': 28, '760m': 22, '740m': 14, '680m': 23, '660m': 16, '610m': 6,
  'vega 11': 12, 'vega 10': 10, 'vega 8': 9, 'vega 7': 9, 'vega 6': 7, 'vega 3': 4,
};
const INTEL: Record<string, number> = {
  'arc b580': 135, 'arc b570': 120, 'arc a770': 130, 'arc a750': 120, 'arc a580': 105, 'arc a380': 45, 'arc a310': 30, 'arc a770m': 95, 'arc a730m': 80, 'arc a370m': 35, 'arc 140v': 40, 'arc 130v': 35, 'arc 140t': 38,
  'iris xe': 15, 'iris plus': 10, 'iris pro': 8, 'iris': 6,
  'uhd 770': 7, 'uhd 750': 6, 'uhd 730': 6, 'uhd 710': 4, 'uhd 630': 4.5, 'uhd 620': 3.5, 'uhd 617': 3, 'uhd 615': 2.5, 'uhd 610': 3, 'uhd 605': 1.5, 'uhd 600': 1.5,
  'hd 630': 4.5, 'hd 620': 3.5, 'hd 615': 2.5, 'hd 610': 3, 'hd 530': 4, 'hd 520': 3, 'hd 515': 2, 'hd 510': 2.5, 'hd 6000': 3, 'hd 5600': 3, 'hd 5500': 2.5, 'hd 5000': 2, 'hd 4600': 3, 'hd 4400': 2.5, 'hd 4200': 2, 'hd 4000': 1.8, 'hd 3000': 0.9, 'hd 2500': 1, 'hd 2000': 0.6,
};

type Vendor = 'nvidia' | 'amd' | 'intel';
interface Score { score: number; vendor: Vendor | null; integrated: boolean; vague?: boolean }

const gpuVendor = (s: string): Vendor | null =>
  /nvidia|geforce|\b(rtx|gtx|gts|gt|mx)\s*\d/.test(s) ? 'nvidia' : /amd|radeon|\bati\b|\brx\s*\d|\br[79]\s*\d|vega/.test(s) ? 'amd' : /intel|iris|\buhd\b|\barc\b|hd graphics/.test(s) ? 'intel' : null;

/** Puntuación de una sola gráfica («NVIDIA GeForce GTX 1060 3 GB»). null si no la reconocemos. */
export function gpuScore(name: string): Score | null {
  const s = ` ${name.toLowerCase().replace(/\((r|tm)\)|®|™/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ')} `;
  const v = gpuVendor(s);
  const mobile = /laptop|mobile|max q|notebook/.test(s);
  let m: RegExpMatchArray | null;
  // NVIDIA: RTX 3060 Ti, GTX 960M, MX 450, GT 1030…
  if ((m = s.match(/\b(rtx|gtx|gts|gt|mx)\s*(\d{3,4})\s*(m\b|ti\b|super\b)?\s*(ti\b|super\b)?/))) {
    const suf = [m[3], m[4]].filter((x) => x && x !== 'm').join(' ');
    const n = NV[`${m[1]} ${m[2]}${suf ? ` ${suf}` : ''}`] ?? NV[`${m[1]} ${m[2]}`] ?? NV[`${m[1] === 'gt' ? 'gtx' : 'gt'} ${m[2]}`];
    if (n != null) return { score: n * (m[3] === 'm' ? 0.65 : mobile ? 0.8 : 1), vendor: 'nvidia', integrated: false };
  }
  // GeForce 8800 GT, 9800 GTX: muy viejas.
  if ((m = s.match(/geforce\s*([89])(\d)00/))) return { score: (m[1] === '9' ? 1.5 : 1) * (Number(m[2]) >= 8 ? 2.5 : 0.8), vendor: 'nvidia', integrated: false };
  // AMD: RX 6600 XT, RX 7900 GRE, RX 6800M, R9 390X, HD 7850, Vega 8, 780M.
  if (v !== 'intel') {
    if ((m = s.match(/\brx\s*(\d{3,4})\s*(xtx|xt|gre|m|s)?\b/))) {
      const n = AMD[`rx ${m[1]}${m[2] && !/^(m|s)$/.test(m[2]) ? ` ${m[2]}` : ''}`] ?? AMD[`rx ${m[1]}`];
      if (n != null) return { score: n * (m[2] === 'm' || mobile ? 0.8 : m[2] === 's' ? 0.7 : 1), vendor: 'amd', integrated: false };
    }
    if ((m = s.match(/\br([79])\s*(fury x|fury|nano|\d{3}x?)\b/))) { const n = AMD[`r${m[1]} ${m[2]}`]; if (n != null) return { score: n, vendor: 'amd', integrated: false }; }
    if ((m = s.match(/\bhd\s*(\d{4})\b/)) && v === 'amd') { const n = AMD[`hd ${m[1]}`] ?? (Number(m[1]) >= 7000 ? 8 : Number(m[1]) >= 5000 ? 4 : 1.5); return { score: n, vendor: 'amd', integrated: false }; }
    if (/radeon vii/.test(s)) return { score: AMD['radeon vii'], vendor: 'amd', integrated: false };
    if ((m = s.match(/vega\s*(\d{1,2})\b/))) { const n = AMD[`vega ${m[1]}`]; if (n != null) return { score: n, vendor: 'amd', integrated: Number(m[1]) < 20 }; }
    if ((m = s.match(/radeon\s*(\d{3})m\b/))) { const n = AMD[`${m[1]}m`]; if (n != null) return { score: n, vendor: 'amd', integrated: true }; }
    if (v === 'amd' && /radeon\s*(tm\s*)?graphics\s*$|radeon graphics/.test(s)) return { score: 10, vendor: 'amd', integrated: true };
  }
  // Intel: Arc A770, Iris Xe, UHD 630, HD 4000, «Intel(R) UHD Graphics».
  if (v === 'intel' || v === null) {
    if ((m = s.match(/\barc\s*([ab]\d{3}m?|\d{3}[vt])\b/))) { const n = INTEL[`arc ${m[1]}`]; if (n != null) return { score: n, vendor: 'intel', integrated: /\d{3}[vt]/.test(m[1]) }; }
    if (/\barc\b/.test(s) && v === 'intel') return { score: 35, vendor: 'intel', integrated: true };
    if ((m = s.match(/iris\s*(xe|plus|pro)?/))) return { score: INTEL[m[1] ? `iris ${m[1]}` : 'iris'], vendor: 'intel', integrated: true };
    if ((m = s.match(/\b(uhd|hd)\s*(?:graphics\s*)?(\d{3,4})\b/))) {
      const n = INTEL[`${m[1]} ${m[2]}`] ?? INTEL[`${m[1] === 'uhd' ? 'hd' : 'uhd'} ${m[2]}`];
      if (n != null) return { score: n, vendor: 'intel', integrated: true };
    }
    if (/\buhd\b/.test(s)) return { score: 4, vendor: 'intel', integrated: true };
    if (/intel.*hd|hd graphics/.test(s)) return { score: 1.5, vendor: 'intel', integrated: true };
  }
  return null;
}

/** Lo que pide un juego sin decir modelo: «tarjeta DirectX 11 con 2 GB», «integrada». */
function vagueGpu(s: string): Score | null {
  const l = s.toLowerCase();
  const vram = l.match(/(\d+(?:[.,]\d+)?)\s*(gb|mb)/);
  if (vram) {
    const gb = Number(vram[1].replace(',', '.')) / (vram[2] === 'mb' ? 1024 : 1);
    const score = gb >= 8 ? 60 : gb >= 6 ? 42 : gb >= 4 ? 30 : gb >= 3 ? 20 : gb >= 2 ? 12 : gb >= 1 ? 5 : 2;
    return { score, vendor: null, integrated: false, vague: true };
  }
  if (/integrated|onboard/.test(l)) return { score: 1.5, vendor: null, integrated: true, vague: true };
  const dx = l.match(/directx\s*(\d+)|dx\s*(\d+)/);
  if (dx) { const n = Number(dx[1] ?? dx[2]); return { score: n >= 12 ? 8 : n >= 11 ? 4 : n >= 10 ? 2 : 1, vendor: null, integrated: false, vague: true }; }
  return null;
}

/* ---------- el procesador ---------- */

// Intel Core i3/i5/i7/i9 de sobremesa por generación (≈ PassMark / 1000).
const CORE: Record<string, number[]> = {
  //   gen: 1    2    3    4    5    6    7    8    9    10   11   12   13   14
  i3: [0, 2.0, 1.8, 2.1, 3.0, 3.2, 3.6, 4.0, 6.0, 6.3, 8.5, 9.5, 14, 15, 16],
  i5: [0, 3.3, 3.9, 4.6, 5.2, 5.6, 6.3, 6.8, 9.2, 9.6, 12.5, 17, 19.5, 24, 26],
  i7: [0, 4.5, 5.3, 6.2, 7.1, 7.5, 8.9, 9.6, 13.5, 14.5, 17.5, 20.5, 29, 34, 36],
  i9: [0, 9, 9, 9, 9, 9, 9, 13, 16, 18.5, 23.5, 24, 41, 52, 55],
};
// Ryzen 3/5/7/9 por serie (primer número del modelo).
const RYZEN: Record<string, Record<number, number>> = {
  3: { 1: 6.5, 2: 7.5, 3: 11.5, 4: 11, 5: 13, 7: 16, 8: 17, 9: 18 },
  5: { 1: 12, 2: 13, 3: 17.8, 4: 16, 5: 21.5, 7: 28, 8: 22, 9: 30 },
  7: { 1: 15, 2: 17, 3: 22.7, 4: 20, 5: 27, 7: 35, 8: 30, 9: 37 },
  9: { 3: 32, 5: 39, 7: 52, 9: 56 },
};

const mobileFactor = (suf: string) => /^(u|y|g\d|e)$/.test(suf) ? 0.6 : /^p$/.test(suf) ? 0.75 : /^(h|hq|hk|hs|h45)$/.test(suf) ? 0.85 : /^t$/.test(suf) ? 0.8 : 1;
const cpuVendor = (s: string): Vendor | null => /intel|\bcore\b|\bi[3579]\b|pentium|celeron|xeon/.test(s) ? 'intel' : /amd|ryzen|\bfx\b|athlon|phenom|\ba(4|6|8|10|12)\b/.test(s) ? 'amd' : null;

/** Puntuación de un solo procesador («Intel Core i5-8400», «AMD Ryzen 5 5600X 6-Core Processor»). */
export function cpuScore(name: string): Score | null {
  const s = ` ${name.toLowerCase().replace(/\((r|tm)\)|®|™/g, ' ').replace(/\s+/g, ' ')} `;
  const v = cpuVendor(s);
  let m: RegExpMatchArray | null;
  const out = (score: number, vendor: Vendor, vague = false): Score => ({ score, vendor, integrated: false, vague });
  // Intel Core iN-GGxxx / iN-Gxxx / iN-xxx (1.ª gen) / iN-1035G1 (portátil 10.ª-13.ª).
  if ((m = s.match(/\bi([3579])\s*[- ]?\s*(\d{3,5})([a-z]{0,2}\d?)\b/))) {
    const d = m[2];
    const gen = d.length === 5 ? Number(d.slice(0, 2)) : d.length === 3 ? 1 : d[0] === '1' ? Number(d.slice(0, 2)) : Number(d[0]);
    const row = CORE[`i${m[1]}`];
    const g = Math.min(14, Math.max(1, gen));
    // Los de 4 cifras que empiezan por 1 (1035G1, 1235U) son de portátil aunque no lleven letra conocida.
    const f = d.length === 4 && d[0] === '1' ? Math.min(0.75, mobileFactor(m[3])) : mobileFactor(m[3]);
    return out(row[g] * f, 'intel');
  }
  if ((m = s.match(/ultra\s*([579])\s*(\d)(\d{2})([a-z]*)/))) {
    const base = m[2] === '2' && /^k?f?$/.test(m[4]) ? { 5: 43, 7: 59, 9: 67 } : { 5: 21, 7: 26, 9: 30 };
    return out(base[Number(m[1]) as 5 | 7 | 9] * (/^(u|v)$/.test(m[4]) ? 0.65 : 1), 'intel');
  }
  // «Intel Core i5» a secas, o «Core i5 4th generation».
  if ((m = s.match(/\bi([3579])\b/)) && v === 'intel') {
    const g = s.match(/(\d{1,2})\s*(st|nd|rd|th)\s*gen/);
    return out(CORE[`i${m[1]}`][g ? Math.min(14, Number(g[1])) : 2], 'intel', !g);
  }
  if ((m = s.match(/ryzen\s*ai\s*([579])\s*(?:hx\s*)?(?:pro\s*)?(\d{3})/))) return out({ 5: 25, 7: 30, 9: 35 }[Number(m[1]) as 5 | 7 | 9], 'amd');
  if ((m = s.match(/ryzen\s*(?:threadripper\s*)?([3579])\s*(?:pro\s*)?(\d)(\d{3})([a-z]*\d?d?)/))) {
    const t = RYZEN[m[1]];
    const series = Number(m[2]);
    const suf = m[4].replace(/x3d$/, 'x');
    // Los de portátil de las series 2 y 3 son un paso más viejos que los de sobremesa del mismo número.
    const mob = /^(u|h|hs|hx)$/.test(suf);
    const key = mob && (series === 2 || series === 3) ? series - 1 : series;
    const n = t[key] ?? t[series] ?? Object.values(t)[0];
    return out(n * (suf === 'hx' ? 1 : suf === 'g' || suf === 'ge' ? 0.9 : mobileFactor(suf)), 'amd');
  }
  if ((m = s.match(/ryzen\s*([3579])\b/))) return out(RYZEN[m[1]][1] ?? 12, 'amd', true);
  if ((m = s.match(/\bfx\s*[- ]?\s*(\d)(\d{3})/))) return out({ 4: 3.4, 6: 4.7, 8: 6, 9: 7 }[Number(m[1]) as 4] ?? 4, 'amd');
  if ((m = s.match(/phenom\s*(ii\s*)?x(\d)/))) return out({ 2: 1.5, 3: 2, 4: 3, 6: 4.5 }[Number(m[2]) as 2] ?? 2, 'amd');
  if ((m = s.match(/athlon\s*(ii\s*)?x(\d)/))) return out(Number(m[2]) >= 4 ? 2.5 : 1.3, 'amd');
  if (/athlon\s*(silver|gold|\d{3,4}g)/.test(s)) return out(4.5, 'amd');
  if ((m = s.match(/\ba(4|6|8|10|12)\s*[- ]?\s*\d{4}/))) return out({ 4: 1.5, 6: 2, 8: 3.5, 10: 4, 12: 3 }[Number(m[1]) as 4], 'amd');
  if ((m = s.match(/core\s*(?:tm\s*)?2\s*(duo|quad|extreme)/))) return out(m[1] === 'quad' ? 3 : m[1] === 'extreme' ? 2.5 : 1.3, 'intel');
  if ((m = s.match(/xeon.*?e([357])\s*[- ]?\s*\d{4}\s*v(\d)/))) return out(m[1] === '3' ? CORE.i7[Math.min(7, Number(m[2]) + 1)] : 8 + Number(m[2]) * 2, 'intel');
  if ((m = s.match(/pentium\s*(?:gold\s*)?g?(\d{4})/))) return out(Number(m[1]) >= 5000 ? 5.5 : Number(m[1]) >= 4500 ? 4.8 : 3.5, 'intel');
  if (/pentium\s*4|celeron d/.test(s)) return out(0.4, 'intel');
  if (/pentium|celeron/.test(s)) return out(/dual/.test(s) ? 1 : 1.5, 'intel');
  return null;
}

/** Lo que pide un juego sin decir modelo: «Quad-core 2.5 GHz», «Dual Core 2.4GHz». */
function vagueCpu(s: string): Score | null {
  const l = s.toLowerCase();
  const ghz = l.match(/(\d(?:[.,]\d+)?)\s*ghz/);
  const cores = /octa|eight|8[\s-]*core/.test(l) ? 8 : /hexa|six|6[\s-]*core/.test(l) ? 6 : /quad|four|4[\s-]*core/.test(l) ? 4 : /dual|two|2[\s-]*core/.test(l) ? 2 : /single/.test(l) ? 1 : 0;
  if (!ghz && !cores) return null;
  const g = ghz ? Number(ghz[1].replace(',', '.')) : 2.5;
  return { score: (cores || 2) * g * 0.45, vendor: null, integrated: false, vague: true };
}

/* ---------- requisito con varias opciones ---------- */

/** «GTX 1060 or RX 580», «i5-8400 | Ryzen 3 3300X», «RX 5700/6600»: la opción de tu marca si la hay; si no, la más fácil. */
export function needScore(req: string | undefined, part: 'cpu' | 'gpu', mineVendor: Vendor | null): Score | null {
  if (!req) return null;
  const parts = req.split(/\s+or\s+|\s*\|\s*|\s*\/\s*|\s*;\s*|,\s+(?=(?:amd|intel|nvidia|ati|radeon|geforce)\b)/i);
  const scores: Score[] = [];
  let prefix = '';
  for (let p of parts) {
    // «RX 5700/6600»: la segunda hereda la serie de la primera.
    if (/^\s*\d{3,4}\b/.test(p) && prefix) p = `${prefix} ${p}`;
    const sc = part === 'gpu' ? gpuScore(p) : cpuScore(p);
    const pm = p.toLowerCase().match(part === 'gpu' ? /\b(rtx|gtx|gt|rx|r9|r7|hd)\b/ : /\b(i[3579]|ryzen\s*[3579])\b/);
    if (pm) prefix = pm[1];
    if (sc) scores.push(sc);
  }
  if (!scores.length) {
    const vg = part === 'gpu' ? vagueGpu(req) : vagueCpu(req);
    return vg;
  }
  const same = scores.filter((x) => x.vendor && x.vendor === mineVendor);
  const pool = same.length ? same : scores;
  return pool.reduce((a, b) => (b.score < a.score ? b : a));
}

/* ---------- el veredicto ---------- */

const LABEL: Record<PcPart, string> = { cpu: 'Procesador', gpu: 'Gráfica', ram: 'Memoria' };
export const partLabel = (p: PcPart) => LABEL[p];

/** Lo leído con lo corregido encima. */
export function effectiveSpecs(auto: PcAuto | null | undefined, manual: PcManual | null | undefined): PcSpecs {
  return {
    cpu: manual?.cpu?.trim() || auto?.cpu || '',
    gpu: manual?.gpu?.trim() || auto?.gpu || '',
    ramGB: manual?.ramGB ?? auto?.ramGB ?? null,
    threads: auto?.threads ?? 0,
  };
}

/** chrome.system.memory da un poco menos de lo que tienes instalado (15,9 por 16). */
export const ramFromBytes = (b: number) => {
  const gb = b / 1024 ** 3;
  const common = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128];
  return common.find((c) => gb <= c && gb >= c * 0.85) ?? Math.round(gb);
};

// Margen por ser una tabla aproximada: un 15 % por debajo del mínimo aún cuenta como «justo».
const TOL_MIN = 0.85, TOL_REC = 0.9;

function levelFor(mine: number, min: number | null, rec: number | null): PartLevel {
  if (min != null && mine < min * TOL_MIN) return 'below';
  if (rec != null ? mine >= rec * TOL_REC : min != null && mine >= min * 1.5) return 'rec';
  return 'min';
}

export function canRun(pc: PcSpecs, reqs: GameReqs | null): RunCheck {
  const integrated = !!(pc.gpu && gpuScore(pc.gpu)?.integrated);
  if (!pc.cpu && !pc.gpu && pc.ramGB == null) return { level: 'nopc', parts: [], integrated };
  if (!reqs) return { level: 'unknown', parts: [], integrated };
  const parts: PartCheck[] = [];
  for (const part of ['gpu', 'cpu'] as const) {
    const min = reqs.min[part], rec = reqs.rec[part];
    if (!min && !rec) continue;
    const mineName = pc[part];
    const mine = mineName && !(part === 'gpu' && softwareGpu(mineName)) ? (part === 'gpu' ? gpuScore(mineName) : cpuScore(mineName)) : null;
    const base: PartCheck = { part, mine: mineName, min, rec, level: 'unknown' };
    if (!mine) { parts.push({ ...base, why: mineName ? `No reconocemos ${part === 'gpu' ? 'tu gráfica' : 'tu procesador'}` : `No sabemos ${part === 'gpu' ? 'tu gráfica' : 'tu procesador'}` }); continue; }
    const nMin = needScore(min, part, mine.vendor), nRec = needScore(rec, part, mine.vendor);
    if (!nMin && !nRec) { parts.push({ ...base, why: 'No entendemos lo que pide' }); continue; }
    parts.push({ ...base, level: levelFor(mine.score, nMin?.score ?? null, nRec?.score ?? null) });
  }
  const minR = ramNeed(reqs.min.ram), recR = ramNeed(reqs.rec.ram);
  if (minR != null || recR != null) {
    const base: PartCheck = { part: 'ram', mine: pc.ramGB != null ? `${pc.ramGB} GB` : '', min: reqs.min.ram, rec: reqs.rec.ram, level: 'unknown' };
    if (pc.ramGB == null) parts.push({ ...base, why: 'No sabemos cuánta memoria tienes' });
    else {
      const r = pc.ramGB + 0.25;
      parts.push({ ...base, level: minR != null && r < minR ? 'below' : recR != null ? (r >= recR ? 'rec' : 'min') : minR != null && pc.ramGB >= minR * 2 ? 'rec' : 'min' });
    }
  }
  const known = parts.filter((p) => p.level !== 'unknown');
  // Sin saber la gráfica no se puede decir que sí: es lo que más pesa en casi todos los juegos.
  const gpuUnknown = parts.some((p) => p.part === 'gpu' && p.level === 'unknown');
  const level: RunLevel = !known.length ? 'unknown' : known.some((p) => p.level === 'below') ? 'no' : gpuUnknown ? 'unknown' : known.every((p) => p.level === 'rec') ? 'yes' : 'tight';
  return { level, parts, integrated };
}

/* ---------- lectura en la página (WebGL) ---------- */

/** El nombre de la gráfica que usa el navegador. Vacío si no se puede leer. */
export function detectGpu(doc: Document = document): string {
  try {
    const c = doc.createElement('canvas');
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const raw = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return cleanGpu(raw);
  } catch {
    return '';
  }
}
