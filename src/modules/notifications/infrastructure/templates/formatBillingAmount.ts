export function formatBillingAmount(amountInCents: number, currency: string): string {
  if (currency.toLowerCase() !== 'brl' || !Number.isSafeInteger(amountInCents) || amountInCents < 0) {
    throw new Error('INVALID_NOTIFICATION_AMOUNT');
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amountInCents / 100);
}
