// ================= CONFIG =================
const CONFIG = {
  SPOT_BASES: [
    "https://data-api.binance.vision",
    "https://api.binance.com",
    "https://api1.binance.com",
    "https://api2.binance.com",
    "https://api3.binance.com"
  ],
  FUT_BASES: [
    "https://fapi.binance.com",
    "https://fapi1.binance.com",
    "https://fapi2.binance.com",
    "https://fapi3.binance.com"
  ],
  STEPS_PER_DAY: { "15m": 96, "1h": 24, "4h": 6, "1d": 1 },
  PERIODS_PER_YEAR: { "15m": 35040, "1h": 8760, "4h": 2190, "1d": 365 },
  // GIỮ LẠI để tương thích nhưng news.js hiện dùng CryptoCompare API trực tiếp
  // (CORS-friendly), không còn fetch RSS qua proxy.
  RSS_SOURCES: [
    { name: "CoinDesk", rss: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
    { name: "CoinTelegraph", rss: "https://cointelegraph.com/rss" },
    { name: "Decrypt", rss: "https://decrypt.co/feed" }
  ],
  PROXIES: [
    "https://api.allorigins.win/raw?url=",
    "https://api.codetabs.com/v1/proxy?quest=",
    "https://api.allorigins.win/get?url="
  ],
  DEFAULT_SYMBOLS: ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"],
  DEFAULT_INTERVALS: [["15m", "15m"], ["1h", "1h"], ["4h", "4h"], ["1d", "1D"]],
  FETCH_TIMEOUT_MS: 8000,
  NEWS_CACHE_TTL_MS: 10 * 60 * 1000,
  MAX_LOG_ENTRIES: 60
};