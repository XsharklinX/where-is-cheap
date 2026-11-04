import { describe, expect, it } from 'vitest';
import { canRun, cleanGpu, cpuScore, effectiveSpecs, gameReqs, GPU_CATALOG, gpuScore, needScore, parseReqs, ramFromBytes, ramNeed } from '../lib/pc';

const MIN = '<strong>Minimum:</strong><br><ul class="bb_ul"><li>Requires a 64-bit processor and operating system<br></li><li><strong>OS *:</strong> Windows 10<br></li><li><strong>Processor:</strong> Intel Core i5-8400 | AMD Ryzen 3 3300X<br></li><li><strong>Memory:</strong> 12 GB RAM<br></li><li><strong>Graphics:</strong> NVIDIA GeForce GTX 1060 3 GB or AMD Radeon RX 580 4 GB<br></li><li><strong>DirectX:</strong> Version 12<br></li></ul>';
const REC = '<strong>Recommended:</strong><br><ul class="bb_ul"><li><strong>Processor:</strong> Intel Core i7-8700K | AMD Ryzen 5 3600X<br></li><li><strong>Memory:</strong> 16 GB RAM<br></li><li><strong>Graphics:</strong> NVIDIA GeForce GTX 1070 8 GB or AMD Radeon RX VEGA 56 8 GB<br></li></ul>';

describe('requisitos de Steam', () => {
  it('lee procesador, memoria y gráfica', () => {
    expect(parseReqs(MIN)).toEqual({ cpu: 'Intel Core i5-8400 | AMD Ryzen 3 3300X', ram: '12 GB RAM', gpu: 'NVIDIA GeForce GTX 1060 3 GB or AMD Radeon RX 580 4 GB' });
  });
  it('separa lo recomendado si viene dentro del mínimo, y [] es sin requisitos', () => {
    const r = gameReqs({ minimum: MIN + REC });
    expect(r?.min.ram).toBe('12 GB RAM');
    expect(r?.rec.ram).toBe('16 GB RAM');
    expect(gameReqs([])).toBeNull();
    expect(gameReqs({ minimum: '<p>Windows XP</p>' })).toBeNull();
  });
  it('formato viejo con <br> y entidades', () => {
    expect(parseReqs('<p><strong>Minimum:</strong><br>OS: XP<br>Processor: 2.0&nbsp;GHz<br>Memory: 512 MB RAM<br>Graphics: DirectX 9 card</p>')).toEqual({ cpu: '2.0 GHz', ram: '512 MB RAM', gpu: 'DirectX 9 card' });
  });
  it('memoria en GB', () => {
    expect(ramNeed('8 GB RAM')).toBe(8);
    expect(ramNeed('8192 MB RAM')).toBe(8);
    expect(ramNeed('lots')).toBeNull();
  });
});

describe('la gráfica', () => {
  it('limpia lo que da WebGL', () => {
    expect(cleanGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU (0x00002560) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('NVIDIA GeForce RTX 3060 Laptop GPU');
    expect(cleanGpu('ANGLE (Intel, Intel(R) UHD Graphics 630 (0x00003E92) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('Intel UHD Graphics 630');
  });
  it('reconoce modelos de las tres marcas', () => {
    const s = (x: string) => gpuScore(x)?.score;
    expect(s('NVIDIA GeForce RTX 3060 Ti')).toBe(115);
    expect(s('GeForce RTX 3060Ti')).toBe(115);
    expect(s('NVIDIA GeForce GTX 1660 SUPER')).toBe(61);
    expect(s('GTX 960M')).toBeCloseTo(23 * 0.65);
    expect(s('NVIDIA GeForce RTX 3060 Laptop GPU')).toBeCloseTo(88 * 0.8);
    expect(s('AMD Radeon RX 6600 XT')).toBe(97);
    expect(s('AMD Radeon RX 7900 XTX')).toBe(300);
    expect(s('Radeon RX Vega 56')).toBe(64);
    expect(s('AMD Radeon R9 290X')).toBe(38);
    expect(s('ATI Radeon HD 5870')).toBe(13);
    expect(s('AMD Radeon(TM) Graphics')).toBe(10);
    expect(s('AMD Radeon 780M')).toBe(28);
    expect(s('Intel Arc A770')).toBe(130);
    expect(s('Intel Iris Xe Graphics')).toBe(15);
    expect(s('Intel UHD Graphics 630')).toBe(4.5);
    expect(s('Intel HD Graphics 4000')).toBe(1.8);
    expect(s('NVIDIA GeForce 8800 GT')).toBeGreaterThan(1);
    expect(gpuScore('Intel UHD Graphics 630')?.integrated).toBe(true);
    expect(gpuScore('Google SwiftShader')).toBeNull();
  });
  it('el catálogo se puede elegir y se reconoce', () => {
    expect(GPU_CATALOG).toContain('NVIDIA GeForce GTX 1080');
    expect(GPU_CATALOG).toContain('AMD Radeon RX 6600 XT');
    expect(GPU_CATALOG).toContain('Intel UHD Graphics 630');
    expect(gpuScore('NVIDIA GeForce GTX 1080')?.score).toBe(74);
    expect(gpuScore('AMD Radeon RX 6600 XT')?.score).toBe(97);
  });
  it('varias opciones: la de tu marca, o la más fácil', () => {
    const req = 'NVIDIA GeForce GTX 1060 3 GB or AMD Radeon RX 580 4 GB';
    expect(needScore(req, 'gpu', 'amd')?.score).toBe(45);
    expect(needScore(req, 'gpu', 'nvidia')?.score).toBe(42);
    expect(needScore(req, 'gpu', 'intel')?.score).toBe(42);
    expect(needScore('AMD Radeon RX 5700/6600', 'gpu', 'amd')?.score).toBe(85);
    expect(needScore('DirectX 11 compatible card with 2 GB VRAM', 'gpu', 'nvidia')?.vague).toBe(true);
  });
});

describe('el procesador', () => {
  const s = (x: string) => cpuScore(x)?.score;
  it('Intel por generación y tipo', () => {
    expect(s('Intel(R) Core(TM) i7-10700K CPU @ 3.80GHz')).toBe(17.5);
    expect(s('12th Gen Intel(R) Core(TM) i5-12400F')).toBe(19.5);
    expect(s('Intel Core i5-8400')).toBe(9.2);
    expect(s('Intel(R) Core(TM) i5-1035G1 CPU @ 1.00GHz')).toBeCloseTo(12.5 * 0.6);
    expect(s('Intel Core i7-12700H')).toBeCloseTo(29 * 0.85);
    expect(s('Intel Core i5-750')).toBe(3.3);
    expect(s('Intel(R) Core(TM) Ultra 7 155H')).toBe(26);
    expect(s('Intel(R) Core(TM)2 Quad CPU Q6600 @ 2.40GHz')).toBe(3);
    expect(cpuScore('Intel Core i5')?.vague).toBe(true);
  });
  it('AMD', () => {
    expect(s('AMD Ryzen 5 5600X 6-Core Processor')).toBe(21.5);
    expect(s('AMD Ryzen 7 5800X3D 8-Core Processor')).toBe(27);
    expect(s('AMD Ryzen 3 3300X')).toBe(11.5);
    expect(s('AMD Ryzen 5 3500U with Radeon Vega Mobile Gfx')).toBeCloseTo(13 * 0.6);
    expect(s('AMD FX(tm)-8350 Eight-Core Processor')).toBe(6);
    expect(s('AMD Phenom II X4 965')).toBe(3);
  });
  it('requisitos sin modelo', () => {
    expect(needScore('Quad-core Intel or AMD, 2.5 GHz or faster', 'cpu', 'intel')?.score).toBeCloseTo(4.5);
    expect(needScore('Intel Core i5-8400 | AMD Ryzen 3 3300X', 'cpu', 'amd')?.score).toBe(11.5);
    expect(needScore('Intel Core i5-4670K or AMD equivalent', 'cpu', 'amd')?.score).toBe(5.2);
  });
});

describe('¿lo corre?', () => {
  const reqs = gameReqs({ minimum: MIN, recommended: REC });
  const pc = (cpu: string, gpu: string, ramGB: number | null) => ({ cpu, gpu, ramGB, threads: 8 });
  it('sí, justo y no', () => {
    expect(canRun(pc('AMD Ryzen 5 5600X 6-Core Processor', 'NVIDIA GeForce RTX 3060', 16), reqs).level).toBe('yes');
    const tight = canRun(pc('AMD Ryzen 5 5600X 6-Core Processor', 'NVIDIA GeForce GTX 1060 6GB', 16), reqs);
    expect(tight.level).toBe('tight');
    expect(tight.parts.find((p) => p.part === 'gpu')?.level).toBe('min');
    const no = canRun(pc('Intel Core i5-8400', 'Intel UHD Graphics 630', 8), reqs);
    expect(no.level).toBe('no');
    expect(no.parts.filter((p) => p.level === 'below').map((p) => p.part)).toEqual(['gpu', 'ram']);
    expect(no.integrated).toBe(true);
  });
  it('sin saber la gráfica no dice que sí', () => {
    expect(canRun(pc('AMD Ryzen 5 5600X', 'Google SwiftShader', 32), reqs).level).toBe('unknown');
    expect(canRun(pc('', '', null), reqs).level).toBe('nopc');
    expect(canRun(pc('AMD Ryzen 5 5600X', 'NVIDIA GeForce RTX 3060', 16), null).level).toBe('unknown');
  });
  it('lo corregido en Ajustes manda, y la memoria se redondea', () => {
    expect(effectiveSpecs({ cpu: 'A', gpu: 'Intel UHD Graphics 630', ramGB: 16, threads: 8, at: 0 }, { gpu: 'RTX 3060 ' }).gpu).toBe('RTX 3060');
    expect(ramFromBytes(15.86 * 1024 ** 3)).toBe(16);
    expect(ramFromBytes(7.9 * 1024 ** 3)).toBe(8);
  });
});
