import { describe, expect, it } from 'vitest';

import { toDashboardNumber } from './dashboardNumber.mapper.js';

describe('dashboard aggregate numeric boundaries', () => {
  it.each(['0', '1', '00012', '9007199254740991'])('converts safe nonnegative integer %s exactly', (value) => {
    expect(toDashboardNumber(value)).toBe(Number(value));
  });

  it.each(['', '-1', '1.5', '1e3', 'NaN', ' 2 ', '9007199254740992', '999999999999999999999999999'])('rejects an unsafe or malformed aggregate %s', (value) => {
    expect(() => toDashboardNumber(value)).toThrow('DASHBOARD_VALUE_OUT_OF_RANGE');
  });
});
