// Chain health pill state: connecting until the first answer, live while answers keep arriving, offline after repeated misses.
export function chainHealth({ lastOkAt, failures, now, staleAfter = 12000, maxFailures = 3 }) {
  if (lastOkAt == null) return failures >= maxFailures ? 'offline' : 'connecting';
  if (failures >= maxFailures || now - lastOkAt > staleAfter * 4) return 'offline';
  return now - lastOkAt > staleAfter ? 'connecting' : 'live';
}
