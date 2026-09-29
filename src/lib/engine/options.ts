import type { OptionGreeks, Quote } from "../market/provider";

export interface ParsedInstrument {
  kind: "equity" | "option" | "future";
  underlying: string;
  strike: number | null;
  optionType: "CE" | "PE" | null;
  expiry: string | null;
  isIndex: boolean;
}

const INDEX_SET = ["NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX"];

export const FNO_INDEX = INDEX_SET;

export const LOT_SIZES: Record<string, number> = {
  NIFTY: 75,
  BANKNIFTY: 35,
  FINNIFTY: 65,
  SENSEX: 20,
  RELIANCE: 250,
  TCS: 150,
  HDFCBANK: 550,
  ICICIBANK: 700,
  SBIN: 150,
  INFY: 300,
  LT: 75,
  TATAMOTORS: 140,
  KOTAKBANK: 125,
  BHARTIARTL: 250,
  WIPRO: 500,
  TATASTEEL: 250,
  HCLTECH: 250,
};

export const STRIKE_STEPS: Record<string, number> = {
  NIFTY: 50,
  BANKNIFTY: 100,
  FINNIFTY: 50,
  SENSEX: 100,
  RELIANCE: 20,
  TCS: 50,
  HDFCBANK: 20,
  ICICIBANK: 20,
  SBIN: 10,
  INFY: 50,
  LT: 50,
  TATAMOTORS: 20,
  KOTAKBANK: 10,
  BHARTIARTL: 10,
  WIPRO: 5,
  TATASTEEL: 5,
  HCLTECH: 10,
};

export const FNO_STOCKS = [
  "RELIANCE",
  "TCS",
  "HDFCBANK",
  "ICICIBANK",
  "SBIN",
  "INFY",
  "LT",
  "TATAMOTORS",
  "KOTAKBANK",
  "BHARTIARTL",
  "WIPRO",
  "TATASTEEL",
  "HCLTECH",
];

export function isFnoIndex(symbol: string): boolean {
  return INDEX_SET.includes(symbol.toUpperCase());
}

export function lotSize(symbol: string): number {
  const s = symbol.toUpperCase();
  return LOT_SIZES[s] ?? 100;
}

export function strikeStep(symbol: string): number {
  const s = symbol.toUpperCase();
  return STRIKE_STEPS[s] ?? 20;
}

export function instrumentIv(symbol: string): number {
  return isFnoIndex(symbol) ? 0.13 : 0.3;
}

export function toPreviousFriday(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  while (out.getDay() !== 5) out.setDate(out.getDate() - 1);
  return out;
}

export function nextFridays(symbol: string, count = 3): Date[] {
  const s = symbol.toUpperCase();
  const base = new Date();
  const out: Date[] = [];
  let cursor = new Date(base);
  if (s === "SENSEX") {
    // Monthly expiry: last Friday of each month (approximation).
    while (out.length < count) {
      const last = new Date(cursor.getFullYear(), cursor.getMonth() + 2, 0);
      const expiry = toPreviousFriday(last);
      if (expiry.getTime() >= base.getTime()) out.push(expiry);
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    return out;
  }
  // Weekly expires: nearest 3 Fridays strictly ahead (a few days).
  while (out.length < count) {
    const f = nextFridayStrict(cursor);
    out.push(f);
    cursor = new Date(f.getTime() + 86400000);
  }
  return out;
}

function nextFridayStrict(from: Date): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + 2);
  d.setUTCHours(0, 0, 0, 0);
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export function strikesFor(symbol: string, spot: number): number[] {
  const step = strikeStep(symbol);
  const isIdx = isFnoIndex(symbol);
  const k = Math.round(spot / step);
  const width = isIdx ? 18 : 9;
  const out: number[] = [];
  for (let i = -width; i <= width; i++) {
    const strike = (k + i) * step;
    if (!out.includes(strike) && strike > 0) out.push(strike);
  }
  return out;
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x));
  return sign * y;
}

export function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

export function bsmPrice(dir: "call" | "put", S: number, K: number, T: number, v: number, r = 0.07): number {
  if (T <= 0) {
    const intrinsic = dir === "call" ? S - K : K - S;
    return Math.max(0, intrinsic);
  }
  const d1 = (Math.log(S / K) + (r + (v * v) / 2) * T) / (v * Math.sqrt(T));
  const d2 = d1 - v * Math.sqrt(T);
  if (dir === "call") return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
  return K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
}

export function greeks(opts: {
  dir: "call" | "put";
  S: number;
  K: number;
  T: number;
  v: number;
}): OptionGreeks {
  const { dir, S, K, T, v } = opts;
  const eps = 0.0001;
  const def = (S: number): number => bsmPrice(dir, S, K, T, v);
  const delta = (def(S * (1 + eps)) - def(S * (1 - eps))) / (2 * S * eps);
  const gamma =
    (def(S * (1 + eps)) - 2 * def(S) + def(S * (1 - eps))) / Math.pow(S * eps, 2);
  const dT = 1 / 365;
  const theta = -(def(Math.max(T - dT, 0.0001)) - def(T)) / dT;
  const dv = 0.001;
  const vega = (bsmPrice(dir, S, K, T, v + dv) - bsmPrice(dir, S, K, T, v - dv)) / (2 * dv);
  return { iv: v, delta, gamma, theta, vega };
}

const MONTHS_MAP: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

export function normalizeSymbol(symbol: string): string {
  const s = symbol.toUpperCase().trim();
  if (s.includes("|")) return s;
  
  // Try to parse NIFTY23850PE04SEP2026 format
  // Pattern: (NIFTY|BANKNIFTY|FINNIFTY|SENSEX...)(STRIKE)(CE|PE)(DD)(MMM)(YYYY)
  const regex = /^([A-Z]+)(\d+)(CE|PE)(\d{2})([A-Z]{3})(\d{4})$/;
  const match = s.match(regex);
  if (match) {
    const [, und, strike, type, dd, mmm, yyyy] = match;
    const mm = MONTHS_MAP[mmm];
    if (mm) {
      return `${und}|${strike}|${type}|${yyyy}-${mm}-${dd}`;
    }
  }
  
  // Try to parse NIFTYFUT04SEP2026 format
  const futRegex = /^([A-Z]+)FUT(\d{2})([A-Z]{3})(\d{4})$/;
  const futMatch = s.match(futRegex);
  if (futMatch) {
    const [, und, dd, mmm, yyyy] = futMatch;
    const mm = MONTHS_MAP[mmm];
    if (mm) {
      return `${und}|FUT|${yyyy}-${mm}-${dd}`;
    }
  }
  
  return s;
}

export function parseInstrument(rawSymbol: string): ParsedInstrument {
  const symbol = normalizeSymbol(rawSymbol);
  const parts = symbol.split("|");
  const underlying = parts[0].toUpperCase();
  if (parts.length >= 3 && parts[1] === "FUT") {
    return {
      kind: "future",
      underlying,
      strike: null,
      optionType: null,
      expiry: parts[2],
      isIndex: isFnoIndex(underlying),
    };
  }
  if (parts.length >= 4) {
    return {
      kind: "option",
      underlying,
      strike: Number(parts[1]),
      optionType: parts[2] as "CE" | "PE",
      expiry: parts[3],
      isIndex: isFnoIndex(underlying),
    };
  }
  return { kind: "equity", underlying, strike: null, optionType: null, expiry: null, isIndex: isFnoIndex(underlying) };
}

export function displayName(symbol: string): string {
  const p = parseInstrument(symbol);
  if (p.kind === "equity") return p.underlying;
  const exp = p.expiry ? new Date(`${p.expiry}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "";
  if (p.kind === "future") return `${p.underlying} ${exp} FUT`;
  return `${p.underlying} ${exp} ${p.strike} ${p.optionType}`;
}

export function underlyingSpotSymbol(symbol: string): string {
  return parseInstrument(symbol).underlying;
}

const TV_INDEX: Record<string, string> = {
  NIFTY: "NSE:NIFTY",
  BANKNIFTY: "NSE:BANKNIFTY",
  FINNIFTY: "NSE:FINNIFTY",
  SENSEX: "BSE:SENSEX",
};

export function tradingViewSymbol(symbol: string): string {
  const p = parseInstrument(symbol);
  const tv = TV_INDEX[p.underlying];
  if (tv) return tv;
  const bare = p.underlying.replace(/\.(NS|BO)$/i, "");
  return `NSE:${bare}`;
}

export function syntheticQuote(symbol: string, spot: number, prevClose: number): Quote {
  const p = parseInstrument(symbol);
  const now = Date.now();
  const t = p.expiry ? Math.max((new Date(`${p.expiry}T03:30:00Z`).getTime() - now) / (365 * 86400000), 0.001) : 1;
  const v = instrumentIv(p.underlying);
  let ltp: number;
  if (p.kind === "future") {
    const carry = spot * 0.0015 * Math.min(t * 252, 1);
    ltp = spot + carry;
  } else if (p.optionType) {
    ltp = bsmPrice(p.optionType === "CE" ? "call" : "put", spot, p.strike!, t, v);
  } else {
    ltp = spot;
  }
  return {
    symbol,
    ltp,
    prev_close: prevClose || ltp,
    open: null,
    high: null,
    low: null,
    bid: ltp * 0.998,
    ask: ltp * 1.002,
    volume: 0,
    change: ltp - (prevClose || ltp),
    change_percent: prevClose ? ((ltp - prevClose) / prevClose) * 100 : 0,
    source: "sim",
    delayed: false,
    timestamp: now,
  };
}