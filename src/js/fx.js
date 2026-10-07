// Visual effects: matrix canvas, load wipe, scroll progress, parallax, reveals, count-up, flash.
export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* Matrix field: glyph columns on the same 22px cell grid as the load wipe. */
export function startMatrix(canvas) {
  const ctx = canvas.getContext('2d');
  const glyphs = '01OVXA▪▫░▒';
  const cell = parseInt(token('--cell'), 10) || 22;
  const cols = { head: token('--face-hi'), mid: token('--blue'), tail: token('--neon') };
  let w = 0, h = 0, drops = [], raf = 0, last = 0, visible = true;
  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2), r = canvas.getBoundingClientRect();
    w = Math.max(1, r.width); h = Math.max(1, r.height);
    canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drops = Array.from({ length: Math.ceil(w / cell) }, () => Math.random() * -h / cell);
    ctx.font = `500 ${cell - 6}px ${token('--mono')}`; ctx.textBaseline = 'top';
  }
  function frame(t) {
    raf = 0;
    if (!visible || document.hidden) return;
    if (t - last > 70) {
      last = t;
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      drops.forEach((y, i) => {
        const ch = glyphs[(Math.random() * glyphs.length) | 0], x = i * cell + 3;
        ctx.fillStyle = cols.mid; ctx.globalAlpha = 0.55; ctx.fillText(ch, x, (y - 1) * cell);
        ctx.fillStyle = Math.random() > 0.9 ? cols.head : cols.tail; ctx.globalAlpha = 0.95; ctx.fillText(ch, x, y * cell);
        ctx.globalAlpha = 1;
        drops[i] = y * cell > h && Math.random() > 0.975 ? Math.random() * -12 : y + 1;
      });
    }
    raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && !reduced) raf = requestAnimationFrame(frame); };
  size();
  if (reduced) { for (let k = 0; k < 60; k++) { drops = drops.map((y) => y + 1); } drops.forEach((y, i) => { ctx.fillStyle = cols.mid; ctx.globalAlpha = 0.4; ctx.fillText(glyphs[(i * 7) % glyphs.length], i * cell + 3, ((i * 13) % Math.ceil(h / cell)) * cell); }); return; }
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; kick(); }).observe(canvas);
  document.addEventListener('visibilitychange', kick);
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(size, 150); });
  kick();
}

/* Load wipe: 22px cells dissolve over 480ms with a per-cell random delay. */
export function wipe(canvas) {
  if (reduced) { canvas.remove(); return; }
  const dpr = Math.min(devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight, cell = parseInt(token('--cell'), 10) || 22, dur = 480;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cols = Math.ceil(W / cell), rows = Math.ceil(H / cell), start = performance.now(), fill = token('--bg');
  const delay = Array.from({ length: cols * rows }, (_, i) => ((i % cols) / cols * 0.5 + Math.random() * 0.5) * dur * 0.6);
  (function step(now) {
    const t = now - start; ctx.clearRect(0, 0, W, H); ctx.fillStyle = fill; let alive = 0;
    for (let i = 0; i < delay.length; i++) {
      const p = Math.min(1, Math.max(0, (t - delay[i]) / (dur * 0.4)));
      if (p < 1) { alive++; ctx.globalAlpha = 1 - p; const s = cell * (1 - p * 0.5), o = (cell - s) / 2; ctx.fillRect((i % cols) * cell + o, ((i / cols) | 0) * cell + o, s, s); }
    }
    if (alive) requestAnimationFrame(step); else canvas.remove();
  })(start);
}

/* Scroll progress bar, parallax roots and active nav. One rAF-throttled scroll handler. */
export function scrollFx() {
  const bar = document.getElementById('progress');
  const roots = [...document.querySelectorAll('[data-parallax]')];
  const links = [...document.querySelectorAll('[data-nav]')];
  const sections = [...new Set(links.map((a) => a.dataset.nav))].map((id) => document.getElementById(id)).filter(Boolean);
  let queued = false;
  function update() {
    queued = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.setProperty('--p', max > 0 ? Math.min(1, scrollY / max).toFixed(4) : '0');
    if (!reduced) for (const r of roots) { const b = r.getBoundingClientRect(); if (b.bottom > -200 && b.top < innerHeight + 200) r.style.setProperty('--sy', (-b.top).toFixed(1)); }
    let cur = sections[0];
    for (const s of sections) if (s.getBoundingClientRect().top <= innerHeight * 0.4) cur = s;
    for (const a of links) a.setAttribute('aria-current', String(cur && a.dataset.nav === cur.id));
  }
  const req = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  addEventListener('scroll', req, { passive: true }); addEventListener('resize', req); update();
}

export function reveals() {
  const els = [...document.querySelectorAll('.rv')];
  if (reduced || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  els.forEach((e) => io.observe(e));
  setTimeout(() => els.forEach((e) => e.classList.add('in')), 4000); // failsafe if observers never fire
}

/* Count-up with a colour flash on change. */
const running = new WeakMap();
export function setNumber(el, value, fmt, { duration = 600 } = {}) {
  const prev = el.__v;
  el.__v = value;
  if (running.has(el)) cancelAnimationFrame(running.get(el));
  if (reduced || !Number.isFinite(prev) || prev === value) { el.textContent = fmt(value); if (prev !== value && Number.isFinite(prev)) flash(el, value > prev); return; }
  const t0 = performance.now();
  (function step(now) {
    const p = Math.min(1, (now - t0) / duration), e = 1 - (1 - p) ** 3;
    el.textContent = fmt(prev + (value - prev) * e);
    if (p < 1) running.set(el, requestAnimationFrame(step)); else running.delete(el);
  })(t0);
  flash(el, value > prev);
}
export function countFrom(el, value, fmt, duration = 900) {
  if (reduced) { el.__v = value; el.textContent = fmt(value); return; }
  el.__v = 0; el.textContent = fmt(0); setNumber(el, value, fmt, { duration });
}
function flash(el, up) {
  const host = el.closest('.stat') || el;
  host.classList.remove('flash-up', 'flash-down'); void host.offsetWidth;
  host.classList.add(up ? 'flash-up' : 'flash-down');
  host.addEventListener('animationend', () => host.classList.remove('flash-up', 'flash-down'), { once: true });
}
