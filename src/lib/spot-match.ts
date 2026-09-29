export interface BestMatch {
  strike: number;
  ltp: number;
  calc: number;
  diff: number;
}

export interface SpotMatchRow {
  strike: number;
  ce: { ltp: number };
  pe: { ltp: number };
}

export interface SpotMatch {
  ce: BestMatch | null;
  pe: BestMatch | null;
}

export interface MatchAdvantage {
  side: "CE" | "PE" | "tied";
  pts: number;
}

export function computeSpotMatch(spot: number, rows: SpotMatchRow[]): SpotMatch {
  let ce: BestMatch | null = null;
  let pe: BestMatch | null = null;
  for (const r of rows) {
    const ceCalc = r.strike + r.ce.ltp;
    const peCalc = r.strike - r.pe.ltp;
    const cd = Math.abs(ceCalc - spot);
    const pd = Math.abs(peCalc - spot);
    if (!ce || cd < ce.diff) ce = { strike: r.strike, diff: cd, ltp: r.ce.ltp, calc: ceCalc };
    if (!pe || pd < pe.diff) pe = { strike: r.strike, diff: pd, ltp: r.pe.ltp, calc: peCalc };
  }
  return { ce, pe };
}

export function advantageOf(ce: BestMatch | null, pe: BestMatch | null): MatchAdvantage | null {
  if (!ce || !pe) return null;
  const pts = ce.diff - pe.diff;
  if (Math.abs(pts) <= 0.005) return { side: "tied", pts: 0 };
  return { side: pts < 0 ? "CE" : "PE", pts: Math.abs(pts) };
}

export function advantageLabel(adv: MatchAdvantage | null): string {
  if (!adv) return "";
  if (adv.side === "tied") return "Balanced (tied)";
  return `${adv.side} → ${adv.pts.toFixed(2)} pts closer`;
}