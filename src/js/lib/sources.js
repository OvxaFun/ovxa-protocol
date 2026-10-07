// Network data sources. Each resolves to plain numbers or throws, so pollers can back off.
import { DASH } from './format.js';

const json = async (res) => {
  if (!res.ok) throw new Error('http ' + res.status);
  return res.json();
};
const withTimeout = (ms) => {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
};

export async function getSlot(rpc) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot', params: [{ commitment: 'confirmed' }] });
  const r = await json(await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: withTimeout(6000) }));
  if (!Number.isInteger(r.result)) throw new Error('bad slot');
  return r.result;
}

export const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function pickChainTvl(chains, slug) {
  const hit = chains.find((c) => slugify(c.name) === slug) || chains.find((c) => c.gecko_id === slug);
  if (!hit || !Number.isFinite(hit.tvl)) throw new Error('slug not found');
  return hit.tvl;
}
export async function getTvl(slug) {
  return pickChainTvl(await json(await fetch('https://api.llama.fi/v2/chains', { signal: withTimeout(8000) })), slug);
}

export const smallImage = (u) => u.replace(/width=\d+/, 'width=64').replace(/height=\d+/, 'height=64');

export function normalizePairs(list) {
  const seen = new Set();
  return list
    .filter((p) => p && p.chainId === 'solana' && p.baseToken && Number.isFinite(+p.priceUsd) && !seen.has(p.pairAddress) && seen.add(p.pairAddress))
    .map((p) => ({
      id: p.pairAddress,
      base: p.baseToken.symbol || DASH,
      quote: p.quoteToken ? p.quoteToken.symbol : DASH,
      dex: p.dexId || '',
      price: +p.priceUsd,
      change: Number.isFinite(+(p.priceChange || {}).h24) ? +p.priceChange.h24 : NaN,
      volume: Number((p.volume || {}).h24) || 0,
      liquidity: Number((p.liquidity || {}).usd) || 0,
      mint: p.baseToken.address || '',
      logo: p.info && typeof p.info.imageUrl === 'string' ? smallImage(p.info.imageUrl) : null,
    }));
}
// Boosted Solana tokens first (they carry logos), then their pools; search is the fallback if that path fails.
async function viaBoosts() {
  const boosts = await json(await fetch('https://api.dexscreener.com/token-boosts/top/v1', { signal: withTimeout(8000) }));
  const mints = [...new Set(boosts.filter((b) => b.chainId === 'solana').map((b) => b.tokenAddress))].slice(0, 30);
  if (!mints.length) throw new Error('no boosted tokens');
  return json(await fetch('https://api.dexscreener.com/tokens/v1/solana/' + mints.join(','), { signal: withTimeout(8000) }));
}
async function viaSearch() {
  const all = await Promise.all(['SOL USDC', 'SOL USDT'].map(async (q) => {
    const d = await json(await fetch('https://api.dexscreener.com/latest/dex/search?q=' + encodeURIComponent(q), { signal: withTimeout(8000) }));
    return d.pairs || [];
  }));
  return all.flat();
}
/** One pool per base token, the busiest, ranked by 24h volume. */
export function topPairs(list) {
  const best = new Map();
  for (const p of normalizePairs(list)) {
    const k = p.mint || p.id;
    if (!best.has(k) || best.get(k).volume < p.volume) best.set(k, p);
  }
  return [...best.values()].sort((a, b) => b.volume - a.volume);
}
export async function getPairs() {
  let pairs = [];
  try { pairs = topPairs(await viaBoosts()); } catch { /* fall through to search */ }
  if (pairs.length < 4) pairs = topPairs(await viaSearch());
  if (!pairs.length) throw new Error('no pairs');
  return pairs;
}
