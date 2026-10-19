// ================= INDICATORS =================
function sma(a, p) {
  const o = new Array(a.length).fill(null);
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i];
    if (i >= p) s -= a[i - p];
    if (i >= p - 1) o[i] = s / p;
  }
  return o;
}
function ema(a, p) { // seed bằng SMA để ổn định
  const o = new Array(a.length).fill(null);
  if (a.length < p) return o;
  const k = 2 / (p + 1);
  let s = 0;
  for (let i = 0; i < p; i++) s += a[i];
  let e = s / p;
  o[p - 1] = e;
  for (let i = p; i < a.length; i++) {
    e = a[i] * k + e * (1 - k);
    o[i] = e;
  }
  return o;
}
function rsi(c, p = 14) { // Wilder
  const o = new Array(c.length).fill(null);
  if (c.length <= p) return o;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) {
    const d = c[i] - c[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  g /= p; l /= p;
  o[p] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = p + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    const up = d > 0 ? d : 0, dn = d < 0 ? -d : 0;
    g = (g * (p - 1) + up) / p;
    l = (l * (p - 1) + dn) / p;
    o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return o;
}
function emaOnValid(vals, p) { // EMA trên mảng có null đầu
  const idx = [], clean = [];
  vals.forEach((v, i) => { if (v !== null && isFinite(v)) { idx.push(i); clean.push(v); } });
  const o = new Array(vals.length).fill(null);
  if (clean.length < p) return o;
  const k = 2 / (p + 1);
  let s = 0;
  for (let i = 0; i < p; i++) s += clean[i];
  let e = s / p;
  o[idx[p - 1]] = e;
  for (let i = p; i < clean.length; i++) {
    e = clean[i] * k + e * (1 - k);
    o[idx[i]] = e;
  }
  return o;
}
function macd(c, f = 12, s = 26, sig = 9) {
  const ef = ema(c, f), es = ema(c, s);
  const line = c.map((_, i) => (ef[i] === null || es[i] === null || !isFinite(ef[i]) || !isFinite(es[i])) ? null : ef[i] - es[i]);
  const signal = emaOnValid(line, sig);
  const hist = line.map((v, i) => (v === null || signal[i] === null) ? null : v - signal[i]);
  return { line, signal, hist };
}
function atr(h, l, c, p = 14) { // Wilder RMA
  const o = new Array(c.length).fill(null);
  if (c.length <= p) return o;
  const tr = [];
  for (let i = 0; i < c.length; i++) {
    if (i === 0) tr.push(h[i] - l[i]);
    else tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  }
  let a = 0;
  for (let i = 0; i < p; i++) a += tr[i];
  a /= p;
  o[p - 1] = a;
  for (let i = p; i < tr.length; i++) {
    a = (a * (p - 1) + tr[i]) / p;
    o[i] = a;
  }
  return o;
}
function stdev(a, p) {
  const o = new Array(a.length).fill(null);
  for (let i = p - 1; i < a.length; i++) {
    const sl = a.slice(i - p + 1, i + 1);
    const m = sl.reduce((x, y) => x + y, 0) / p;
    o[i] = Math.sqrt(sl.reduce((x, y) => x + (y - m) * (y - m), 0) / p);
  }
  return o;
}
// MTF bias nhanh
function mtfBias(closes) {
  if (closes.length < 60) return { bias: "?", txt: "thiếu nến" };
  const e20 = ema(closes, 20), e50 = ema(closes, 50);
  const last = closes[closes.length - 1], a = e20[e20.length - 1], b = e50[e50.length - 1];
  if (last > a && a > b) return { bias: "LONG", txt: "Giá>EMA20>EMA50" };
  if (last < a && a < b) return { bias: "SHORT", txt: "Giá<EMA20<EMA50" };
  return { bias: "MID", txt: "giằng co" };
}