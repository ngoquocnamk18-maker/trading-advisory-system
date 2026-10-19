// ================= NEWS + SENTIMENT (bộ lọc rủi ro — không lái tín hiệu) =================
// Nguồn: CryptoCompare news API (CORS-friendly, không cần proxy) + Fear&Greed.
// Ghi chú: fetchTextProxy giữ lại để tương thích nhưng không còn dùng cho RSS.
// Depends on: CONFIG, fetchJSON, $, timeAgo
const NEWS_CACHE = { data: null, ts: 0, fg: null, fgTs: 0, sym: null };

async function fetchTextProxy(target, timeoutMs = 9000) {
  // LƯU Ý: RSS CoinDesk/CoinTelegraph/Decrypt không bật CORS nên KHÔNG fetch
  // trực tiếp (sẽ gây lỗi đỏ CORS trong Console). Chỉ đi qua proxy cho phép CORS.
  let lastErr = null;
  for (const p of CONFIG.PROXIES) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    try {
      const r = await fetch(p + encodeURIComponent(target), { signal: c.signal, cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      // allorigins /get trả JSON {contents:"..."} — tách ra
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      let txt;
      if (p.includes("/get?") || ct.includes("application/json")) {
        try { const j = await r.json(); txt = j.contents || j.data || ""; }
        catch (e) { txt = await r.text(); }
      } else {
        txt = await r.text();
        // phòng khi proxy vẫn trả JSON dạng text
        if (txt.trim().startsWith("{") && txt.includes("contents")) {
          try { txt = JSON.parse(txt).contents || txt; } catch (e) {}
        }
      }
      clearTimeout(t);
      if (txt && txt.length > 200 && txt.includes("<")) return txt;
      throw new Error("proxy empty");
    } catch (e) { lastErr = e; clearTimeout(t); }
  }
  throw lastErr || new Error("proxy fail");
}

function scoreNews(title, desc) {
  const t = (title + " " + desc).toLowerCase();
  const high = ["hack", "exploit", "bankrupt", "bankruptcy", "delist", "lawsuit", "sec sues", "sued by sec", "freeze", "suspends withdrawal", "suspension", "flash crash", "depeg", "scam", "fraud charges"];
  const mid = ["unlock", "unlocks", "listing", "delisting", "sec ", "etf decision", "fomc", "cpi ", "ppi ", "fed ", "rate hike", "rate cut", "regulation", "outflow", "inflow", "whale", "liquidation", "liquidations", "warning", "investigation"];
  for (const k of high) if (t.includes(k)) return { level: "HIGH", pen: 12, tag: k };
  for (const k of mid) if (t.includes(k)) return { level: "MID", pen: 6, tag: k };
  return { level: "LOW", pen: 0, tag: "general" };
}

async function loadFG() {
  try {
    if (NEWS_CACHE.fg && Date.now() - NEWS_CACHE.fgTs < CONFIG.NEWS_CACHE_TTL_MS) return NEWS_CACHE.fg;
    const { data } = await fetchJSON("https://api.alternative.me/fng/?limit=1&format=json", 8000);
    const v = parseInt(data.data[0].value, 10), vc = data.data[0].value_classification;
    NEWS_CACHE.fg = { v, vc }; NEWS_CACHE.fgTs = Date.now();
    return NEWS_CACHE.fg;
  } catch (e) { return null; }
}

function renderFG(fg) {
  if (!fg) {
    $("fgLabel").textContent = "Fear & Greed: không tải được";
    $("fgDesc").textContent = "Check tay: alternative.me/crypto/fear-and-greed-index";
    return { pen: 4, warn: "🟡 Không tải được Fear&Greed — kiểm tra tay tâm lý thị trường." };
  }
  $("fgLabel").textContent = `Fear & Greed: ${fg.v} — ${fg.vc}`;
  $("fgNeedle").style.transform = `rotate(${-90 + fg.v * 1.8}deg)`;
  let pen = 0, warn = null, txt = "";
  if (fg.v >= 75) { pen = 8; txt = "Tham lam cực độ: long đuổi FOMO rất rủi ro, chờ funding reset + về EMA20."; warn = "🟡 Fear&Greed " + fg.v + " (Extreme Greed): đám đông tham lam — không LONG đuổi, giảm nửa size futures."; }
  else if (fg.v >= 55) { txt = "Tham lam: ưu tiên chốt từng phần, không tăng đòn bẩy."; }
  else if (fg.v > 45) { txt = "Trung tính: giao dịch theo kỹ thuật bình thường."; }
  else if (fg.v > 25) { txt = "Sợ hãi: short đuổi dễ kẹt, chờ phân kỳ + hồi kỹ thuật."; }
  else { pen = 6; txt = "Sợ hãi cực độ: biến động 2 đầu mạnh, chỉ scalp nhỏ hoặc đứng ngoài."; warn = "🟡 Fear&Greed " + fg.v + " (Extreme Fear): hoảng loạn — short đuổi rủi ro, giảm size, chờ ổn định."; }
  $("fgDesc").textContent = txt;
  return { pen, warn };
}

async function loadNews(sym, base) {
  const listEl = $("newsList");
  listEl.innerHTML = `<div class="news-item" style="color:#9aa4b2">Đang tải tin 24-48h...</div>`;
  const fg = await loadFG();
  const fgR = renderFG(fg);
  let items = [];
  try {
    if (NEWS_CACHE.data && Date.now() - NEWS_CACHE.ts < CONFIG.NEWS_CACHE_TTL_MS && NEWS_CACHE.sym === sym) {
      items = NEWS_CACHE.data;
    } else {
      // Nguồn CORS-friendly (CryptoCompare cho phép CORS, không cần proxy → hết lỗi đỏ Console)
      const r = await fetchJSON("https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=top", 9000).catch(() => null);
      const raw = r && r.data && r.data.Data ? r.data.Data : [];
      items = raw.slice(0, 30).map(n => ({
        src: n.source || "Crypto",
        title: n.title || "",
        link: n.url || n.guid || "#",
        desc: (n.body || "").slice(0, 180),
        pub: (n.published_on || Date.now() / 1000) * 1000,
        currencies: (n.currencies || "").toUpperCase()
      })).filter(x => x.title);
      NEWS_CACHE.data = items; NEWS_CACHE.ts = Date.now(); NEWS_CACHE.sym = sym;
    }
  } catch (e) { items = []; }
  if (!items.length) {
    listEl.innerHTML = `<div class="news-item">⚠️ Không tải được tin (API bận). Kiểm tra tay:<br>
    • <a href="https://www.binance.com/en/support/announcement" target="_blank">Binance Announcements</a><br>
    • <a href="https://www.coindesk.com/" target="_blank">CoinDesk</a> • <a href="https://cointelegraph.com/" target="_blank">CoinTelegraph</a><br>
    • <a href="https://alternative.me/crypto/fear-and-greed-index/" target="_blank">Fear & Greed</a></div>`;
    return { pen: (fgR.pen || 0) + 4, warns: [fgR.warn, "🟡 Không tải được tin tức — tự kiểm tra Binance Announcements trước khi mở futures."].filter(Boolean) };
  }
  const rel = items.map(x => {
    const s = scoreNews(x.title, x.desc + " " + (x.currencies || ""));
    const hay = ((x.title + " " + x.desc + " " + (x.currencies || "")).toUpperCase());
    const hitSym = hay.includes(base) || (x.currencies || "").split(",").map(s2 => s2.trim()).includes(base);
    const fresh = (Date.now() - x.pub) < 48 * 3600 * 1000;
    return { ...x, ...s, hitSym, fresh, effPen: (fresh ? (hitSym ? s.pen + 2 : s.pen) : Math.round(s.pen / 2)) };
  }).sort((a, b) => (b.hitSym - a.hitSym) || (b.effPen - a.effPen) || (b.pub - a.pub)).slice(0, 8);
  const totalPen = Math.min(20, rel.reduce((t, x) => t + x.effPen, 0) + (fgR.pen || 0));
  listEl.innerHTML = rel.map(x => `<div class="news-item">
    <span class="tag ${x.level === "HIGH" ? "t-high" : x.level === "MID" ? "t-mid" : "t-low"}">${x.level}</span>${x.hitSym ? `<span class="tag t-sym">${base}</span>` : ""}<b>${x.title}</b><br>
    <span style="color:#9aa4b2">${x.src} • ${timeAgo(x.pub)} • từ khóa: ${x.tag} • ${x.desc}...</span><br>
    <a href="${x.link}" target="_blank">Đọc gốc →</a></div>`).join("")
    + `<div class="news-item" style="color:#9aa4b2">Nguồn: CryptoCompare API (CORS-friendly) + cache 10 phút. Tin chỉ trừ độ tin cậy, không đảo LONG/SHORT.</div>`;
  const warns = [];
  if (fgR.warn) warns.push(fgR.warn);
  const highs = rel.filter(x => x.level === "HIGH" && x.fresh);
  if (highs.length) warns.push(`🔴 ${highs.length} tin HIGH 48h qua (${highs[0].title.slice(0, 90)}...) — giảm nửa size futures hoặc đứng ngoài.`);
  else if (rel.some(x => x.level === "MID" && x.fresh && x.hitSym)) warns.push(`🟡 Có tin MID liên quan ${base} trong 48h — chờ tin ngấm, SL rộng 1.5×ATR.`);
  return { pen: totalPen, warns };
}
