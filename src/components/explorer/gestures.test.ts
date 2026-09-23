import { describe, expect, it } from 'vitest';
import { dragIndex, releaseIndex } from './gestures';
describe('physical inspection gestures', () => {
  it('uses explicit mouse and touch distances', () => {
    expect(dragIndex(0, 0, 99, 100, 2)).toBe(0);
    expect(dragIndex(0, 0, 100, 100, 2)).toBe(1);
    expect(dragIndex(0, 0, 64, 64, 2)).toBe(1);
    expect(dragIndex(0, 0, 200, 100, 3)).toBe(2);
  });
  it('keeps a 30 percent hysteresis band and allows reversal', () => {
    expect(dragIndex(0, 1, 90, 100, 2)).toBe(1);
    expect(dragIndex(0, 1, 71, 100, 2)).toBe(1);
    expect(dragIndex(0, 1, 69, 100, 2)).toBe(0);
    expect(dragIndex(1, 1, -100, 100, 2)).toBe(0);
    expect(dragIndex(1, 0, -80, 100, 2)).toBe(0);
    expect(dragIndex(1, 0, -69, 100, 2)).toBe(1);
  });
  it('recognizes short intentional flicks in both directions', () => {
    expect(releaseIndex(0, 0, 20, .8, 20, 2)).toBe(1);
    expect(releaseIndex(1, 1, -20, -.8, 20, 2)).toBe(0);
  });
  it('rejects jitter, slow release and a stale flick', () => {
    expect(releaseIndex(0, 0, 10, 2, 5, 2)).toBe(0);
    expect(releaseIndex(0, 0, 30, .2, 5, 2)).toBe(0);
    expect(releaseIndex(0, 0, 30, 2, 150, 2)).toBe(0);
  });
  it('never invents another angle or wraps at the ends', () => {
    expect(dragIndex(0, 0, -900, 100, 2)).toBe(0);
    expect(dragIndex(0, 0, 900, 100, 2)).toBe(1);
    expect(releaseIndex(1, 1, 100, 3, 5, 2)).toBe(1);
  });
});
