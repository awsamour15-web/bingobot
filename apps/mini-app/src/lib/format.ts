export function safeNumber(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function formatMoney(value: unknown, digits = 2): string {
  return safeNumber(value).toFixed(digits);
}

export function formatWholeMoney(value: unknown): string {
  return safeNumber(value).toFixed(0);
}
