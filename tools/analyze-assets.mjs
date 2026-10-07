// Reads every file in brand/ and reference/: IHDR, alpha histogram, dominant pixels, k-means palette snapped to real pixels.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { PNG } from 'pngjs'; import jpeg from 'jpeg-js';
const root = path.resolve(import.meta.dirname, '..');
const out = {};
function km(px, k, seed = 7) {
  let s = seed; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const pts = px; let cs = Array.from({ length: k }, () => pts[Math.floor(rnd() * pts.length)].slice());
  for (let it = 0; it < 14; it++) {
    const sum = cs.map(() => [0, 0, 0, 0]);
    for (const p of pts) { let b = 0, bd = 1e18; cs.forEach((c, i) => { const d = (c[0]-p[0])**2+(c[1]-p[1])**2+(c[2]-p[2])**2; if (d < bd) { bd = d; b = i; } }); const a = sum[b]; a[0]+=p[0]; a[1]+=p[1]; a[2]+=p[2]; a[3]++; }
    cs = cs.map((c, i) => sum[i][3] ? [sum[i][0]/sum[i][3], sum[i][1]/sum[i][3], sum[i][2]/sum[i][3]] : c);
  }
  const cnt = cs.map(() => 0);
  const snap = cs.map((c, i) => { let b = null, bd = 1e18; for (const p of pts) { const d = (c[0]-p[0])**2+(c[1]-p[1])**2+(c[2]-p[2])**2; if (d < bd) { bd = d; b = p; } } return b; });
  for (const p of pts) { let b = 0, bd = 1e18; cs.forEach((c, i) => { const d = (c[0]-p[0])**2+(c[1]-p[1])**2+(c[2]-p[2])**2; if (d < bd) { bd = d; b = i; } }); cnt[b]++; }
  return snap.map((p, i) => ({ hex: '#' + p.slice(0,3).map(v => v.toString(16).padStart(2,'0')).join(''), x: p[3], y: p[4], share: +(cnt[i]/pts.length).toFixed(4) })).sort((a,b)=>b.share-a.share);
}
for (const dir of ['brand', 'reference']) for (const f of fs.readdirSync(path.join(root, dir))) {
  const fp = path.join(root, dir, f); const buf = fs.readFileSync(fp); const r = { bytes: buf.length, sha1: crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12) };
  let w, h, d, isPng = buf.readUInt32BE(0) === 0x89504e47;
  if (isPng) { r.ihdr = { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colourType: buf[25], interlace: buf[28] }; const p = PNG.sync.read(buf); w = p.width; h = p.height; d = p.data; }
  else { const j = jpeg.decode(buf, { useTArray: true }); w = j.width; h = j.height; d = j.data; r.jpeg = { width: w, height: h, note: 'no alpha channel' }; }
  const hist = new Array(8).fill(0); let a0 = 0, a0black = 0, opaque = 0; const dom = new Map(); const sample = [];
  const step = isPng ? 3 : 4;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y*w+x)*4, a = d[i+3]; hist[a >> 5]++; if (a === 0) { a0++; if (!d[i] && !d[i+1] && !d[i+2]) a0black++; } if (a === 255) opaque++;
    const q = ((d[i]>>4)<<8)|((d[i+1]>>4)<<4)|(d[i+2]>>4); dom.set(q, (dom.get(q)||0)+1);
    if (x % step === 0 && y % step === 0 && a > 0) sample.push([d[i], d[i+1], d[i+2], x, y]);
  }
  r.alphaHist8 = hist; r.alpha0 = a0; r.alpha0PureBlack = a0black; r.opaque = opaque; r.size = [w, h];
  r.dominant16 = [...dom.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([q,n])=>({ hex:'#'+[(q>>8)&15,(q>>4)&15,q&15].map(v=>(v*17).toString(16).padStart(2,'0')).join(''), share:+(n/(w*h)).toFixed(4)}));
  r.kmeans8 = km(sample, 8);
  out[dir + '/' + f] = r;
}
fs.mkdirSync(path.join(root, 'tools/out'), { recursive: true });
fs.writeFileSync(path.join(root, 'tools/out/asset-report.json'), JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify({ ihdr: v.ihdr||v.jpeg, sha: v.sha1, a0: v.alpha0, a0black: v.alpha0PureBlack, opaque: v.opaque, hist: v.alphaHist8, dom: v.dominant16.slice(0,3).map(x=>x.hex+':'+x.share), km: v.kmeans8.map(c=>c.hex+'@'+c.x+','+c.y+':'+c.share).join(' ') }));
