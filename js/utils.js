// ================= UTILS =================
async function fetchJSON(url, timeoutMs = 8000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  const t0 = performance.now();
  try {
    const r = await fetch(url, { signal: c.signal, cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status + " @" + url);
    return { data: await r.json(), latency: Math.round(performance.now() - t0) };
  } finally {
    clearTimeout(t);
  }
}
async function tryFetch(bases, path) {
  let lastErr = null;
  for (const b of bases) {
    try {
      const { data, latency } = await fetchJSON(b + path);
      return { data, host: b, latency };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("All endpoints failed: " + path);
}
const $ = id => document.getElementById(id);
const fmtP = x => Number(x).toLocaleString("en-US", { maximumFractionDigits: x < 1 ? 5 : x < 10 ? 3 : x < 1000 ? 2 : 1 });
const fmtU = x => Number(x).toLocaleString("en-US", { maximumFractionDigits: 1 });
function timeAgo(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 3600) return Math.floor(s / 60) + "p trước";
  if (s < 86400) return Math.floor(s / 3600) + "h trước";
  return Math.floor(s / 86400) + "d trước";
}
function cleanKlines(kl) {
  const out = [];
  for (let i = 0; i < kl.length; i++) {
    const k = kl[i];
    const o = +k[1], h = +k[2], l = +k[3], c = +k[4];
    if (!isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c) || c <= 0 || h < l) continue;
    out.push({ t: k[0], o, h, l, c, v: +k[5], ct: k[6] });
  }
  return out;
}