// ================= CHARTS =================
// Depends on: $ (utils.js). Requires Chart.js loaded via CDN.
let charts = {};

function drawOI(oiH) {
  try {
    if (typeof Chart === "undefined") { $("oiBox").innerHTML += " (Chart.js chưa tải — kiểm tra mạng CDN)."; return; }
    if (charts.oi) charts.oi.destroy();
    if (!oiH || !oiH.length) return;
    const labels = oiH.map(x => new Date(x.t).toLocaleString("vi-VN", { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }));
    const vals = oiH.map(x => x.c);
    const coins = oiH.map(x => x.coin);
    const allSame = vals.length > 1 && Math.max(...vals) === Math.min(...vals);
    charts.oi = new Chart($("oiChart"), { type: "line", data: { labels, datasets: [{ label: allSame ? "OI (phẳng — Binance trả 12 điểm trùng, xem số $ trên)" : "OI ($)", data: vals, borderColor: "#4da3ff", pointRadius: 2, borderWidth: 1.5, tension: .25, spanGaps: true }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "#e6e8ec", boxWidth: 12 } }, tooltip: { callbacks: { label: ctx => "OI: $" + Number(ctx.parsed.y).toLocaleString("en-US") + (coins[ctx.dataIndex] ? " (" + Number(coins[ctx.dataIndex]).toLocaleString("en-US", { maximumFractionDigits: 1 }) + " coin)" : "") } } }, scales: { x: { ticks: { color: "#9aa4b2", maxTicksLimit: 6 }, grid: { color: "#1a2233" } }, y: { ticks: { color: "#9aa4b2", callback: v => "$" + (+v >= 1e9 ? (+v / 1e9).toFixed(1) + "B" : +v >= 1e6 ? (+v / 1e6).toFixed(0) + "M" : +v) }, grid: { color: "#1a2233" } } } } });
  } catch (e) {}
}

function drawCharts(labels, c, e20, e50, up, lo, rsiA, mac) {
  if (typeof Chart === "undefined") { $("status").textContent += " | Chart.js chưa tải (CDN chặn) — số liệu vẫn hiện, chart trống."; return; }
  for (const k of ["price", "rsi", "macd"]) { if (charts[k]) charts[k].destroy(); }
  charts.price = new Chart($("priceChart"), {
    type: "line", data: {
      labels, datasets: [
        { label: "Close", data: c, borderColor: "#00e5a0", pointRadius: 0, borderWidth: 1.6, tension: .2, spanGaps: true },
        { label: "EMA20", data: e20, borderColor: "#ffcf4d", pointRadius: 0, borderWidth: 1, borderDash: [5, 4], spanGaps: true },
        { label: "EMA50", data: e50, borderColor: "#4da3ff", pointRadius: 0, borderWidth: 1, borderDash: [5, 4], spanGaps: true },
        { label: "BB upper", data: up, borderColor: "#ff5c5c55", pointRadius: 0, borderWidth: 1, spanGaps: true },
        { label: "BB lower", data: lo, borderColor: "#ff5c5c55", pointRadius: 0, borderWidth: 1, spanGaps: true },
      ]
    }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { labels: { color: "#e6e8ec" } } }, scales: { x: { ticks: { color: "#9aa4b2", maxTicksLimit: 8 }, grid: { color: "#1a2233" } }, y: { ticks: { color: "#9aa4b2" }, grid: { color: "#1a2233" } } } }
  });
  charts.rsi = new Chart($("rsiChart"), { type: "line", data: { labels, datasets: [{ label: "RSI14", data: rsiA, borderColor: "#c792ea", pointRadius: 0, borderWidth: 1.5, spanGaps: true }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "#e6e8ec" } } }, scales: { x: { display: false }, y: { min: 0, max: 100, ticks: { color: "#9aa4b2" }, grid: { color: "#1a2233" } } } } });
  charts.macd = new Chart($("macdChart"), { type: "bar", data: { labels, datasets: [{ type: "line", label: "MACD", data: mac.line, borderColor: "#00e5a0", pointRadius: 0, spanGaps: true }, { type: "line", label: "Signal", data: mac.signal, borderColor: "#ffcf4d", pointRadius: 0, spanGaps: true }, { label: "Hist", data: mac.hist, backgroundColor: "#4da3ff88" }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "#e6e8ec" } } }, scales: { x: { display: false }, y: { ticks: { color: "#9aa4b2" }, grid: { color: "#1a2233" } } } } });
}
