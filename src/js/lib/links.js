// Link rule: the record stores a URL, the handle is derived from it, and unstated records never get an href.
const HOSTS = { x: ['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'], github: ['github.com', 'www.github.com'] };

export function socialView(kind, rec) {
  const inert = { kind, href: null, handle: null, active: false };
  if (!rec || rec.state !== 'stated' || typeof rec.url !== 'string') return inert;
  let u;
  try { u = new URL(rec.url); } catch { return inert; }
  if (u.protocol !== 'https:' || !HOSTS[kind].includes(u.hostname.toLowerCase())) return inert;
  const parts = u.pathname.split('/').filter(Boolean);
  if (!parts.length) return inert;
  const handle = kind === 'x' ? '@' + parts[0] : parts.slice(0, 2).join('/');
  return { kind, href: u.href, handle, active: true };
}
