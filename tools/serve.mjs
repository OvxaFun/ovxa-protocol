// Tiny static server for local checks: node tools/serve.mjs [dir] [port]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const dir = path.resolve(process.argv[2] || 'dist'), port = +process.argv[3] || 4173;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain' };
http.createServer((q, r) => {
  let p = path.join(dir, decodeURIComponent(q.url.split('?')[0])); if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(p, 'index.html');
  if (!p.startsWith(dir) || !fs.existsSync(p)) { r.writeHead(404); return r.end('not found'); }
  const h = { 'cache-control': 'no-store', 'content-type': (types[path.extname(p)] || 'application/octet-stream') + (path.extname(p) === '.html' || path.extname(p) === '.js' || path.extname(p) === '.css' ? '; charset=utf-8' : '') };
  if (path.extname(p) === '.html') { const m = fs.readFileSync(path.join(dir, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/); if (m) h['content-security-policy'] = m[1]; }
  r.writeHead(200, h); fs.createReadStream(p).pipe(r);
}).listen(port, () => console.log('serving', dir, port));
