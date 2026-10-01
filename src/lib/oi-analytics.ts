export interface AnalyticsLeg {
  // ltp is included so rows remain directly assignable to the existing
  // SpotMatchRow shape, letting the analytics panel reuse computeSpotMatch
  // without duplicating or altering that logic.
  ltp: number;
  oi: number;
  change_oi: number;
  volume: number;
}

export interface AnalyticsRow {
  strike: number;
  ce: AnalyticsLeg;
  pe: AnalyticsLeg;
}

export type Metric = "oi" | "volume";
export type Side = "ce" | "pe";

export interface RankedStrike {
  strike: number;
  value: number;
}

export interface AtmSummary {
  strike: number;
  ceOi: number;
  peOi: number;
  ceVolume: number;
  peVolume: number;
  ceChangeOi: number;
  peChangeOi: number;
}

// Same rounding as the option chain table so the two views agree exactly.
export function atmOf(spot: number, step: number): number | null {
  if (!(spot > 0) || !(step > 0)) return null;
  return Math.round(spot / step) * step;
}

// Rows arrive sorted descending by strike. Window is ATM ± radius steps,
// clamped to whatever the chain actually covers.
export function strikeWindow(rows: AnalyticsRow[], atm: number, radius: number): AnalyticsRow[] {
  if (rows.length === 0 || !Number.isFinite(atm)) return [];
  const ordered = rows.slice().sort((a, b) => a.strike - b.strike);
  let lo = 0;
  while (lo < ordered.length && ordered[lo].strike < atm) lo++;
  const start = Math.max(0, lo - 1 - radius);
  const end = Math.min(ordered.length - 1, lo - 1 + radius);
  return ordered.slice(start, end + 1);
}

export function legValue(row: AnalyticsRow, side: Side, metric: Metric): number {
  const v = side === "ce" ? row.ce[metric] : row.pe[metric];
  return Number.isFinite(v) ? v : 0;
}

export function pcr(rows: AnalyticsRow[]): number | null {
  let ce = 0;
  let pe = 0;
  for (const r of rows) {
    ce += legValue(r, "ce", "oi");
    pe += legValue(r, "pe", "oi");
  }
  if (ce <= 0) return null;
  return Math.round((pe / ce) * 100) / 100;
}

// Classic max pain: the strike whose expiry settlement leaves option writers
// the smallest net intrinsic payout. Uses OI as the open position size.
export function maxPain(rows: AnalyticsRow[]): number | null {
  if (rows.length === 0) return null;
  const strikes = rows.map((r) => r.strike).sort((a, b) => a - b);
  let best: number | null = null;
  let bestCost = Infinity;
  for (const settle of strikes) {
    let cost = 0;
    for (const r of rows) {
      if (legValue(r, "ce", "oi") > 0 && r.strike < settle) cost += legValue(r, "ce", "oi") * (settle - r.strike);
      if (legValue(r, "pe", "oi") > 0 && r.strike > settle) cost += legValue(r, "pe", "oi") * (r.strike - settle);
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = settle;
    }
  }
  return best;
}

export function topN(rows: AnalyticsRow[], side: Side, metric: Metric, n = 3): RankedStrike[] {
  return rows
    .map((r) => ({ strike: r.strike, value: legValue(r, side, metric) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

// The band holding the most OI on one side, measured as the share of that
// side's total OI sitting within `radius` steps of ATM.
export interface ConcentrationZone {
  side: Side;
  lo: number;
  hi: number;
  total: number;
  sharePct: number;
}

export function concentrationZone(rows: AnalyticsRow[], atm: number, side: Side, radius = 5, metric: Metric = "oi"): ConcentrationZone | null {
  if (rows.length === 0 || !Number.isFinite(atm)) return null;
  const step = rows.length > 1 ? Math.abs(rows[1].strike - rows[0].strike) : 50;
  const lo = atm - radius * step;
  const hi = atm + radius * step;
  let inside = 0;
  let total = 0;
  for (const r of rows) {
    const v = legValue(r, side, metric);
    total += v;
    if (v > 0 && r.strike >= lo && r.strike <= hi) inside += v;
  }
  if (total <= 0) return null;
  return {
    side,
    lo,
    hi,
    total,
    sharePct: Math.round((inside / total) * 1000) / 10,
  };
}

export function atmSummary(rows: AnalyticsRow[], atm: number): AtmSummary | null {
  const row = rows.find((r) => r.strike === atm);
  if (!row) return null;
  return {
    strike: row.strike,
    ceOi: legValue(row, "ce", "oi"),
    peOi: legValue(row, "pe", "oi"),
    ceVolume: legValue(row, "ce", "volume"),
    peVolume: legValue(row, "pe", "volume"),
    ceChangeOi: Number.isFinite(row.ce.change_oi) ? row.ce.change_oi : 0,
    peChangeOi: Number.isFinite(row.pe.change_oi) ? row.pe.change_oi : 0,
  };
}

// Aggregated change in OI across the visible window, for the header strip.
export function changeOiTotals(rows: AnalyticsRow[]): { ce: number; pe: number } {
  let ce = 0;
  let pe = 0;
  for (const r of rows) {
    ce += Number.isFinite(r.ce.change_oi) ? r.ce.change_oi : 0;
    pe += Number.isFinite(r.pe.change_oi) ? r.pe.change_oi : 0;
  }
  return { ce, pe };
}

export function maxOf(rows: AnalyticsRow[], side: Side, metric: Metric): number {
  let m = 0;
  for (const r of rows) {
    const v = legValue(r, side, metric);
    if (v > m) m = v;
  }
  return m;
}