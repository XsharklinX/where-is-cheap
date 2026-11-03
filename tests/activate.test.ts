import { describe, expect, it } from 'vitest';
import { activationURL, findKeys } from '../lib/activate';

describe('claves de Steam (1.3, fase D, idea 5)', () => {
  it('encuentra claves de 3 y 5 grupos', () => {
    expect(findKeys('Tu clave es ABCDE-FGHIJ-KLMNO. Disfruta.')).toEqual(['ABCDE-FGHIJ-KLMNO']);
    expect(findKeys('ABCDE-FGHIJ-KLMNO-PQRST-UVWXY')).toEqual(['ABCDE-FGHIJ-KLMNO-PQRST-UVWXY']);
  });
  it('normaliza minúsculas y quita repetidas', () => {
    expect(findKeys('abcde-fghij-klmno y ABCDE-FGHIJ-KLMNO')).toEqual(['ABCDE-FGHIJ-KLMNO']);
  });
  it('ignora lo que no es una clave', () => {
    expect(findKeys('ABCDE-FGHIJ-KLM')).toEqual([]);
    expect(findKeys('ABCDE-FGHIJ-KLMNO-PQRST')).toEqual([]); // 4 grupos: no es clave de Steam
    expect(findKeys('ABCDE-FGHIJ-KLMNO-PQRST-UVWXY-ZABCD')).toEqual([]); // 6 grupos
    expect(findKeys('2026-11-03 nada')).toEqual([]);
  });
  it('varias claves, en el orden en que salen', () => {
    expect(findKeys('ABCDE-FGHIJ-KLMNO y 12345-67890-ABCDE')).toEqual(['ABCDE-FGHIJ-KLMNO', '12345-67890-ABCDE']);
  });
  it('la URL de activación lleva la clave', () => {
    expect(activationURL('ABCDE-FGHIJ-KLMNO')).toBe('https://store.steampowered.com/account/registerkey?key=ABCDE-FGHIJ-KLMNO');
  });
});
