// ================= MARKET (MTF + derivatives + backtest + journal) =================
// Depends on: CONFIG (config.js), tryFetch/cleanKlines (utils.js), ema/rsi/atr/mtfBias (indicators.js)

async function loadMTF(sym) {
  const tfs = ["1d", "4h", "1h"];
  const out = await Promise.all(tfs.map(async tf => {
    try {
      const r = await tryFetch(CONFIG.FUT_BASES, `/fapi/v1/klines?symbol=${sym}&interval=${tf}&limit=80`);
      return { tf, ...mtfBias(cleanKlines(r.data).map(k => k.c)) };
    } catch (e) {
      try {
        const r = await tryFetch(CONFIG.SPOT_BASES, `/api/v3/klines?symbol=${sym}&interval=${tf}&limit=80`);
        return { tf, ...mtfBias(cleanKlines(r.data).map(k => k.c)) };
      } catch (e2) { return { tf, bias: "?", txt: "lỗi mạng" }; }
    }
  }));
  return out;
}

async function loadDerivHist(sym) {
  let oiH = [], fundH = [], fundT = [];
  const r1 = await tryFetch(CONFIG.FUT_BASES, `/futures/data/openInterestHist?symbol=${sym}&period=1h&limit=12`).catch(() => null);
  if (r1 && r1.data) oiH = r1.data.map(x => ({
    t: x.timestamp,
    c: +((x.sumOpenInterestValue !== undefined ? x.sumOpenInterestValue : x.sumOpenInterest)),
    coin: +(x.sumOpenInterest)
  })).filter(x => isFinite(x.c) && x.c > 0);
  const r2 = await tryFetch(CONFIG.FUT_BASES, `/fapi/v1/fundingRate?symbol=${sym}&limit=5`).catch(() => null);
  if (r2 && r2.data) {
    fundH = r2.data.map(x => +x.fundingRate * 100);
    fundT = r2.data.map(x => x.fundingTime);
  }
  return { oiH, fundH, fundT };
}

function detectSqueeze(oiH, priceChg) {
  if (!oiH || oiH.length < 6) return { txt: "OI history thiếu — không kết luận squeeze.", risk: 0, d: 0, a: 0, b: 0, n: oiH ? oiH.length : 0 };
  const a = oiH.slice(0, 3).reduce((s, x) => s + x.c, 0) / 3;
  const b = oiH.slice(-3).reduce((s, x) => s + x.c, 0) / 3;
  if (!a || !isFinite(a) || !isFinite(b)) return { txt: "OI history thiếu — không kết luận squeeze.", risk: 0, d: 0, a: 0, b: 0, n: oiH.length };
  const d = (b - a) / a * 100;
  if (d > 4 && priceChg > 1) return { txt: `OI +${d.toFixed(1)}% + giá +${priceChg}%: LONG FOMO, coi chừng long-squeeze.`, risk: 6, d, a, b, n: oiH.length };
  if (d > 4 && priceChg < -1) return { txt: `OI +${d.toFixed(1)}% + giá ${priceChg}%: SHORT ép, coi chừng short-squeeze hồi.`, risk: 6, d, a, b, n: oiH.length };
  if (d < -4) return { txt: `OI ${d.toFixed(1)}%: chốt lời hàng loạt, trend yếu dần.`, risk: 3, d, a, b, n: oiH.length };
  return { txt: `OI ${d >= 0 ? "+" : ""}${d.toFixed(1)}%: bình thường.`, risk: 0, d, a, b, n: oiH.length };
}

function fmtOI(v) {
  if (!isFinite(v) || v <= 0) return "—";
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
  return "$" + v.toFixed(0);
}

function backtest(kl) {
  const c = kl.map(k => k.c), h = kl.map(k => k.h), l = kl.map(k => k.l);
  const e20 = ema(c, 20), e50 = ema(c, 50), rr = rsi(c, 14), aa = atr(h, l, c, 14);
  let wins = 0, losses = 0, rSum = 0;
  for (let i = 60; i < c.length - 1; i++) {
    if (e20[i] === null || e50[i] === null || rr[i] === null || aa[i] === null) continue;
    let s = 0;
    s += c[i] > e20[i] ? 1 : -1;
    s += e20[i] > e50[i] ? 1 : -1;
    s += rr[i] > 55 ? 1 : rr[i] < 45 ? -1 : 0;
    let dir = 0;
    if (s >= 0.5) dir = 1; else if (s <= -0.5) dir = -1; else continue;
    const slA = aa[i] * 1.5, entry = c[i];
    const nx = i + 1, hi = h[nx], lo = l[nx];
    let r = 0, win = false;
    if (dir === 1) {
      if (lo <= entry - slA) r = -1;
      else if (hi >= entry + slA) { r = 1; win = true; }
      else r = (c[nx] - entry) / slA;
    } else {
      if (hi >= entry + slA) r = -1;
      else if (lo <= entry - slA) { r = 1; win = true; }
      else r = (entry - c[nx]) / slA;
    }
    rSum += r; win ? wins++ : losses++;
    i += 1; // tránh trade chồng nến
  }
  const n = wins + losses;
  return { n, wins, losses, wr: n ? wins / n * 100 : 0, avgR: n ? rSum / n : 0 };
}

function saveLog(e) {
  try {
    const k = "ta_log_v1";
    const arr = JSON.parse(localStorage.getItem(k) || "[]");
    arr.unshift(e);
    while (arr.length > (CONFIG.MAX_LOG_ENTRIES || 60)) arr.pop();
    localStorage.setItem(k, JSON.stringify(arr));
    renderLog();
  } catch (err) {}
}

function renderLog() {
  try {
    const arr = JSON.parse(localStorage.getItem("ta_log_v1") || "[]");
    if (!arr.length) { $("logOut").innerHTML = "Chưa có lịch sử."; return; }
    $("logOut").innerHTML = `<table class="score-table"><tr><th>Giờ</th><th>Coin</th><th>Khung</th><th>Score</th><th>Conf</th><th>Giá</th></tr>${arr.slice(0, 10).map(x => `<tr><td>${x.t}</td><td>${x.sym}</td><td>${x.itv}</td><td>${x.score}</td><td>${x.conf}%</td><td>${x.px}</td></tr>`).join("")}</table><div style="color:#9aa4b2;font-size:.78rem">Lưu ${arr.length}/${CONFIG.MAX_LOG_ENTRIES || 60} bản ghi gần nhất trên máy bạn.</div>`;
  } catch (err) {}
}
