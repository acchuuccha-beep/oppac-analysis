import YahooFinance from "yahoo-finance2";
import { isIndex } from "./provider";
import type { Quote } from "./provider";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

const INDEX_MAP: Record<string, string> = {
  NIFTY: "^NSEI",
  BANKNIFTY: "^NSEBANK",
  FINNIFTY: "^CNXFIN",
  SENSEX: "^BSESN",
  MIDCPNIFTY: "^NSEMDCP50",
  NIFTYIT: "^CNXIT",
  INDIAVIX: "^INDIAVIX",
};

const memCache = new Map<string, { quote: Quote; at: number }>();
const TTL = 3000;

function num(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (isFinite(n)) return n;
  }
  return null;
}

function toYahooSymbol(symbol: string): string {
  const s = symbol.toUpperCase();
  if (INDEX_MAP[s]) return INDEX_MAP[s];
  if (isIndex(s)) return `^${s}`;
  return `${s}.NS`;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("provider timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function staleQuote(key: string): Quote {
  return {
    symbol: key,
    ltp: 0,
    prev_close: 0,
    open: null,
    high: null,
    low: null,
    bid: null,
    ask: null,
    volume: null,
    change: 0,
    change_percent: 0,
    source: "stale",
    delayed: true,
    timestamp: Date.now(),
  };
}

export async function getQuote(symbol: string): Promise<Quote> {
  const key = symbol.toUpperCase();
  const hit = memCache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.quote;

  let quote: Quote;
  try {
    const res = (await withTimeout(yahooFinance.quote(toYahooSymbol(key)), 6000)) as any;
    const ltp = num(res?.regularMarketPrice);
    if (ltp === null || ltp <= 0) throw new Error(`no valid quote for ${key}`);
    const prev = num(res.regularMarketPreviousClose ?? res.chartPreviousClose) ?? 0;
    const change = ltp - prev;
    quote = {
      symbol: key,
      ltp,
      prev_close: prev,
      open: num(res.regularMarketOpen),
      high: num(res.regularMarketDayHigh),
      low: num(res.regularMarketDayLow),
      bid: num(res.bid),
      ask: num(res.ask),
      volume: num(res.regularMarketVolume),
      change,
      change_percent: prev ? (change / prev) * 100 : 0,
      source: "basic",
      delayed: true,
      timestamp: Date.now(),
    };
  } catch {
    quote = staleQuote(key);
  }
  memCache.set(key, { quote, at: Date.now() });
  return quote;
}
