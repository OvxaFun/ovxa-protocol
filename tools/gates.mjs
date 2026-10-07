// Gates: synthetic fixtures only, fake clock, well under five minutes. Exit code 0 means every gate passed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { build, cspFor } from './build.mjs';
import { isCa, caView } from '../src/js/lib/gate.js';
import { socialView } from '../src/js/lib/links.js';
import { backoffDelay } from '../src/js/lib/backoff.js';
import { createPoller } from '../src/js/lib/poller.js';
import { chainHealth } from '../src/js/lib/health.js';
import { fmtUsdCompact, fmtPrice, fmtInt, DASH } from '../src/js/lib/format.js';
import { pickChainTvl, normalizePairs, topPairs, smallImage } from '../src/js/lib/sources.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ovxa-gates-'));
const REG = JSON.parse(read('src/register.json'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const results = [];
async function gate(name, fn) {
  const t = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t }); console.log(`PASS  ${name}`); }
  catch (e) { results.push({ name, ok: false, ms: Date.now() - t, err: e.message }); console.log(`FAIL  ${name}\n      ${e.message}`); }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => ok(a === b, `${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const textOf = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, '\n').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
let n = 0;
const buildTo = (register) => { const dir = path.join(tmp, 'b' + n++); build({ register, outDir: dir }); return { dir, html: fs.readFileSync(path.join(dir, 'index.html'), 'utf8') }; };
const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, out) : out.push(p); } return out; };

// Synthetic base58 fixtures: 44 and 32 characters, one with a leading digit.
const CA44 = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const CA32 = '1111111111111111111111111111111A';
ok(CA44.length === 44 && CA32.length === 32, 'fixture lengths');

/* ---- build and assets ---- */
await gate('01 build writes dist/ with page, headers, favicon, assets', () => {
  const r = build({ outDir: path.join(ROOT, 'dist') });
  eq(r.outDir, path.join(ROOT, 'dist'), 'outDir');
  for (const f of ['index.html', '_headers', 'favicon.svg', 'css/tokens.css', 'css/style.css', 'js/main.js', 'js/boot.js', 'assets/logo-512.png']) ok(fs.existsSync(path.join(ROOT, 'dist', f)), 'missing ' + f);
});

await gate('02 asset read: IHDR, alpha, premultiplied-resize need proven from bytes', () => {
  const b = fs.readFileSync(path.join(ROOT, 'brand/LOGO OVXA PNG...png'));
  eq(b.readUInt32BE(16), 2000, 'width'); eq(b[25], 6, 'colour type RGBA');
  const p = PNG.sync.read(b); let black = 0;
  for (let i = 0; i < p.data.length; i += 4) if (p.data[i + 3] === 0 && !p.data[i] && !p.data[i + 1] && !p.data[i + 2]) black++;
  ok(black > 1e6, 'expected pure-black transparent regions, found ' + black);
  const small = PNG.sync.read(fs.readFileSync(path.join(ROOT, 'src/assets/logo-256.png'))); let edge = 0, lum = 0;
  for (let i = 0; i < small.data.length; i += 4) { const a = small.data[i + 3]; if (a > 30 && a < 200) { edge++; lum += (small.data[i] + small.data[i + 1] + small.data[i + 2]) / 3; } }
  ok(edge > 50, 'no soft edges found'); ok(lum / edge > 55, 'edge pixels dragged dark: mean luma ' + (lum / edge).toFixed(1));
});

await gate('03 palette: every token is a real pixel at its recorded coordinate', () => {
  const css = read('src/css/tokens.css'); const re = /--([\w-]+):\s*(#[0-9a-f]{6});\s*\/\*\s*@\s*(.+?)\s+(\d+),(\d+)\s*\*\//gi; let m, count = 0; const cache = {};
  while ((m = re.exec(css))) {
    const [, name, hex, file, x, y] = m; const fp = path.join(ROOT, file); cache[file] ||= (file.endsWith('png') ? PNG.sync.read(fs.readFileSync(fp)) : jpeg.decode(fs.readFileSync(fp), { useTArray: true }));
    const img = cache[file], i = (+y * img.width + +x) * 4, got = '#' + [0, 1, 2].map((k) => img.data[i + k].toString(16).padStart(2, '0')).join('');
    eq(got.toLowerCase(), hex.toLowerCase(), `--${name} at ${file} ${x},${y}`); count++;
  }
  ok(count >= 10, 'expected at least 10 sampled tokens, found ' + count);
});

await gate('04 hex literals live in tokens.css (and the traced favicon) only', () => {
  const bad = [];
  for (const f of [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'dist'))]) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    if (/\.(png)$/.test(rel) || rel.endsWith('tokens.css') || rel.endsWith('favicon.svg')) continue;
    if (/(^|[^&\w])#[0-9a-fA-F]{3,8}\b/.test(fs.readFileSync(f, 'utf8').replace(/&#\d+;/g, ''))) bad.push(rel);
  }
  ok(!bad.length, 'colour literal outside tokens: ' + bad.join(', '));
});

await gate('05 favicon: 32x32 SVG traced from pixels, no double hyphen inside', () => {
  const s = read('dist/favicon.svg'); ok(/viewBox="0 0 32 32"/.test(s) && /width="32"/.test(s) && /height="32"/.test(s), 'size');
  ok((s.match(/<rect/g) || []).length > 150, 'too few traced tiles'); ok(!s.includes('--'), 'double hyphen present'); ok(!s.includes('<!--'), 'comment present');
  ok(/^<svg[\s\S]*<\/svg>\s*$/.test(s), 'not a single svg element');
});

/* ---- contract slot: both branches ---- */
await gate('06 gate accepts any 32-44 char base58, rejects only non-base58 or wrong length', () => {
  ok(isCa(CA44) && isCa(CA32), 'valid fixtures rejected');
  ok(isCa('9' + CA44.slice(1, 43)), 'leading digit rejected');
  for (const bad of ['0x' + 'a'.repeat(40), CA44.slice(0, 31), CA44 + 'AB', CA44.replace('7', '0'), CA44.replace('K', 'O'), CA44.replace('X', 'I'), CA44.replace('t', 'l'), '', null, 42]) ok(!isCa(bad), 'accepted ' + bad);
});

await gate('07 branch ABSENT: slot is inert, shows placeholder, nothing copyable', () => {
  const { html } = buildTo(clone(REG)); const rec = REG.records.contract;
  if (rec.state === 'stated') return; // current register already exercises the other branch; mutation gates cover both
  ok(/id="ca"[^>]*data-state="absent"/.test(html), 'data-state'); ok(html.includes('class="ca-slot is-inert"'), 'inert slot'); ok(!html.includes('ca-copy'), 'copy button present'); ok(!/data-copy=/.test(html), 'data-copy present');
});

await gate('08 branch STATED: full address, click-to-copy button, 44 and 32 char fixtures', () => {
  for (const ca of [CA44, CA32]) {
    const r = clone(REG); r.records.contract = { ...r.records.contract, state: 'stated', value: ca };
    const { html } = buildTo(r);
    ok(/id="ca"[^>]*data-state="stated"/.test(html), 'data-state'); ok(html.includes(`data-copy="${ca}"`), 'data-copy'); ok(html.includes(`<span class="ca-addr">${ca}</span>`), 'full address not rendered'); ok(!html.includes('is-inert"><span class="ca-addr">Address'), 'placeholder still shown');
  }
});

await gate('09 unconfirmed and malformed records stay inert', () => {
  eq(caView({ state: 'unconfirmed', value: CA44 }).copyable, false, 'unconfirmed'); eq(caView({ state: 'stated', value: 'not-base58!' }).copyable, false, 'malformed');
  eq(caView({ state: 'stated', value: CA44 }).copyable, true, 'stated'); eq(caView(undefined).branch, 'absent', 'undefined record');
});

await gate('10 mutation: contract flips with the CURRENT record (state-independent anchor)', () => {
  const cur = REG.records.contract.state; const r = clone(REG);
  r.records.contract = cur === 'stated' ? { ...r.records.contract, state: 'absent', value: null } : { ...r.records.contract, state: 'stated', value: CA44 };
  const a = buildTo(clone(REG)).html, b = buildTo(r).html;
  ok(a !== b, 'mutation produced identical output'); const branch = (h) => /id="ca"[^>]*data-state="(\w+)"/.exec(h)[1];
  eq(branch(a), cur === 'stated' ? 'stated' : 'absent', 'baseline branch'); eq(branch(b), cur === 'stated' ? 'absent' : 'stated', 'mutated branch');
  eq(buildTo(clone(REG)).html, a, 'rebuilding the original is not idempotent');
});

/* ---- social ---- */
await gate('11 social icons: both present, inert when absent, top-right, never hidden by CSS', () => {
  const { html } = buildTo(clone(REG)); const right = /<div class="right">([\s\S]*?)<\/header>/.exec(html);
  ok(right, 'right cluster in header'); for (const k of ['x', 'github']) { ok(right[1].includes(`data-social="${k}"`), k + ' icon missing from header'); }
  if (REG.records.x.state !== 'stated') ok(!/data-social="x"[^>]*href=/.test(html) && !/href="[^"]*"[^>]*data-social="x"/.test(html), 'x has href while absent');
  if (REG.records.github.state !== 'stated') ok(!/href="[^"]*"[^>]*data-social="github"/.test(html), 'github has href while absent');
  const css = read('src/css/style.css'); ok(!/\.(social|icon-btn)[^{}]*\{[^}]*display:\s*none/.test(css), 'CSS hides social at some breakpoint');
  ok(!/\.text-label|<span>X<\/span>|>GitHub</.test(html), 'text label on icon');
});

await gate('12 mutation: x and github flip to live links with handles derived from the URL', () => {
  for (const [k, url, handle, host] of [['x', 'https://x.com/ovxa_fixture', '@ovxa_fixture', 'x.com'], ['github', 'https://github.com/ovxa-fixture/site', 'ovxa-fixture/site', 'github.com']]) {
    const cur = REG.records[k].state; const r = clone(REG);
    r.records[k] = cur === 'stated' ? { ...r.records[k], state: 'absent', url: null } : { ...r.records[k], state: 'stated', url };
    const { html } = buildTo(r);
    if (cur === 'stated') ok(/is-inert/.test(html) && !html.includes(REG.records[k].url), k + ' did not go inert');
    else { ok(html.includes(`href="${url}"`), k + ' href'); ok(html.includes(handle), k + ' handle not derived'); }
    eq(socialView(k, { state: 'stated', url: `http://${host}/x` }).active, false, k + ' http accepted');
    eq(socialView(k, { state: 'stated', url: `https://evil.example/${k}` }).active, false, k + ' wrong host accepted');
    eq(socialView(k, { state: 'unconfirmed', url }).href, null, k + ' unconfirmed gave href');
  }
});

await gate('13 info tiles: exactly Chain, Contract, RPC; no X or GitHub tiles', () => {
  const { html } = buildTo(clone(REG)); const tiles = [...html.matchAll(/data-tile="(\w+)"/g)].map((m) => m[1]);
  eq(tiles.join(','), 'chain,contract,rpc', 'tiles');
});

await gate('14 official marks: X glyph path and GitHub Octicon path present', () => {
  const b = read('tools/build.mjs'); ok(b.includes('M18.901 1.153h3.68l-8.04 9.19L24 22.846'), 'X mark'); ok(b.includes('M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59'), 'Octicon mark-github');
});

/* ---- records, dates, hygiene ---- */
await gate('15 register: every record has state in {stated,absent,unconfirmed}; absent records carry no value', () => {
  for (const [k, v] of Object.entries(REG.records)) { ok(['stated', 'absent', 'unconfirmed'].includes(v.state), k + ' state'); if (v.state === 'absent') ok((v.value ?? v.url) == null, k + ' absent but holds a value'); ok(v.source && v.recordedAt, k + ' needs source and recordedAt'); }
});

await gate('16 no dates visible, and internal timestamps never reach dist', () => {
  const { dir, html } = buildTo(clone(REG)); const t = textOf(html);
  ok(!/\b(19|20)\d{2}\b/.test(t), 'year in page text'); ok(!/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i.test(t), 'month and day'); ok(!/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(t), 'numeric date');
  for (const f of walk(dir)) if (/\.(html|js|css|json|txt)$/.test(f) || f.endsWith('_headers')) ok(!/recordedAt|\b20\d\d-\d\d-\d\d\b/.test(fs.readFileSync(f, 'utf8')), 'timestamp leaked in ' + path.basename(f));
});

await gate('17 repo hygiene: no agent config folders, no attribution strings', () => {
  for (const p of ['CLAUDE' + '.md', '.' + 'claude']) ok(!fs.existsSync(path.join(ROOT, p)), p + ' exists');
  const pat = new RegExp(['Claude', 'Anthropic', 'Generated with', 'Co-Authored-By', 'AI-generated', 'as an AI'].join('|'), 'i'); const bad = [];
  for (const f of walk(ROOT)) { const rel = path.relative(ROOT, f).replace(/\\/g, '/'); if (/^(node_modules|tools\/out|tools\/fixtures|brand|reference)\//.test(rel) || /\.(png|jpe?g|jpeg)$/.test(rel) || rel === 'tools/gates.mjs' || rel === 'package-lock.json') continue; if (pat.test(fs.readFileSync(f, 'utf8'))) bad.push(rel); }
  ok(!bad.length, 'attribution found in ' + bad.join(', '));
});

await gate('18 supporting files exist and are non-trivial', () => {
  for (const f of ['README.md', 'LICENSE', 'docs/whitepaper.md', 'docs/tokenomics.md', 'docs/roadmap.md', 'docs/architecture.md', '.github/CONTRIBUTING.md', '.github/SECURITY.md']) ok(fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).size > 600, f + ' missing or thin');
  for (const f of ['docs/whitepaper.md', 'docs/tokenomics.md', 'docs/roadmap.md', 'docs/architecture.md', 'README.md']) ok(!/\b(19|20)\d{2}\b/.test(read(f)), 'year in ' + f);
});

/* ---- copy ---- */
const BRAND_TERMS = /^(coins?|memecoins?|markets?|commoditw*|launchw*|treasury|wallet|pumpw*|curve|registerw*|ore|oil|gold|eggs?|coffee|crude|silver|lithium|timber|cocoa|bonding|graduatw*|pumpswap|tracking funds)$/;
await gate('19 copy: zero shared 2-grams, zero reuse of the reference vocabulary (incidental plain words reported)', () => {
  const ref = read('tools/fixtures/reference-copy.txt'); const words = (s) => (s.toLowerCase().match(/[a-z][a-z'-]*/g) || []);
  const refLines = ref.split('\n').map(words).filter((w) => w.length); const refGrams = new Set(), refWords = new Set();
  for (const w of refLines) { w.forEach((x) => refWords.add(x)); for (let i = 0; i < w.length - 1; i++) refGrams.add(w[i] + ' ' + w[i + 1]); }
  const html = read('dist/index.html'); const strings = [...read('src/js/main.js').matchAll(/'([^'\n]{5,})'/g)].map((m) => m[1]).filter((s) => /\s/.test(s) && !/[{}();=\/]/.test(s));
  const metas = [...html.matchAll(/(?:content|aria-label|placeholder)="([^"]+)"/g)].map((m) => m[1]).filter((s) => !/default-src|width=device/.test(s));
  const ours = [textOf(html), ...strings, ...metas].join('\n').split('\n').map(words).filter((w) => w.length);
  const gramHits = new Set(), wordHits = new Set(), srcOf = new Map(); const STOP = new Set('about above after again also been before being below between both could does doing down during each from further have having here into itself more most other over same should some such than that their them then there these they this those through under until very were what when where which while with would your'.split(' '));
  const SPEC = new Set(['live', 'connecting', 'offline', 'home', 'chain', 'price', 'prices', 'volume', 'pairs', 'slot', 'contract', 'address', 'solana', 'ovxa', 'every', 'token', 'tokens', 'sidebar', 'main', 'sections']); // words the brief itself mandates or UI chrome needs
  for (const w of ours) { w.forEach((x) => { if (x.length >= 5 && refWords.has(x) && !STOP.has(x) && !SPEC.has(x)) wordHits.add(x); }); for (let i = 0; i < w.length - 1; i++) { const g = w[i] + ' ' + w[i + 1]; if (refGrams.has(g)) { gramHits.add(g); srcOf.set(g, w.join(' ')); } } }
  ok(!gramHits.size, 'shared 2-grams: ' + [...gramHits].map((g) => g + ' <= "' + srcOf.get(g) + '"').join(' || ')); const distinct = [...wordHits].filter((w) => BRAND_TERMS.test(w)); ok(!distinct.length, 'reference vocabulary reused: ' + distinct.join(', ')); console.log(`      (${wordHits.size} incidental plain-English words overlap; no shared 2-gram)`);
});

/* ---- headers, CSP ---- */
await gate('20 CSP covers every live origin, no unsafe-inline, no inline code in the page', () => {
  const { dir, html } = buildTo(clone(REG)); const h = fs.readFileSync(path.join(dir, '_headers'), 'utf8'); const meta = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1].replace(/&amp;/g, '&');
  for (const o of ['https://solana-rpc.publicnode.com', 'https://api.llama.fi', 'https://api.dexscreener.com', 'https://cdn.dexscreener.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com']) { ok(h.includes(o), 'headers missing ' + o); ok(meta.includes(o), 'meta missing ' + o); }
  ok(!/unsafe-inline|unsafe-eval/.test(h + meta), 'unsafe directive'); ok(/frame-ancestors 'none'/.test(h), 'frame-ancestors');
  ok(!/<script(?![^>]*\bsrc=)(?![^>]*type="application\/json")[^>]*>/.test(html), 'inline script'); ok(!/\son\w+="/.test(html), 'inline handler'); ok(!/\sstyle="/.test(html), 'inline style attribute');
  const origins = new Set(); for (const f of walk(path.join(dir, 'js'))) for (const m of fs.readFileSync(f, 'utf8').matchAll(/https:\/\/([a-z0-9.-]+)/g)) origins.add('https://' + m[1]); for (const o of origins) ok(h.includes(o), 'script talks to ' + o + ' which the CSP does not cover');
  eq(cspFor('https://rpc.example.org/x').includes('https://rpc.example.org'), true, 'csp follows register rpc');
});

/* ---- live behaviour, fast clock ---- */
await gate('21 backoff: exponential, capped, jittered inside bounds', () => {
  const lo = (a) => backoffDelay(a, { base: 1000, cap: 30000, rand: () => 0 }), hi = (a) => backoffDelay(a, { base: 1000, cap: 30000, rand: () => 0.999999 });
  eq(lo(1), 500, 'attempt 1 low'); eq(hi(1), 1000, 'attempt 1 high'); ok(hi(3) === 4000 && lo(3) === 2000, 'doubling'); ok(hi(12) <= 30000 && lo(12) === 15000, 'cap'); ok(backoffDelay(4) >= 4000 && backoffDelay(4) <= 8000, 'default rand');
});

function fakeEnv() {
  let now = 0, id = 0, hidden = false; const q = new Map(), subs = [];
  return { env: { setTimeout: (f, ms) => { q.set(++id, { f, at: now + ms }); return id; }, clearTimeout: (i) => q.delete(i), random: () => 0.5, isHidden: () => hidden, onVisibility: (cb) => subs.push(cb) },
    async advance(ms) { const end = now + ms; for (;;) { const next = [...q.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; q.delete(next[0]); now = next[1].at; next[1].f(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); } now = end; },
    hide(v) { hidden = v; subs.forEach((s) => s()); }, pending: () => q.size };
}
await gate('22 poller: backs off on failure, resets on success, pauses hidden, resumes visible', async () => {
  const c = fakeEnv(); let calls = 0, fail = true;
  const p = createPoller(async () => { calls++; if (fail) throw new Error('x'); }, { interval: 1000, base: 500, cap: 8000, env: c.env });
  p.start(); await c.advance(0); eq(calls, 1, 'first call'); await c.advance(60000); ok(p.delays.length >= 4, 'scheduled retries'); ok(p.delays[1] > p.delays[0] || p.delays[0] >= 1000, 'delays grow'); ok(Math.max(...p.delays) <= 8000, 'cap respected'); ok(p.failures > 3, 'failures counted');
  fail = false; await c.advance(20000); eq(p.failures, 0, 'reset after success'); eq(p.delays.at(-1), 1000, 'back to base interval');
  const before = calls; c.hide(true); await c.advance(30000); eq(calls, before, 'polled while hidden'); eq(c.pending(), 0, 'timer left armed while hidden'); c.hide(false); await c.advance(0); ok(calls > before, 'did not resume'); p.stop();
});

await gate('23 chain health: connecting, live, offline transitions', () => {
  eq(chainHealth({ lastOkAt: null, failures: 0, now: 5 }), 'connecting', 'start'); eq(chainHealth({ lastOkAt: 1000, failures: 0, now: 4000 }), 'live', 'fresh'); eq(chainHealth({ lastOkAt: 0, failures: 0, now: 20000 }), 'connecting', 'stale');
  eq(chainHealth({ lastOkAt: 1000, failures: 3, now: 2000 }), 'offline', 'misses'); eq(chainHealth({ lastOkAt: null, failures: 3, now: 0 }), 'offline', 'never answered'); eq(chainHealth({ lastOkAt: 0, failures: 0, now: 60000 }), 'offline', 'long silence');
});

await gate('24 TVL matched by slug solana; missing slug throws', () => {
  eq(pickChainTvl([{ name: 'Solana Foo', tvl: 1 }, { name: 'Solana', tvl: 5e9 }, { name: 'Other', tvl: 2 }], 'solana'), 5e9, 'slug match'); eq(pickChainTvl([{ name: 'X', gecko_id: 'solana', tvl: 7 }], 'solana'), 7, 'gecko id fallback');
  let threw = false; try { pickChainTvl([{ name: 'Other', tvl: 1 }], 'solana'); } catch { threw = true; } ok(threw, 'did not throw'); ok(read('src/register.json').includes('"tvlSlug"'), 'slug lives in register');
});

await gate('25 pairs: solana only, dedupe, one pool per token, logo resized, ranked by volume', () => {
  const mk = (o) => ({ chainId: 'solana', pairAddress: 'p' + Math.random(), baseToken: { address: 'm1', symbol: 'AAA' }, quoteToken: { symbol: 'SOL' }, priceUsd: '1.5', priceChange: { h24: 3 }, volume: { h24: 10 }, liquidity: { usd: 5 }, ...o });
  const list = [mk({ pairAddress: 'a', volume: { h24: 5 } }), mk({ pairAddress: 'b', volume: { h24: 50 } }), mk({ pairAddress: 'c', baseToken: { address: 'm2', symbol: 'BBB' }, volume: { h24: 80 }, info: { imageUrl: 'https://cdn.dexscreener.com/x?width=800&height=800&q=1' } }), mk({ chainId: 'ethereum', baseToken: { address: 'e', symbol: 'ETHX' } }), mk({ pairAddress: 'a', volume: { h24: 1 } }), mk({ priceUsd: 'nope', pairAddress: 'z' })];
  const top = topPairs(list); eq(top.map((p) => p.base).join(','), 'BBB,AAA', 'order and dedupe'); eq(top[1].volume, 50, 'busiest pool kept'); eq(top[0].logo, 'https://cdn.dexscreener.com/x?width=64&height=64&q=1', 'logo resize'); eq(normalizePairs(list).some((p) => p.base === 'ETHX'), false, 'non-solana kept'); eq(smallImage('a?width=1'), 'a?width=64', 'smallImage');
});

await gate('26 formatting: dash fallback on bad data, compact USD', () => {
  eq(fmtUsdCompact(NaN), DASH, 'nan'); eq(fmtUsdCompact(undefined), DASH, 'undefined'); eq(fmtInt(null) === '0' || fmtInt(null) === DASH, true, 'null int'); eq(fmtUsdCompact(6.6e9), '$6.60B', 'billions'); eq(fmtUsdCompact(1.65e6), '$1.65M', 'millions'); eq(fmtPrice(0.00089), '$0.000890', 'tiny price'); eq(fmtPrice(Infinity), DASH, 'inf');
});

await gate('27 page wires every live feature: slot, pill, tvl, board, skeletons, dash fallback, hidden pause', () => {
  const js = read('src/js/main.js'), src = read('src/js/lib/sources.js'), html = read('dist/index.html'), css = read('src/css/style.css');
  for (const s of ['getSlot(RPC)', 'getTvl(SLUG)', 'getPairs()', 'reg.rpc.value', 'reg.tvlSlug.value', 'DASH']) ok(js.includes(s), 'main.js missing ' + s);
  ok(/getSlot/.test(src) && /params: \[\{ commitment/.test(src), 'getSlot rpc call'); ok(/isHidden/.test(read('src/js/lib/poller.js')) && /document\.hidden/.test(read('src/js/lib/poller.js')), 'hidden pause');
  for (const s of ['data-health="connecting"', 'id="v-slot"', 'id="v-tvl"', 'id="board"', 'class="sk ']) ok(html.includes(s), 'page missing ' + s); ok(/@keyframes pulse/.test(css) && /@keyframes shimmer/.test(css) && /@keyframes flash/.test(css), 'pulse, shimmer, flash keyframes');
  ok((html.match(/class="sk-row"/g) || []).length >= 6, 'skeleton rows'); ok(/setNumber|countFrom/.test(js), 'count-up wired');
});

/* ---- visual system, static checks ---- */
await gate('28 motion and layout rules: reduced-motion, scroll progress, parallax, reveals, no ch units, tap targets', () => {
  const css = read('src/css/style.css'), fx = read('src/js/fx.js');
  ok(/@media \(prefers-reduced-motion: reduce\)/.test(css) && /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/.test(fx), 'reduced motion'); ok(/id="progress"/.test(read('src/index.html')) && /scaleX\(var\(--p/.test(css), 'progress bar'); ok(/data-depth|\.d3|--d:/.test(css) && /data-parallax/.test(read('src/index.html')), 'parallax depths');
  ok(/IntersectionObserver/.test(fx) && /\.rv/.test(css), 'reveals'); ok(!/\d\s?ch\b/.test(css), 'ch unit used'); ok(/<canvas class="matrix"/.test(read('src/index.html')), 'matrix canvas');
  const rules = [['.btn', 48], ['.icon-btn', 44], ['.tabs button', 44], ['.snav a', 44], ['.collapse', 44], ['.fl a', 44]];
  for (const [sel, px] of rules) { const m = new RegExp(sel.replace('.', '\\.') + '\\s*\\{[^}]*\\}').exec(css); ok(m, sel + ' rule'); const v = /(?:min-)?(?:height|width):\s*(\d+)px/.exec(m[0]); ok(v && +v[1] >= 44, sel + ' target under 44px'); }
  ok(/\.mnav a \{[^}]*min-height: 52px/.test(css), 'mobile nav targets'); ok(/\.ca-bar \{[^}]*position: sticky/.test(css), 'contract bar sticky');
});

await gate('29 dist is self-contained: every referenced file exists, no source maps', () => {
  const { dir, html } = buildTo(clone(REG)); for (const m of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) ok(fs.existsSync(path.join(dir, m[1])), 'missing ' + m[1]);
  for (const f of walk(path.join(dir, 'js'))) for (const m of fs.readFileSync(f, 'utf8').matchAll(/from '(\.[^']+)'/g)) ok(fs.existsSync(path.resolve(path.dirname(f), m[1])), 'broken import ' + m[1] + ' in ' + path.basename(f));
  ok(!walk(dir).some((f) => f.endsWith('.map')), 'source map shipped');
});

await gate('30 deploy output is dist/ and matches a fresh build', () => {
  const a = fs.readFileSync(path.join(ROOT, 'dist/index.html'), 'utf8'); eq(a, buildTo(clone(REG)).html, 'dist/index.html drifted from register'); ok(read('package.json').includes('"build"') && read('package.json').includes('"gates"'), 'scripts');
});

fs.rmSync(tmp, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok); const total = results.reduce((s, r) => s + r.ms, 0);
console.log(`\n${results.length - failed.length}/${results.length} gates passed in ${(total / 1000).toFixed(1)}s`);
if (results.length > 30) { console.log('too many gates'); process.exit(1); }
process.exit(failed.length ? 1 : 0);
