// Derives logo sizes (premultiplied area resize, the source has 3.4M pure-black alpha-0 pixels) and the 32x32 favicon traced from the real tile lattice.
import fs from 'node:fs'; import path from 'node:path'; import { PNG } from 'pngjs';
const root = path.resolve(import.meta.dirname, '..');
const src = PNG.sync.read(fs.readFileSync(path.join(root, 'brand/LOGO OVXA PNG...png')));
const { width: W, height: H, data: D } = src;
// Crop box (measured from alpha/luma bbox) padded to a square.
const BX0 = 554, BX1 = 1447, BY0 = 436, BY1 = 1568, PAD = 40;
const side = Math.max(BX1 - BX0, BY1 - BY0) + PAD * 2;
const cx = (BX0 + BX1) / 2, cy = (BY0 + BY1) / 2, ox = Math.round(cx - side / 2), oy = Math.round(cy - side / 2);
function resize(n) {
  const out = new PNG({ width: n, height: n }); const k = side / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let r = 0, g = 0, b = 0, a = 0, c = 0;
    for (let sy = Math.floor(y * k); sy < Math.floor((y + 1) * k); sy++) for (let sx = Math.floor(x * k); sx < Math.floor((x + 1) * k); sx++) {
      const px = sx + ox, py = sy + oy; c++;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const i = (py * W + px) * 4, al = D[i + 3] / 255; r += D[i] * al; g += D[i + 1] * al; b += D[i + 2] * al; a += al;
    }
    const o = (y * n + x) * 4;
    if (a > 0) { out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a); out.data[o + 3] = Math.round(a / c * 255); }
  }
  return PNG.sync.write(out);
}
for (const n of [64, 128, 256, 512]) fs.writeFileSync(path.join(root, `src/assets/logo-${n}.png`), resize(n));
// Favicon: 17 columns x 24 rows lattice, pitch 52.4 x 47.7, centres sampled from real pixels.
const opaque = PNG.sync.read(fs.readFileSync(path.join(root, 'brand/LOGO OVXA PNG.png')));
const bgI = 0; const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
const bg = hex(opaque.data[bgI], opaque.data[bgI + 1], opaque.data[bgI + 2]);
const COLS = 17, ROWS = 24, PX = 52.4, PY = 47.7, X0 = 578.8, Y0 = 456, cell = 1.25;
const left = (32 - COLS * cell) / 2, top = (32 - ROWS * cell) / 2; let rects = '';
for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
  const sx = Math.round(X0 + PX * i), sy = Math.round(Y0 + PY * j), k = (sy * W + sx) * 4;
  if (D[k + 3] < 128 || (D[k] + D[k + 1] + D[k + 2]) / 3 < 25) continue;
  rects += `<rect x="${(left + i * cell).toFixed(2)}" y="${(top + j * cell).toFixed(2)}" width="1.1" height="1.1" fill="${hex(D[k], D[k + 1], D[k + 2])}"/>`;
}
fs.writeFileSync(path.join(root, 'src/assets/favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><rect width="32" height="32" rx="7" fill="${bg}"/>${rects}</svg>\n`);
console.log('assets ok', side, bg, (rects.match(/<rect/g) || []).length, 'tiles');
