import { describe, expect, it } from 'vitest';
import { averagePay, payShort } from './useCityData.ts';

describe('averagePay', () => {
  it('averages only jobs that state a positive minimum', () => {
    expect(averagePay([{ stipendMinMonthlyInr: 10000 }, { stipendMinMonthlyInr: 20000 }, { stipendMinMonthlyInr: null }, { stipendMinMonthlyInr: 0 }])).toBe(15000);
  });
  it('is null when nobody states pay', () => {
    expect(averagePay([])).toBeNull();
    expect(averagePay([{ stipendMinMonthlyInr: null }])).toBeNull();
  });
});

describe('payShort', () => {
  it('writes thousands', () => {
    expect(payShort(24600)).toBe('₹25k');
    expect(payShort(null)).toBe('—');
  });
});
