# Trading Advisory System — Spot & Futures

Dashboard phân tích Spot & Futures **chỉ tư vấn, KHÔNG auto-trade, KHÔNG cần API-key**.
Dữ liệu công khai từ Binance (klines, funding, OI, basis) + Fear & Greed + tin tức crypto.

## Tính năng

- Giá + EMA20/50 + Bollinger, RSI(14) Wilder, MACD(12,26,9), BB width
- Dự báo biến động theo ATR(14) Wilder + HV (SD log-return × √{kỳ/năm})
- Chế độ biến động LOW / NORMAL / HIGH / EXTREME (có ngưỡng rõ ràng)
- Đa khung: bias 1D / 4H / 1H song song
- Futures: Funding, Basis, OI, L/S ratio, OI 12h + Funding 5 kỳ, cảnh báo squeeze
- Bảng điểm minh bạch (mỗi yếu tố + luận + điểm) → LONG/SHORT/SIDEWAY + độ tin cậy
- Tin tức + Fear & Greed chỉ trừ **độ tin cậy**, không đảo tín hiệu kỹ thuật
- Backtest mini trên bộ nến + nhật ký tín hiệu lưu localStorage + xuất CSV
- Máy tính rủi ro futures: qty, ký quỹ, thanh lý, R:R (không đặt lệnh)
- Auto refresh mỗi 60s, giao diện responsive, pills chọn coin/khung

## Chạy local

Không cần build, không cần Node:

```bash
cd trading-advisory-system
python -m http.server 8088
# mở http://localhost:8088/index.html
```

Hoặc mở trực tiếp `index.html` bằng trình duyệt.

## Cấu trúc

```
index.html          # giao diện + CSS
js/config.js        # hằng số: endpoints Binance, khung, cache TTL
js/utils.js         # fetchJSON, tryFetch, cleanKlines, format
js/indicators.js    # sma/ema/rsi/macd/atr/stdev (Wilder chuẩn) + mtfBias
js/market.js        # loadMTF, loadDerivHist, detectSqueeze, backtest, journal
js/news.js          # tin tức (CryptoCompare) + Fear & Greed
js/charts.js        # Chart.js: giá, RSI, MACD, OI
js/app.js           # analyze() + UI wiring
```

## Nguồn dữ liệu

| Dữ liệu | Endpoint |
|---|---|
| Spot klines | `data-api.binance.vision/api/v3/klines` |
| Futures klines | `fapi.binance.com/fapi/v1/klines` |
| OI hiện tại | `fapi.binance.com/fapi/v1/openInterest` |
| OI history | `fapi.binance.com/futures/data/openInterestHist` |
| Funding | `fapi.binance.com/fapi/v1/fundingRate` |
| Fear & Greed | `api.alternative.me/fng/` |
| Tin tức | `min-api.cryptocompare.com/data/v2/news/` |

Có failover qua nhiều endpoint Binance + cache client-side — không có API key, không gửi dữ liệu đi đâu.

## Miễn trừ

Đây **không phải** lời khuyên tài chính. Không kết nối API-key, không đặt lệnh, không auto-trade.
Crypto futures đòn bẩy có rủi ro cháy tài khoản rất cao. Luôn dùng SL, chia vốn, đòn bẩy ≤5x.
Quyết định cuối cùng thuộc về bạn.
