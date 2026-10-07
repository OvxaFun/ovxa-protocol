export const DASH = '—';
const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export const fmtInt = (n) => (Number.isFinite(n) ? int.format(Math.round(n)) : DASH);
export function fmtUsdCompact(n) {
  if (!Number.isFinite(n)) return DASH;
  const a = Math.abs(n);
  const [d, s] = a >= 1e12 ? [1e12, 'T'] : a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : a >= 1e3 ? [1e3, 'K'] : [1, ''];
  return '$' + (n / d).toFixed(a >= 1e3 ? 2 : 0) + s;
}
export function fmtPrice(n) {
  if (!Number.isFinite(n)) return DASH;
  if (n >= 1000) return '$' + int.format(n);
  if (n >= 1) return '$' + n.toFixed(2);
  if (n >= 0.01) return '$' + n.toFixed(4);
  return '$' + n.toPrecision(3);
}
export const fmtPct = (n) => (Number.isFinite(n) ? (n > 0 ? '+' : '') + n.toFixed(2) + '%' : DASH);
