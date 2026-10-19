// ================= APP (analyze + UI wiring) =================
// Depends on: CONFIG, utils, indicators, market, news, charts
let autoTimer = null;

async function analyze() {
  const sym = $("symbol").value, itv = $("interval").value, lim = Math.min(500, Math.max(60, +$("limit").value || 200));
  $("status").textContent = "Đang lấy dữ liệu " + sym + " " + itv + " ...";
  $("btn").disabled = true;
  try {
    const [sR, fR] = await Promise.all([
      tryFetch(CONFIG.SPOT_BASES, `/api/v3/klines?symbol=${sym}&interval=${itv}&limit=${lim}`).catch(e => ({ error: e })),
      tryFetch(CONFIG.FUT_BASES, `/fapi/v1/klines?symbol=${sym}&interval=${itv}&limit=${lim}`).catch(e => ({ error: e })),
    ]);
    const useFut = fR && !fR.error && fR.data && fR.data.length >= 60;
    const useSpot = sR && !sR.error && sR.data && sR.data.length >= 60;
    if (!useFut && !useSpot) throw new Error("Không lấy được nến (Binance chặn IP/VPN hoặc symbol sai). Chi tiết Fut: " + (fR.error ? fR.error.message : "?") + " | Spot: " + (sR.error ? sR.error.message : "?"));
    const src = useFut ? fR : sR;
    const srcName = useFut ? "Futures" : "Spot";
    const kl = cleanKlines(src.data);
    if (kl.length < 60) throw new Error("Dữ liệu bẩn/thiếu (chỉ " + kl.length + " nến hợp lệ). Thử lại sau.");
    const h = kl.map(k => k.h), l = kl.map(k => k.l), c = kl.map(k => k.c);
    const times = kl.map(k => new Date(k.t).toLocaleString("vi-VN", { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }));
    const lastT = kl[kl.length - 1], last = c[c.length - 1];
    const isLive = Date.now() - lastT.ct < 2 * ({ "15m": 9e5, "1h": 36e5, "4h": 144e5, "1d": 864e5 }[itv]);

    const e20 = ema(c, 20), e50 = ema(c, 50);
    const r = rsi(c, 14), m = macd(c, 12, 26, 9), a = atr(h, l, c, 14);
    const sma20 = sma(c, 20), sd20 = stdev(c, 20);
    const upper = c.map((_, i) => sma20[i] === null || sd20[i] === null ? null : sma20[i] + 2 * sd20[i]);
    const lower = c.map((_, i) => sma20[i] === null || sd20[i] === null ? null : sma20[i] - 2 * sd20[i]);
    const lastE20 = e20[e20.length - 1], lastE50 = e50[e50.length - 1], lastR = r[r.length - 1];
    const lastM = m.line[m.line.length - 1], lastS = m.signal[m.signal.length - 1];
    const lastATR = a[a.length - 1] || 0, atrPct = lastATR / last * 100;
    const up = upper[upper.length - 1], lo = lower[lower.length - 1];
    const bbW = (up - lo) / last * 100;
    const rets = []; for (let i = 1; i < c.length; i++) rets.push(Math.log(c[i] / c[i - 1]));
    const mr = rets.reduce((x, y) => x + y, 0) / rets.length;
    const hv = Math.sqrt(rets.reduce((x, y) => x + (y - mr) * (y - mr), 0) / rets.length) * Math.sqrt(CONFIG.PERIODS_PER_YEAR[itv]) * 100;

    let regime, cls;
    const vScore = atrPct + (bbW / 2);
    if (vScore < 1.2) { regime = "LOW — Siết, dễ breakout"; cls = "b-low"; }
    else if (vScore < 3.5) { regime = "NORMAL — Tiêu chuẩn"; cls = "b-norm"; }
    else if (vScore < 6) { regime = "HIGH — Mạnh, giảm size"; cls = "b-high"; }
    else { regime = "EXTREME — Tránh futures"; cls = "b-ext"; }
    const desc = `ATR ${atrPct.toFixed(2)}% • BB-width ${bbW.toFixed(2)}% • HV ~${hv.toFixed(1)}%/năm • Score biến động ${vScore.toFixed(2)} (ngưỡng: <1.2 LOW, <3.5 NORMAL, <6 HIGH, còn lại EXTREME). ` + (cls === "b-low" ? "Bollinger siết: chờ phá + retest, không đoán hướng trước." : cls === "b-norm" ? "Xu hướng rõ hơn, dùng EMA+RSI chia vị thế." : cls === "b-high" ? "Giãn SL 1.5×ATR, đòn bẩy 2-3x, chốt nhanh." : "Ngưng futures: dễ quét SL 2 đầu.");

    let funding = "—", oi = "—", basis = "—", mark = last, fundingVal = 0, basisPct = 0, lsr = "—";
    try {
      const [prem, fund, oiJ] = await Promise.all([
        tryFetch(CONFIG.FUT_BASES, `/fapi/v1/premiumIndex?symbol=${sym}`).catch(() => null),
        tryFetch(CONFIG.FUT_BASES, `/fapi/v1/fundingRate?symbol=${sym}&limit=1`).catch(() => null),
        tryFetch(CONFIG.FUT_BASES, `/fapi/v1/openInterest?symbol=${sym}`).catch(() => null),
      ]);
      if (prem && prem.data && prem.data.markPrice) { mark = +prem.data.markPrice; basisPct = (+prem.data.markPrice - +prem.data.indexPrice) / +prem.data.indexPrice * 100; basis = basisPct.toFixed(3) + "%"; }
      if (fund && fund.data && fund.data[0]) { fundingVal = +fund.data[0].fundingRate * 100; funding = fundingVal.toFixed(4) + "% (" + new Date(fund.data[0].fundingTime).toLocaleString("vi-VN", { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ")"; }
      if (oiJ && oiJ.data && oiJ.data.openInterest) oi = (+oiJ.data.openInterest).toLocaleString("en-US", { maximumFractionDigits: 0 });
    } catch (e) {}
    try { const r2 = await tryFetch(CONFIG.FUT_BASES, `/futures/data/globalLongShortAccountRatio?symbol=${sym}&period=1h&limit=1`).catch(() => null); if (r2 && r2.data && r2.data[0]) lsr = (+r2.data[0].longShortRatio).toFixed(2); } catch (e) {}
    let chg = "—"; try { const t = await tryFetch(CONFIG.FUT_BASES, `/fapi/v1/ticker/24hr?symbol=${sym}`).catch(() => null); if (t && t.data) chg = (+t.data.priceChangePercent).toFixed(2) + "%"; } catch (e) {}

    const rows = [];
    const push = (name, val, rule, pts) => rows.push({ name, val, rule, pts });
    push("Giá vs EMA20", fmtP(last) + " vs " + fmtP(lastE20), last > lastE20 ? "Giá trên EMA20" : "Giá dưới EMA20", last > lastE20 ? 1 : -1);
    push("EMA20 vs EMA50", fmtP(lastE20) + " vs " + fmtP(lastE50), lastE20 > lastE50 ? "EMA20 trên EMA50" : "EMA20 dưới EMA50", lastE20 > lastE50 ? 1 : -1);
    push("RSI(14)", lastR.toFixed(1), lastR > 55 ? "Khỏe >55" : lastR < 45 ? "Yếu <45" : "Trung tính 45-55", lastR > 55 ? 1 : lastR < 45 ? -1 : 0);
    if (lastM !== null && lastS !== null) push("MACD vs Signal", lastM.toFixed(2) + " vs " + lastS.toFixed(2), lastM > lastS ? "MACD trên Signal" : "MACD dưới Signal", lastM > lastS ? 0.5 : -0.5);
    else push("MACD vs Signal", "chưa đủ nến", "Không tính", 0);
    if (last > up) push("Bollinger", fmtP(last) + " > Upper " + fmtP(up), "Phá band trên: FOMO", 0.5);
    else if (last < lo) push("Bollinger", fmtP(last) + " < Lower " + fmtP(lo), "Thủng band dưới: bán tháo", -0.5);
    else push("Bollinger", "Trong band", "Trong band", 0);
    if (fundingVal > 0.05) push("Funding", funding, "Cao >+0.05%: long đông", -0.5);
    else if (fundingVal < -0.05) push("Funding", funding, "Âm sâu <-0.05%: short đông", 0.5);
    else push("Funding", funding.split(" ")[0], "Bình thường", 0);
    const score = rows.reduce((s, x) => s + x.pts, 0);

    let overall, ocls;
    if (score >= 2) { overall = "✅ LONG / MUA — Ưu tiên canh Buy dip"; ocls = "buy"; }
    else if (score >= 0.5) { overall = "↗️ Thiên LONG nhẹ — Chờ retest EMA20"; ocls = "buy"; }
    else if (score <= -2) { overall = "🔻 SHORT / BÁN — Ưu thế phe bán"; ocls = "sell"; }
    else if (score <= -0.5) { overall = "↘️ Thiên SHORT nhẹ — Chờ hồi để short"; ocls = "sell"; }
    else { overall = "⏸ SIDEWAY — Đứng ngoài / Scalp 2 đầu"; ocls = "neutral"; }
    const agree = Math.abs(score) / 4.5;
    const dataQ = Math.min(1, kl.length / 200);
    const volPenalty = cls === "b-ext" ? 0.4 : cls === "b-high" ? 0.75 : 1;
    const macdOk = (lastM !== null && lastS !== null) ? 1 : 0.7;
    const confBase = Math.round(Math.min(92, Math.max(15, (0.35 + 0.65 * agree) * dataQ * volPenalty * macdOk * 100)));
    $("mtf").textContent = "Đang tải đa khung + OI history...";
    const [mtfRes, derivHist] = await Promise.all([loadMTF(sym), loadDerivHist(sym)]);
    let mtfPen = 0, mtfWarn = null;
    const curBias = score >= 0.5 ? "LONG" : score <= -0.5 ? "SHORT" : "MID";
    const agreeN = mtfRes.filter(x => x.bias === curBias || (curBias === "MID" && x.bias === "MID")).length;
    const tf1d = mtfRes.find(x => x.tf === "1d");
    let mtfTxt = mtfRes.map(x => `${x.tf.toUpperCase()}: ${x.bias} (${x.txt})`).join(" • ");
    if (curBias !== "MID" && agreeN < 2) { mtfPen = 15; mtfWarn = `🟡 Lệch đa khung: khung ${itv} ${curBias} nhưng ${mtfTxt} — chỉ scalp nhỏ, không giữ futures.`; }
    else if (curBias !== "MID" && tf1d && tf1d.bias !== "MID" && tf1d.bias !== curBias) { mtfPen = 10; mtfWarn = `🟡 Ngược trend 1D (${tf1d.bias}): không giữ lệnh ${curBias} qua ngày.`; }
    else if (curBias === "MID") { mtfTxt += " — sideway, chờ đồng thuận 2/3 khung."; }
    const priceChg = chg !== "—" ? parseFloat(chg) : 0;
    const sq = detectSqueeze(derivHist.oiH, priceChg);
    const fundAvg = derivHist.fundH.length ? derivHist.fundH.reduce((s, x) => s + x, 0) / derivHist.fundH.length : fundingVal;
    const fundTrend = derivHist.fundH.length >= 3 && derivHist.fundH[derivHist.fundH.length - 1] > derivHist.fundH[0] + 0.02 ? "tăng dần (long vào thêm)" : derivHist.fundH.length >= 3 && derivHist.fundH[derivHist.fundH.length - 1] < derivHist.fundH[0] - 0.02 ? "giảm dần" : "ổn định";
    const bt = backtest(kl);
    const base = sym.replace("USDT", "").replace("USD", "").replace("PERP", "");
    let newsPen = 0, newsWarns = [];
    try {
      $("newsList").innerHTML = `<div class="news-item" style="color:#9aa4b2">Đang tải tin 24-48h cho ${base}...</div>`;
      const nr = await loadNews(sym, base);
      newsPen = nr.pen || 0; newsWarns = nr.warns || [];
    } catch (e) { newsPen = 4; newsWarns = ["🟡 Không tải được tin — kiểm tra tay Binance Announcements."]; }
    const conf = Math.max(5, confBase - newsPen - mtfPen - sq.risk);
    const deducts = [];
    if (newsPen > 0) deducts.push(`${newsPen}đ tin tức`);
    if (mtfPen > 0) deducts.push(`${mtfPen}đ lệch đa khung`);
    if (sq.risk > 0) deducts.push(`${sq.risk}đ squeeze/OI`);
    const confTxt = (conf >= 70 ? "CAO" : conf >= 45 ? "TRUNG BÌNH" : "THẤP — nên đứng ngoài hoặc size nhỏ") + (deducts.length ? ` (đã trừ ${deducts.join(" + ")})` : "");

    $("kpis").innerHTML = `
      <div class="kpi"><div class="l">Mark Price</div><div class="v">${fmtP(mark)}</div></div>
      <div class="kpi"><div class="l">24h Change</div><div class="v" style="color:${String(chg).startsWith("-") ? "#ff5c5c" : "#00e5a0"}">${chg}</div></div>
      <div class="kpi"><div class="l">Funding</div><div class="v" style="color:${fundingVal > 0.02 ? "#00e5a0" : fundingVal < -0.02 ? "#ff5c5c" : "#e6e8ec"}">${funding.split(" ")[0]}</div></div>
      <div class="kpi"><div class="l">Basis</div><div class="v">${basis.split(" ")[0]}</div></div>
      <div class="kpi"><div class="l">Open Interest</div><div class="v">${oi}</div></div>
      <div class="kpi"><div class="l">L/S Ratio</div><div class="v">${lsr}</div></div>
      <div class="kpi"><div class="l">ATR(14)</div><div class="v">${atrPct.toFixed(2)}%</div></div>
      <div class="kpi"><div class="l">RSI(14)</div><div class="v">${lastR ? lastR.toFixed(1) : "—"}</div></div>`;
    $("stamp").innerHTML = `
      <span>Nguồn: <b>${srcName}</b> (${src.host})</span>
      <span>Nến: <b>${kl.length}</b> × ${itv}</span>
      <span>Nến cuối: <b>${new Date(lastT.t).toLocaleString("vi-VN")}</b>${isLive ? " (đang chạy)" : " (đã đóng)"}</span>
      <span>Độ trễ: <b>${src.latency}ms</b></span>
      <span>Cập nhật: <b>${new Date().toLocaleString("vi-VN")}</b></span>`;
    $("overall").textContent = overall; $("overall").className = "sig " + ocls;
    $("confLabel").innerHTML = `Độ tin cậy: <b>${conf}% (${confTxt})</b> • Score <b>${score.toFixed(2)}</b>`; $("confBar").style.width = conf + "%";
    $("scores").innerHTML = `<table class="score-table"><tr><th>Yếu tố</th><th>Giá trị</th><th>Luận</th><th>Điểm</th></tr>${rows.map(x => `<tr><td>${x.name}</td><td>${x.val}</td><td>${x.rule}</td><td class="${x.pts > 0 ? "pos" : x.pts < 0 ? "neg" : "zero"}">${x.pts > 0 ? "+" : ""}${x.pts}</td></tr>`).join("")}</table>`;
    const mtfOk = agreeN >= 2 && (curBias === "MID" || mtfRes.filter(x => x.bias === curBias).length >= 2);
    $("mtfBadge").textContent = curBias === "MID" ? "SIDEWAY" : mtfOk ? `ĐỒNG THUẬN ${curBias} ${agreeN}/3` : `LỆCH ${agreeN}/3`;
    $("mtfBadge").className = "badge " + (mtfOk ? "b-low" : agreeN === 1 ? "b-norm" : "b-high");
    $("mtf").innerHTML = `Khung ${itv}: <b>${curBias}</b> • ${mtfTxt}${mtfPen > 0 ? ` • <b style="color:#ffcf4d">trừ ${mtfPen}đ tin cậy</b>` : " • đồng thuận tốt"}`;
    $("volRegime").textContent = regime; $("volRegime").className = "badge " + cls; $("volDesc").textContent = desc;

    const horizons = [
      { n: "1 nến tới (" + itv + ")", k: 1 },
      { n: "4 nến tới", k: 2 },
      { n: "24h (~" + (itv === "1d" ? "1 nến" : itv === "4h" ? "6 nến" : itv === "1h" ? "24 nến" : "96 nến") + ")", k: Math.sqrt(CONFIG.STEPS_PER_DAY[itv]) },
    ];
    $("volTable").innerHTML = horizons.map(hh => {
      const mv = atrPct * hh.k;
      const upP = last * (1 + mv / 100), dnP = last * (1 - mv / 100);
      return `<tr><td>${hh.n}</td><td>±${mv.toFixed(2)}%<br><span style="color:#9aa4b2">${fmtU(dnP)} — ${fmtU(upP)}</span></td><td>SL ≥ ${(mv * 1.2).toFixed(2)}% • TP ≥ ${(mv * 1.8).toFixed(2)}%</td></tr>`;
    }).join("");
    $("atrInfo").textContent = `ATR=${fmtU(lastATR)} (${atrPct.toFixed(2)}%) • Công thức: SL=1.5×ATR, TP1=1.5×ATR, TP2=2.5×ATR, TP3=4×ATR. SL tối thiểu 1.2×ATR để tránh nhiễu.`;
    $("deriv").innerHTML = `Funding hiện tại: <b>${funding}</b> • TB 5 kỳ: <b>${derivHist.fundH.length ? fundAvg.toFixed(4) + "%" : "—"}</b> (${fundTrend}) • Basis: <b>${basis}</b> • OI: <b>${oi}</b> • L/S: <b>${lsr}</b><br><span style="color:#9aa4b2">Funding &gt;+0.05% + giá tăng = long FOMO, cảnh giác long-squeeze. Funding âm sâu = short đông, dễ hồi.</span>`;
    const oiDetail = (sq.n >= 6 && isFinite(sq.a) && isFinite(sq.b))
      ? `<br><span style="color:#9aa4b2">OI 12h: ${sq.n} điểm • ${fmtOI(sq.a)} → <b>${fmtOI(sq.b)}</b> (${sq.d >= 0 ? "+" : ""}${sq.d.toFixed(1)}%) • Giá 24h ${chg}</span>`
      : `<br><span style="color:#9aa4b2">OI history: ${sq.n || 0}/12 điểm — Binance giới hạn, không kết luận squeeze.</span>`;
    const fundChips = derivHist.fundH.length
      ? `<br><span style="color:#9aa4b2">5 kỳ gần nhất: ${derivHist.fundH.map((v, i) => {
          const col = v > 0.02 ? "#00e5a0" : v < -0.02 ? "#ff5c5c" : "#9aa4b2";
          const tm = derivHist.fundT && derivHist.fundT[i] ? new Date(derivHist.fundT[i]).toLocaleString("vi-VN", { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ("kỳ " + (i + 1));
          return `<span title="${tm}" style="color:${col}">${v.toFixed(4)}%</span>`;
        }).join(" • ")} • TB <b>${fundAvg.toFixed(4)}%</b> (${fundTrend})</span>`
      : `<br><span style="color:#9aa4b2">Không lấy được funding history — dùng funding hiện tại ${funding.split(" ")[0]}.</span>`;
    $("oiBox").innerHTML = `${sq.txt}${oiDetail}${fundChips}`;
    drawOI(derivHist.oiH);

    let fw = [];
    if (mtfWarn) fw.push("🔴 " + mtfWarn.replace("🟡 ", ""));
    if (sq.risk >= 6) fw.push("🔴 " + sq.txt + " Giảm nửa size, không tăng đòn bẩy.");
    else if (sq.risk > 0) fw.push("🟡 " + sq.txt);
    if (cls === "b-ext") fw.push("🔴 EXTREME: cấm DCA futures, cấm gồng, chỉ scalp 1-2% vốn hoặc đứng ngoài.");
    if (Math.abs(fundingVal) > 0.05) fw.push(`🟡 Funding cực đoan (${funding.split(" ")[0]}): không FOMO theo đám đông.`);
    if (lastR > 70) fw.push(`🟡 RSI ${lastR.toFixed(1)} quá mua: long đuổi dễ đu đỉnh.`);
    if (lastR < 30) fw.push(`🟡 RSI ${lastR.toFixed(1)} quá bán: short đuổi dễ kẹt đáy.`);
    if (basisPct > 0.5) fw.push("🟡 Basis dương lớn: đừng market-buy futures, dùng limit hoặc spot.");
    if (conf < 45) fw.push(`🟡 Độ tin cậy THẤP (${conf}%): giảm nửa size hoặc đứng ngoài.`);
    for (const w of newsWarns) fw.push(w);
    if (!fw.length) fw.push("🟢 Không cảnh báo đỏ. Vẫn SL mọi lệnh futures, đòn bẩy 2-5x.");
    $("futWarn").innerHTML = fw.join("<br>");

    const slL = last - lastATR * 1.5, tp1 = last + lastATR * 1.5, tp2 = last + lastATR * 2.5, tp3 = last + lastATR * 4;
    const slS = last + lastATR * 1.5, tp1s = last - lastATR * 1.5, tp2s = last - lastATR * 2.5;
    $("spotPlan").innerHTML = `<ul class="rec">
      <li><b>Xu hướng ${itv}:</b> ${overall} (tin cậy ${conf}%)</li>
      <li><b>Vùng mua Spot/DCA:</b> ${fmtP(lastE20)} (EMA20) → ${fmtP(lo)} (BB dưới). Chia 3 phần.</li>
      <li><b>Cắt lỗ:</b> đóng ${itv} dưới ${fmtP(lastE50)} hoặc −8~12% NAV hạ 50%.</li>
      <li><b>Chốt:</b> ${fmtP(tp1)} → ${fmtP(tp2)} → giữ 20-30% dài hạn.</li></ul>`;
    $("futPlan").innerHTML = `<ul class="rec">
      <li><b>Bias:</b> ${overall}</li>
      <li><b>LONG:</b> ${fmtP(last)}–${fmtP(lastE20)} • SL ${fmtP(slL)} (−${((last - slL) / last * 100).toFixed(2)}% = 1.5×ATR) • TP ${fmtP(tp1)} / ${fmtP(tp2)} / ${fmtP(tp3)}</li>
      <li><b>SHORT:</b> ${fmtP(last)}–${fmtP(lastE20)} • SL ${fmtP(slS)} (+${((slS - last) / last * 100).toFixed(2)}%) • TP ${fmtP(tp1s)} / ${fmtP(tp2s)}</li>
      <li><b>Đòn bẩy:</b> ${cls === "b-ext" ? "ĐỨNG NGOÀI" : cls === "b-high" ? "2-3x" : "3-5x"} — Risk 0.5-1%/lệnh.</li></ul>`;
    $("entry").value = last.toFixed(last < 10 ? 3 : 1);
    $("sl").value = slL.toFixed(last < 10 ? 3 : 1);
    $("tp").value = tp1.toFixed(last < 10 ? 3 : 1);

    drawCharts(times, c, e20, e50, upper, lower, r, m);
    const btTxt = bt.n < 10 ? `Chỉ ${bt.n} lệnh đủ điều kiện — mẫu nhỏ, không kết luận.` : `${bt.n} lệnh • Win <b>${bt.wr.toFixed(1)}%</b> (${bt.wins}W/${bt.losses}L) • R TB <b style="color:${bt.avgR >= 0 ? "#00e5a0" : "#ff5c5c"}">${bt.avgR.toFixed(2)}R</b> ${bt.avgR < 0 ? "— score đang lỗ trên quá khứ, giảm size" : "— score ổn định trên quá khứ"}`;
    $("btOut").innerHTML = `Khung ${itv} • ${btTxt}<br><span style="color:#9aa4b2">Luật: LONG score≥0.5 / SHORT score≤-0.5, SL/TP 1.5×ATR, bỏ qua phí. Quá khứ không bảo đảm tương lai.</span>`;
    saveLog({ t: new Date().toLocaleString("vi-VN", { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), sym, itv, score: score.toFixed(2), conf, px: fmtP(last) });
    $("status").textContent = `Xong ${sym} ${itv} • ${kl.length} nến • MTF ${agreeN}/3 thuận • Backtest ${bt.n} lệnh ${bt.wr.toFixed(0)}% • ${new Date().toLocaleString("vi-VN")}`;
  } catch (err) { $("status").textContent = "❌ Lỗi: " + err.message + " — Bấm Phân tích lại hoặc đổi mạng/VPN."; }
  finally { $("btn").disabled = false; }
}

function buildPills() {
  const sp = $("symPills"), ip = $("ivPills");
  sp.innerHTML = CONFIG.DEFAULT_SYMBOLS.map(s => `<button class="pill" data-s="${s}">${s.replace("USDT", "")}</button>`).join("");
  ip.innerHTML = CONFIG.DEFAULT_INTERVALS.map(v => `<button class="pill iv" data-i="${v[0]}">${v[1]}</button>`).join("");
  const sync = () => {
    sp.querySelectorAll(".pill").forEach(b => b.classList.toggle("on", b.dataset.s === $("symbol").value));
    ip.querySelectorAll(".pill").forEach(b => b.classList.toggle("on", b.dataset.i === $("interval").value));
  };
  sp.querySelectorAll(".pill").forEach(b => b.onclick = () => { $("symbol").value = b.dataset.s; sync(); analyze(); });
  ip.querySelectorAll(".pill").forEach(b => b.onclick = () => { $("interval").value = b.dataset.i; sync(); analyze(); });
  sync();
  window.__syncPills = sync;
}

function bindUI() {
  $("btn").onclick = () => analyze();
  $("fabBtn").onclick = () => { analyze(); window.scrollTo({ top: 0, behavior: "smooth" }); };
  $("symbol").onchange = () => window.__syncPills && window.__syncPills();
  $("interval").onchange = () => window.__syncPills && window.__syncPills();
  $("newsBtn").onclick = async () => {
    const sym = $("symbol").value, base = sym.replace("USDT", "").replace("USD", "").replace("PERP", "");
    $("newsBtn").disabled = true;
    try { await loadNews(sym, base); } finally { $("newsBtn").disabled = false; }
  };
  $("calcBtn").onclick = () => {
    const acc = +$("acc").value || 0, rp = +$("riskPct").value || 1, en = +$("entry").value, sl = +$("sl").value, tp = +$("tp").value, lv = Math.min(125, Math.max(1, +$("lev").value || 1));
    if (!en || !sl || en <= 0 || sl <= 0) { $("calcOut").textContent = "Nhập Entry và SL > 0."; return; }
    if (en === sl) { $("calcOut").textContent = "Entry và SL không được bằng nhau."; return; }
    const riskUsd = acc * rp / 100, slPct = Math.abs(en - sl) / en * 100;
    if (slPct < 0.05) { $("calcOut").innerHTML = `SL chỉ cách <b class="red">${slPct.toFixed(3)}%</b> — quá sát, dễ bị quét. Giãn SL ≥ 1.2×ATR.`; return; }
    const qty = riskUsd / Math.abs(en - sl);
    const posVal = qty * en, marg = posVal / lv;
    const rr = tp ? (Math.abs(tp - en) / Math.abs(en - sl)) : 0;
    const liqLong = en * (1 - 1 / lv * 0.9), liqShort = en * (1 + 1 / lv * 0.9);
    const warn = marg > acc * 0.1 ? `<br><span class="red">⚠️ Ký quỹ $${marg.toFixed(2)} 10% vốn — giảm size hoặc giảm đòn bẩy.</span>` : "";
    const rrTxt = rr < 1.5 ? `<span class="red">R:R ${rr.toFixed(2)} thấp (nên ≥1.5)</span>` : `R:R <b>${rr.toFixed(2)}</b>`;
    $("calcOut").innerHTML = `Risk: <b class="yellow">$${riskUsd.toFixed(2)}</b> • SL cách <b>${slPct.toFixed(2)}%</b> • KL: <b class="green">${qty.toFixed(4)}</b> (~$${posVal.toFixed(2)}) • Ký quỹ ≈ <b>$${marg.toFixed(2)}</b> @${lv}x • ${rrTxt} • Liq long ≈ <b class="red">${fmtP(liqLong)}</b> / short ≈ <b class="red">${fmtP(liqShort)}</b>${warn}<br><span style="color:#9aa4b2">Công thức: Qty = Risk$ / |Entry−SL|, Margin = Qty×Entry / Leverage.</span>`;
  };
  $("autoBtn").onclick = () => {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; $("autoBtn").textContent = "⏱ Auto: OFF"; }
    else { analyze(); autoTimer = setInterval(analyze, 60000); $("autoBtn").textContent = "⏱ Auto: ON"; }
  };
  $("expBtn").onclick = () => {
    try {
      const arr = JSON.parse(localStorage.getItem("ta_log_v1") || "[]");
      if (!arr.length) { alert("Chưa có lịch sử để xuất."); return; }
      const csv = "time,symbol,interval,score,conf,price\n" + arr.map(x => [x.t, x.sym, x.itv, x.score, x.conf, x.px].join(",")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      a.download = "ta_log.csv"; a.click();
    } catch (e) { alert("Lỗi xuất CSV: " + e.message); }
  };
  $("clrBtn").onclick = () => { if (confirm("Xóa nhật ký tín hiệu?")) { localStorage.removeItem("ta_log_v1"); renderLog(); } };
  renderLog();
}

buildPills();
bindUI();
window.addEventListener("load", analyze);
