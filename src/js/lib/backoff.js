// Exponential backoff with full jitter. rand defaults to Math.random and is injectable for gates.
export function backoffDelay(attempt, { base = 1000, cap = 30000, rand = Math.random } = {}) {
  const ceil = Math.min(cap, base * 2 ** Math.max(0, attempt - 1));
  return Math.round(ceil / 2 + rand() * (ceil / 2));
}
