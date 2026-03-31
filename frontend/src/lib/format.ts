/**
 * Format a number as USD currency: $XX,XXX.XX
 */
export function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format a number as compact currency: $49K, $214K
 */
export function formatMoneyCompact(value: number): string {
  if (Math.abs(value) >= 1000) {
    return '$' + (value / 1000).toFixed(value % 1000 === 0 ? 0 : 1) + 'K';
  }
  return formatMoney(value);
}

/**
 * Format a number as percentage: XX.XX%
 */
export function formatPercent(value: number): string {
  return value.toFixed(2) + '%';
}

/**
 * Format a date string to a readable format
 */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
