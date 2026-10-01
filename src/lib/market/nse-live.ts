import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StrikeRow } from "./provider";

export interface NseQuote {
  ltp: number;
  bid: number | null;
  ask: number | null;
  iv: number;
  oi: number;
  change_oi: number;
  volume: number;
  has: boolean;
}

export interface NseLeg {
  ce: NseQuote | null;
  pe: NseQuote | null;
}

const DATA_DIR = process.env.OPPAC_DATA_DIR ?? join(process.cwd(), "data");
const OUT = join(DATA_DIR, "nse-chain.json");
const FRESH_MS = 15000;
// A snapshot is "available" (used for night planning against the last real
// closing values) for up to this long after it was written, even if the
// scraper is no longer polling. Only when no snapshot exists at all do we
// fall back to synthetic values.
const AVAILABLE_MS = 24 * 60 * 60 * 1000;

// In-memory snapshot of the shared file, cached briefly to avoid repeated reads.
let mem: { data: Record<string, any>; at: number } | null = null;

function readSnapshot(): Record<string, any> {
  if (mem && Date.now() - mem.at < 3000) return mem.data;
  try {
    const data = JSON.parse(readFileSync(OUT, "utf8"));
    mem = { data, at: Date.now() };
    return data;
  } catch {
    return {};
  }
}

export function isNseFresh(symbol: string): boolean {
  const snap = readSnapshot()[symbol.toUpperCase()];
  if (!snap) return false;
  return Date.now() - snap.updatedAt < FRESH_MS;
}

// True when we have a snapshot written within AVAILABLE_MS (e.g. from today's
// close). This lets the app show real NSE values for night planning even when
// the 5s live loop is off.
export function isNseAvailable(symbol: string): boolean {
  const snap = readSnapshot()[symbol.toUpperCase()];
  if (!snap) return false;
  return Date.now() - snap.updatedAt < AVAILABLE_MS;
}

// Age (ms) of the latest snapshot, or null if none exists.
export function nseUpdatedAt(symbol: string): number | null {
  const snap = readSnapshot()[symbol.toUpperCase()];
  return snap?.updatedAt ?? null;
}

export function nearestIsoExpiry(symbol: string, isoDate: string): string {
  const snap = readSnapshot()[symbol.toUpperCase()];
  if (!snap || !snap.isoExpiries?.length) return isoDate;
  if (snap.isoExpiries.includes(isoDate)) return isoDate;

  const targetTs = new Date(`${isoDate}T00:00:00Z`).getTime();
  if (Number.isNaN(targetTs)) return snap.isoExpiries[0];

  let nearest = snap.isoExpiries[0];
  let minDiff = Infinity;
  for (const e of snap.isoExpiries) {
    const ts = new Date(`${e}T00:00:00Z`).getTime();
    const diff = Math.abs(ts - targetTs);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = e;
    }
  }
  return nearest;
}

export function getNseLeg(
  symbol: string,
  strike: number,
  optionType: "CE" | "PE",
  isoDate: string,
): NseQuote | null {
  const snap = readSnapshot()[symbol.toUpperCase()];
  if (!snap || !isNseAvailable(symbol)) return null;
  const iso = nearestIsoExpiry(symbol, isoDate);
  const leg = snap.rowsByIso?.[iso]?.[strike];
  if (!leg) return null;
  const q = optionType === "CE" ? leg.ce : leg.pe;
  return q?.has ? q : null;
}

export function getNseExpiries(symbol: string): string[] {
  return readSnapshot()[symbol.toUpperCase()]?.isoExpiries ?? [];
}

export function getNseChainRows(
  symbol: string,
  isoDate: string,
): { spot: number; rows: StrikeRow[]; isoExpiry: string; updatedAt: number } | null {
  const snap = readSnapshot()[symbol.toUpperCase()];
  if (!snap || !isNseAvailable(symbol)) return null;
  const iso = isoDate && snap.isoExpiries.includes(isoDate) ? isoDate : nearestIsoExpiry(symbol, isoDate);
  const strikeMap = snap.rowsByIso?.[iso];
  if (!strikeMap) return null;

  const rows: StrikeRow[] = Object.entries<{ ce: NseQuote | null; pe: NseQuote | null }>(strikeMap).map(
    ([k, leg]) => {
      const strike = Number(k);
      return {
        strike,
        ce: {
          ltp: leg.ce?.has ? leg.ce.ltp : 0,
          oi: leg.ce?.has ? leg.ce.oi : 0,
          change_oi: leg.ce?.has ? leg.ce.change_oi : 0,
          volume: leg.ce?.has ? leg.ce.volume : 0,
        },
        pe: {
          ltp: leg.pe?.has ? leg.pe.ltp : 0,
          oi: leg.pe?.has ? leg.pe.oi : 0,
          change_oi: leg.pe?.has ? leg.pe.change_oi : 0,
          volume: leg.pe?.has ? leg.pe.volume : 0,
        },
      };
    },
  );
  rows.sort((a, b) => b.strike - a.strike);

  return { spot: snap.spot, rows, isoExpiry: iso, updatedAt: snap.updatedAt };
}
