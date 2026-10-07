// One-off: pulls human-readable strings out of the fetched reference bundle so the copy gate has a corpus.
import fs from 'node:fs';
const dir = process.argv[2];
const html = fs.readFileSync(dir + '/index.html', 'utf8').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ');
const attrs = [...html.matchAll(/(?:content|aria-label|title|placeholder)="([^"]+)"/g)].map(m => m[1]);
const text = html.replace(/<[^>]+>/g, ' ');
const js = fs.readFileSync(dir + '/app.js', 'utf8');
const lits = [...js.matchAll(/(["'`])((?:\.|(?!\1)[^\\n]){12,400})\1/g)].map(m => m[2]).filter(s => /[a-z]{3,} [a-z]{3,}/i.test(s) && !/[{};=]|https?:|\$\{/.test(s.replace(/<[^>]+>/g, ' ')));
const tpl = [...js.matchAll(/>([^<>{}$`]{8,300})</g)].map(m => m[1]);
fs.writeFileSync('tools/fixtures/reference-copy.txt', [text, ...attrs, ...lits, ...tpl].join('\n').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/[ \t]+/g, ' '));
