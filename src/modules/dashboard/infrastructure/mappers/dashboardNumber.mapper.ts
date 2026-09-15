import { DashboardError } from '../../domain/errors/dashboard.error.js';

export function toDashboardNumber(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new DashboardError('DASHBOARD_VALUE_OUT_OF_RANGE');
  }

  const number = BigInt(value);

  if (number > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new DashboardError('DASHBOARD_VALUE_OUT_OF_RANGE');
  }

  return Number(number);
}
