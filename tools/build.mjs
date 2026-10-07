// Static build: src/ -> dist/. No bundler; the output is plain files ready to drag onto Cloudflare Pages.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { caView } from '../src/js/lib/gate.js';
import { socialView } from '../src/js/lib/links.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const X_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.153h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg>';
const GH_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';

function socialHtml(kind, rec, label, svg) {
  const v = socialView(kind, rec);
  if (v.active) return `<a class="icon-btn" href="${esc(v.href)}" target="_blank" rel="noopener noreferrer" aria-label="${label} (${esc(v.handle)})" data-social="${kind}" data-state="stated">${svg}</a>`;
  return `<a class="icon-btn is-inert" role="link" aria-disabled="true" aria-label="${label}, link not stated yet" data-social="${kind}" data-state="inert">${svg}</a>`;
}

function skeletonRows(n = 8) {
  const row = '<tr class="sk-row"><td><div class="coin"><span class="sk sk-logo"></span><span class="sk sk-w3"></span></div></td><td class="r"><span class="sk sk-r"></span></td><td class="r"><span class="sk sk-r"></span></td><td class="r"><span class="sk sk-r"></span></td><td class="r hide-s"><span class="sk sk-r"></span></td></tr>';
  return row.repeat(n);
}

export function cspFor(rpcUrl, { headerForm = false } = {}) {
  const rpcOrigin = new URL(rpcUrl).origin;
  const parts = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: https://cdn.dexscreener.com https://dd.dexscreener.com",
    `connect-src 'self' ${rpcOrigin} https://api.llama.fi https://api.dexscreener.com`,
    "base-uri 'none'", "form-action 'none'", "object-src 'none'",
  ];
  if (headerForm) parts.push("frame-ancestors 'none'");
  return parts.join('; ');
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    e.isDirectory() ? copyDir(a, b) : fs.copyFileSync(a, b);
  }
}

export function build({ register, outDir = path.join(ROOT, 'dist') } = {}) {
  const reg = register || JSON.parse(fs.readFileSync(path.join(ROOT, 'src/register.json'), 'utf8'));
  const R = reg.records;
  const rpcUrl = R.rpc.state === 'stated' ? R.rpc.value : 'https://solana-rpc.publicnode.com';
  const ca = caView(R.contract);

  let caBody;
  if (ca.copyable) {
    caBody = `<button class="ca-copy" type="button" data-copy="${esc(ca.value)}" data-copied="false" aria-label="Copy contract address"><span class="ca-addr">${esc(ca.value)}</span><span class="ca-hint">Copy</span></button>`;
  } else {
    caBody = `<div class="ca-slot is-inert" aria-disabled="true"><span class="ca-addr">${esc(ca.text)}</span><span class="ca-hint">Inert</span></div>`;
  }
  const short = ca.copyable ? `${ca.value.slice(0, 4)}…${ca.value.slice(-4)}` : 'Not stated yet';
  const note = ca.copyable ? 'Use the bar above to copy' : 'Turns on after the team states it';

  // Only state and the fact itself reach the page; sources and internal dates stay in the register.
  const pub = {};
  for (const [k, v] of Object.entries(R)) pub[k] = { state: v.state, ...(v.value !== undefined ? { value: v.value } : {}), ...(v.url !== undefined ? { url: v.url } : {}) };

  const map = {
    csp: esc(cspFor(rpcUrl)), domain: esc(R.domain.value), chain: esc(R.chain.value),
    ca_branch: ca.branch, ca_body: caBody, contract_short: esc(short), contract_note: esc(note),
    rpc_host: esc(new URL(rpcUrl).host), x_link: socialHtml('x', R.x, 'X profile for Ovxa', X_SVG), github_link: socialHtml('github', R.github, 'GitHub profile for Ovxa', GH_SVG),
    skeleton_rows: skeletonRows(), register_json: JSON.stringify({ records: pub }).replace(/</g, '\\u003c'),
  };
  let html = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  html = html.replace(/\{\{(\w+)\}\}/g, (_, k) => { if (!(k in map)) throw new Error('unfilled placeholder ' + k); return map[k]; });

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  copyDir(path.join(ROOT, 'src/css'), path.join(outDir, 'css'));
  copyDir(path.join(ROOT, 'src/js'), path.join(outDir, 'js'));
  fs.mkdirSync(path.join(outDir, 'assets'));
  for (const f of fs.readdirSync(path.join(ROOT, 'src/assets'))) if (f.endsWith('.png')) fs.copyFileSync(path.join(ROOT, 'src/assets', f), path.join(outDir, 'assets', f));
  fs.copyFileSync(path.join(ROOT, 'src/assets/favicon.svg'), path.join(outDir, 'favicon.svg'));
  fs.writeFileSync(path.join(outDir, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  fs.writeFileSync(path.join(outDir, '_headers'), [
    '/*',
    `  Content-Security-Policy: ${cspFor(rpcUrl, { headerForm: true })}`,
    '  X-Content-Type-Options: nosniff', '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()', '',
    '/assets/*', '  Cache-Control: public, max-age=31536000, immutable', '',
    '/css/*', '  Cache-Control: public, max-age=3600', '',
    '/js/*', '  Cache-Control: public, max-age=3600', '',
  ].join('\n'));
  return { outDir, branch: ca.branch };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = build();
  console.log('built', r.outDir, '| contract branch:', r.branch);
}
