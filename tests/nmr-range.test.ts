import { describe, expect, it } from 'vitest';
import { rangeFor } from '../src/ui/nmr-settings';

describe('NMR spectrum ranges', () => {
  it('draws 1H from -0.5 to 10 ppm and 13C from -5 to 200 ppm by default', () => {
    expect(rangeFor('1H', [1.2, 7.3])).toEqual({ lo: -0.5, hi: 10 });
    expect(rangeFor('13C', [14, 170])).toEqual({ lo: -5, hi: 200 });
  });

  it('widens the range to take in a peak past either end', () => {
    expect(rangeFor('1H', [12.1]).hi).toBeGreaterThan(12.1);
    expect(rangeFor('1H', [-1.3]).lo).toBeLessThan(-1.3);
    expect(rangeFor('13C', [205.4]).hi).toBeGreaterThanOrEqual(210);
    expect(rangeFor('13C', [-8]).lo).toBeLessThanOrEqual(-10);
  });
});
