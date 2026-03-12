import { describe, expect, it } from 'vitest';
import { formatPercent, monthTitle, shortMonth, todayIsoDate, OUTCOME_ORDER, OUTCOME_META } from '../lib/outcomes';

describe('month labels', () => {
  it('turns a month key into a short label', () => {
    expect(shortMonth('2026-03')).toBe('Mar');
    expect(shortMonth('2025-12')).toBe('Dec');
  });

  it('falls back to the raw key when it is not a month', () => {
    expect(shortMonth('garbage')).toBe('garbage');
  });

  it('spells out month and year for tooltips', () => {
    expect(monthTitle('2026-11')).toBe('Nov 2026');
  });
});

describe('formatPercent', () => {
  it('rounds a share to a whole percentage', () => {
    expect(formatPercent(0.4865)).toBe('49%');
    expect(formatPercent(1)).toBe('100%');
  });

  it('shows a dash for a share that cannot be computed', () => {
    expect(formatPercent(Number.NaN)).toBe('-');
    expect(formatPercent(Infinity)).toBe('-');
  });
});

describe('todayIsoDate', () => {
  it('uses the local calendar day, zero padded', () => {
    expect(todayIsoDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});

describe('outcome metadata', () => {
  it('describes every outcome the API can return', () => {
    expect(OUTCOME_ORDER).toEqual(['improved', 'stable', 'declined']);
    OUTCOME_ORDER.forEach((key) => {
      expect(OUTCOME_META[key].label).toBeTruthy();
      expect(OUTCOME_META[key].color).toMatch(/^var\(--state-/);
    });
  });
});
