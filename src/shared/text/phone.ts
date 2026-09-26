export function normalizeBrazilianPhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');

  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2);
  }

  return digits;
}

export function isValidBrazilianPhone(phone: string): boolean {
  const trimmed = phone.trim();

  if (!trimmed || !/^\+?[\d\s().-]+$/.test(trimmed)) {
    return false;
  }

  const digits = normalizeBrazilianPhone(trimmed);

  if (digits.length !== 10 && digits.length !== 11) {
    return false;
  }

  const areaCode = Number(digits.slice(0, 2));

  if (areaCode < 11 || areaCode > 99) {
    return false;
  }

  const number = digits.slice(2);

  if (digits.length === 11) {
    return /^9\d{8}$/.test(number);
  }

  return /^[2-5]\d{7}$/.test(number);
}
