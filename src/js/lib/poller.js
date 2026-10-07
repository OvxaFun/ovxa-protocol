import { backoffDelay } from './backoff.js';

/**
 * Self-scheduling poller. Backs off after failures, stops while the tab is hidden, resumes on return.
 * env is injectable so gates can drive it with a fast fake clock.
 */
export function createPoller(task, { interval, base = 1000, cap = 30000, env }) {
  const e = env || {
    setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t), random: Math.random,
    isHidden: () => document.hidden, onVisibility: (cb) => document.addEventListener('visibilitychange', cb),
  };
  let timer = null, failures = 0, running = false, inflight = false;
  const api = { get failures() { return failures; }, start, stop, delays: [] };
  async function tick() {
    timer = null;
    if (!running || e.isHidden() || inflight) return;
    inflight = true;
    try { await task(); failures = 0; } catch { failures += 1; } finally { inflight = false; }
    schedule();
  }
  function schedule() {
    if (!running || timer !== null || e.isHidden()) return;
    const d = failures ? Math.max(interval, backoffDelay(failures, { base, cap, rand: e.random })) : interval;
    api.delays.push(d);
    timer = e.setTimeout(tick, d);
  }
  function start() { if (running) return; running = true; tick(); }
  function stop() { running = false; if (timer !== null) { e.clearTimeout(timer); timer = null; } }
  e.onVisibility(() => {
    if (!running) return;
    if (e.isHidden()) { if (timer !== null) { e.clearTimeout(timer); timer = null; } }
    else if (timer === null && !inflight) tick();
  });
  return api;
}
