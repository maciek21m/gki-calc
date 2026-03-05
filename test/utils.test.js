import { describe, it, expect } from 'vitest';
import { calculateGKI, mgdlToMmoll, mmollToMgdl } from './app-utils.js';

describe('GKI utilities', () => {
  it('converts mg/dL to mmol/L', () => {
    expect(mgdlToMmoll(180)).toBeCloseTo(10);
  });

  it('converts mmol/L to mg/dL', () => {
    expect(mmollToMgdl(5)).toBeCloseTo(90);
  });

  it('calculates GKI correctly for mg/dL input', () => {
    const gki = calculateGKI(90, 'mgdL', 1.5);
    expect(gki).toBeCloseTo(3.33, 2);
  });

  it('calculates GKI correctly for mmol/L input', () => {
    const gki = calculateGKI(5, 'mmolL', 1.5); // 5 mmol/L glucose -> 5 * 1.5 = 7.5
    expect(gki).toBeCloseTo(7.5, 2);
  });

  it('returns null for invalid input', () => {
    expect(calculateGKI('', 'mgdL', '')).toBeNull();
    expect(calculateGKI(100, 'mgdL', 0)).toBeNull();
  });
});
