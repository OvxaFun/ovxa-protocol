import { createPoller } from './lib/poller.js';
import { chainHealth } from './lib/health.js';
import { getSlot, getTvl, getPairs } from './lib/sources.js';
import { DASH, fmtInt, fmtUsdCompact, fmtPrice } from './lib/format.js';
import { startMatrix, wipe, scrollFx, reveals, setNumber, countFrom, reduced } from './fx.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reg = JSON.parse($('#register').textContent).records;
const RPC = reg.rpc.state === 'stated' ? reg.rpc.value : null;
const SLUG = reg.tvlSlug.state === 'stated' ? reg.tvlSlug.value : null;

/* ---------- shell ---------- */
wipe($('#wipe'));
startMatrix($('#matrix'));
scrollFx();
reveals();
$('#collapse').addEventListener('click', (e) => {
  const mini = $('#app').classList.toggle('mini');
  e.currentTarget.setAttribute('aria-pressed', String(mini));
  e.currentTarget.setAttribute('aria-label', mini ? 'Widen the rail' : 'Narrow the rail');
});

/* ---------- contract copy (only wired when a stated address exists) ---------- */
const toast = $('#toast');
let toastTimer;
function say(msg) { toast.textContent = msg; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2400); }
const copyBtn = $('.ca-copy');
if (copyBtn) {
  const hint = $('.ca-hint', copyBtn);
  copyBtn.addEventListener('click', async () => {
    const text = copyBtn.dataset.copy;
    try { await navigator.clipboard.writeText(text); } catch {
      const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.className = 'sr'; document.body.append(t); t.select();
      try { document.execCommand('copy'); } finally { t.remove(); }
    }
    copyBtn.dataset.copied = 'true'; hint.textContent = 'Copied'; say('Address copied');
    setTimeout(() => { copyBtn.dataset.copied = 'false'; hint.textContent = 'Copy'; }, 1800);
  });
}

/* ---------- health pill ---------- */
const state = { lastOkAt: null, failures: 0, health: 'connecting' };
function paintHealth() {
  const h = chainHealth({ lastOkAt: state.lastOkAt, failures: state.failures, now: Date.now() });
  if (h === state.health && paintHealth.done) return;
  paintHealth.done = true; state.health = h;
  const label = h[0].toUpperCase() + h.slice(1);
  $$('.pill').forEach((p) => { p.dataset.health = h; $("b", p).textContent = label; });
}
paintHealth();
setInterval(paintHealth, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) paintHealth(); });

/* ---------- slot ticker ---------- */
const vSlot = $('#v-slot'), vTvl = $('#v-tvl'), vPairs = $('#v-pairs'), vVol = $('#v-vol');
const dash = (el) => { el.__v = NaN; el.textContent = DASH; };
function setSlot(n) { setNumber(vSlot, n, fmtInt, { duration: 700 }); const t = $('.t-slot'); if (t) t.textContent = fmtInt(n); }
if (RPC) {
  const slot = createPoller(async () => {
    try { const n = await getSlot(RPC); state.lastOkAt = Date.now(); state.failures = 0; if (!Number.isFinite(vSlot.__v)) { vSlot.textContent = ''; countFrom(vSlot, n, fmtInt, 800); const t = $('.t-slot'); if (t) t.textContent = fmtInt(n); } else setSlot(n); paintHealth(); }
    catch (err) { state.failures += 1; if (state.failures >= 2 || !Number.isFinite(vSlot.__v)) { dash(vSlot); const t = $('.t-slot'); if (t) t.textContent = DASH; } paintHealth(); throw err; }
  }, { interval: 2500, base: 1000, cap: 30000 });
  slot.start();
} else { dash(vSlot); }

/* ---------- TVL ---------- */
if (SLUG) {
  const tvl = createPoller(async () => {
    try {
      const v = await getTvl(SLUG);
      if (!Number.isFinite(vTvl.__v)) { vTvl.textContent = ''; countFrom(vTvl, v, fmtUsdCompact); } else setNumber(vTvl, v, fmtUsdCompact);
      const t = $('.t-tvl'); if (t) t.textContent = fmtUsdCompact(v);
    } catch (err) { dash(vTvl); const t = $('.t-tvl'); if (t) t.textContent = DASH; throw err; }
  }, { interval: 60000, base: 2000, cap: 120000 });
  tvl.start();
} else { dash(vTvl); }

/* ---------- pairs board ---------- */
const board = $('#board'), meta = $('#pairs-meta');
let pairs = [], sortKey = 'volume', query = '';
const SORTS = { volume: (a, b) => b.volume - a.volume, change: (a, b) => (Number.isFinite(b.change) ? b.change : -Infinity) - (Number.isFinite(a.change) ? a.change : -Infinity), liquidity: (a, b) => b.liquidity - a.liquidity };

const pctText = (n) => (Number.isFinite(n) ? Math.abs(n).toFixed(2) + '%' : DASH);
function cell(cls, text) { const td = document.createElement('td'); if (cls) td.className = cls; td.textContent = text; return td; }
function logo(p) {
  const wrap = document.createElement('span'); wrap.className = 'coin-logo';
  const ph = () => { const s = document.createElement('span'); s.className = 'ph'; s.textContent = (p.base || '?').slice(0, 2).toUpperCase(); return s; };
  if (!p.logo) { wrap.append(ph()); return wrap; }
  const img = new Image(28, 28); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => img.replaceWith(ph()), { once: true });
  img.src = p.logo; wrap.append(img); return wrap;
}
function row(p) {
  const tr = document.createElement('tr');
  const first = document.createElement('td'); const c = document.createElement('div'); c.className = 'coin';
  const nm = document.createElement('span'); const b = document.createElement('b'); b.textContent = p.base; const q = document.createElement('small'); q.textContent = '/' + p.quote; nm.append(b, q);
  c.append(logo(p), nm); first.append(c);
  const ch = cell('r ' + (p.change > 0 ? 'up' : p.change < 0 ? 'down' : ''), pctText(p.change));
  tr.append(first, cell('r', fmtPrice(p.price)), ch, cell('r', fmtUsdCompact(p.volume)), cell('r hide-s', fmtUsdCompact(p.liquidity)));
  return tr;
}
function renderBoard() {
  const q = query.trim().toLowerCase();
  const list = pairs.filter((p) => !q || p.base.toLowerCase().includes(q) || p.quote.toLowerCase().includes(q)).sort(SORTS[sortKey]).slice(0, 12);
  board.replaceChildren(...(list.length ? list.map(row) : [Object.assign(document.createElement('tr'), { className: 'empty-row' })]));
  if (!list.length) { const td = document.createElement('td'); td.colSpan = 5; td.textContent = pairs.length ? 'Nothing matches that symbol.' : 'No pair data yet.'; board.firstChild.append(td); }
}
function renderTape() {
  const track = $('#tape');
  const mk = (cls, sym, val, chg) => {
    const a = document.createElement('div'); a.className = 'ti'; const b = document.createElement('b'); b.textContent = sym; const v = document.createElement('span'); v.className = 'num ' + cls; v.textContent = val; a.append(b, v);
    if (chg !== undefined) { const c = document.createElement('span'); c.className = 'num ' + (chg > 0 ? 'up' : chg < 0 ? 'down' : ''); c.textContent = pctText(chg); a.append(c); }
    return a;
  };
  const items = () => [mk('t-slot', 'SLOT', vSlot.__v ? fmtInt(vSlot.__v) : DASH), mk('t-tvl', 'TVL', vTvl.__v ? fmtUsdCompact(vTvl.__v) : DASH), ...[...pairs].sort(SORTS.volume).slice(0, 12).map((p) => mk('', p.base, fmtPrice(p.price), p.change))];
  track.replaceChildren(...items(), ...items());
  tapeX = 0;
}
let tapeX = 0;
(function tapeLoop() {
  if (reduced) return;
  const track = $('#tape'); let last = 0;
  const speed = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tape-speed')) || 40;
  requestAnimationFrame(function f(t) {
    const dt = last ? Math.min((t - last) / 1000, 0.1) : 0; last = t;
    if (!document.hidden) { tapeX += speed * dt; const half = track.scrollWidth / 2; if (half && tapeX >= half) tapeX -= half; track.style.transform = `translateX(${-tapeX}px)`; }
    requestAnimationFrame(f);
  });
})();

$$('.tabs button').forEach((b) => b.addEventListener('click', () => {
  sortKey = b.dataset.sort; $$('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b))); renderBoard();
}));
$('#filter').addEventListener('input', (e) => { query = e.target.value; renderBoard(); });

const pairPoll = createPoller(async () => {
  try {
    pairs = await getPairs();
    renderBoard(); renderTape();
    const total = pairs.reduce((s, p) => s + p.volume, 0);
    if (!Number.isFinite(vPairs.__v)) { vPairs.textContent = ''; countFrom(vPairs, pairs.length, fmtInt, 700); vVol.textContent = ''; countFrom(vVol, total, fmtUsdCompact, 900); }
    else { setNumber(vPairs, pairs.length, fmtInt); setNumber(vVol, total, fmtUsdCompact); }
    meta.textContent = 'Synced'; meta.classList.add('live');
  } catch (err) {
    meta.textContent = 'Retrying'; meta.classList.remove('live');
    if (!pairs.length) { dash(vPairs); dash(vVol); const tr = document.createElement('tr'); tr.className = 'empty-row'; const td = document.createElement('td'); td.colSpan = 5; td.textContent = DASH; tr.append(td); board.replaceChildren(tr); }
    throw err;
  }
}, { interval: 30000, base: 2000, cap: 120000 });
pairPoll.start();
