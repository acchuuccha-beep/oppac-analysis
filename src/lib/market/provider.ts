export interface Candle {
  symbol: string;
  interval: string;
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  assetClass: string;
}

export interface StrikeRow {
  strike: number;
  ce: { ltp: number; oi: number; change_oi: number; volume: number };
  pe: { ltp: number; oi: number; change_oi: number; volume: number };
}

export interface OptionChain {
  underlying: string;
  spot: number;
  expiry: string;
  expiries: string[];
  step: number;
  synthetic: boolean;
  source: string;
  rows: StrikeRow[];
  live?: boolean;
  updatedAt?: number | null;
  delayed?: boolean;
}

export interface OptionGreeks {
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

export interface MarketProvider {
  id: string;
  name: string;
  realtime: boolean;
  configured(): boolean;
  quote(symbol: string): Promise<Quote>;
  candles(symbol: string, interval: string, from: Date, to: Date): Promise<Candle[]>;
  search(query: string): Promise<SearchResult[]>;
  optionChain?(underlying: string, expiry: string | null): Promise<OptionChain>;
}

export interface Quote {
  symbol: string;
  ltp: number;
  prev_close: number;
  open: number | null;
  high: number | null;
  low: number | null;
  bid: number | null;
  ask: number | null;
  volume: number | null;
  change: number;
  change_percent: number;
  source: string;
  delayed: boolean;
  timestamp: number;
}

export const TF_TO_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "1d": 86_400_000,
};

export function normalizeToPaisaEntities(symbol: string) {
  return symbol.trim().toUpperCase();
}

export function isIndex(symbol: string): boolean {
  const s = symbol.toUpperCase();
  return ["NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX", "INDIAVIX", "MIDCPNIFTY", "NIFTYIT"].includes(s);
}