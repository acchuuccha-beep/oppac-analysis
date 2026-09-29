import type { OptionChain } from "./market/provider";
import { bsmPrice, instrumentIv, normCdf, strikeStep } from "./engine/options";
import { advantageOf, computeSpotMatch, type BestMatch, type MatchAdvantage } from "./spot-match";

const MAX_SAMPLES = 90;
const MIN_SAMPLES = 12;
const MIN_MOVES = 4;
const MOVE_THRESHOLD = 0.0003;
const BLED_THRESHOLD = -0.003;

interface MomentSample {
  t: number;
  spot: number;
  ce: Map<number, number>;
  pe: Map<number, number>;
  ceOi: Map<number, number>;
  peOi: Map<number, number>;
}

export interface ForwardWindow {
  label: string;
  mins: number;
  n: number;
  avgMovePts: number | null;
  dirAccPct: number | null;
}

export interface ForwardSummary {
  detections: number;
  collected: boolean;
  windows: ForwardWindow[];
}

interface SpotPoint {
  t: number;
  spot: number;
}

interface Detection {
  t: number;
  spot: number;
  ce: BestMatch | null;
  pe: BestMatch | null;
}

const buffers = new Map<string, MomentSample[]>();
const spotHistories = new Map<string, SpotPoint[]>();
const detectionLogs = new Map<string, Detection[]>();
const SPOT_HISTORY_CAP = 2880;
const DETECTION_CAP = 2000;

export function recordChainSample(chain: OptionChain): void {
  if (!chain || !Number.isFinite(chain.spot) || chain.spot <= 0 || chain.spot <= chain.step || !chain.rows || chain.rows.length === 0) return;
  const key = `${chain.underlying}|${chain.expiry}`;
  const sample: MomentSample = {
    t: Date.now(),
    spot: chain.spot,
    ce: new Map(),
    pe: new Map(),
    ceOi: new Map(),
    peOi: new Map(),
  };
  for (const r of chain.rows) {
    sample.ce.set(r.strike, r.ce.ltp);
    sample.pe.set(r.strike, r.pe.ltp);
    sample.ceOi.set(r.strike, r.ce.oi);
    sample.peOi.set(r.strike, r.pe.oi);
  }
  const arr = buffers.get(key) ?? [];
  arr.push(sample);
  if (arr.length > MAX_SAMPLES) arr.shift();
  buffers.set(key, arr);

  const now = Date.now();
  const match = computeSpotMatch(chain.spot, chain.rows);
  const dh = detectionLogs.get(key) ?? [];
  dh.push({ t: now, spot: chain.spot, ce: match.ce, pe: match.pe });
  if (dh.length > DETECTION_CAP) dh.splice(0, dh.length - DETECTION_CAP);
  detectionLogs.set(key, dh);

  const sph = spotHistories.get(key) ?? [];
  sph.push({ t: now, spot: chain.spot });
  if (sph.length > SPOT_HISTORY_CAP) sph.splice(0, sph.length - SPOT_HISTORY_CAP);
  spotHistories.set(key, sph);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function trimmedMean(arr: number[]): number {
  if (arr.length === 0) return 0;
  if (arr.length === 1) return arr[0];
  if (arr.length < 6) return arr.reduce((a, b) => a + b, 0) / arr.length;
  const sorted = arr.slice().sort((a, b) => a - b);
  const drop = Math.floor(sorted.length * 0.1);
  const keep = sorted.slice(drop, sorted.length - drop);
  return keep.reduce((a, b) => a + b, 0) / keep.length;
}

function spotAtOrAfter(hist: SpotPoint[], target: number): number | null {
  let lo = 0;
  let hi = hist.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (hist[mid].t >= target) {
      ans = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return ans === -1 ? null : hist[ans].spot;
}

function computeForwardSummary(key: string): ForwardSummary {
  const now = Date.now();
  const detections = detectionLogs.get(key) ?? [];
  const spotHist = spotHistories.get(key) ?? [];
  const windows: ForwardWindow[] = [5, 15, 30, 60].map((mins) => {
    const ms = mins * 60_000;
    const moves: number[] = [];
    let correct = 0;
    for (const d of detections) {
      const age = now - d.t;
      if (age < ms) continue;
      const later = spotAtOrAfter(spotHist, d.t + ms);
      if (later === null) continue;
      const adv = advantageOf(d.ce, d.pe);
      if (!adv || adv.side === "tied") continue;
      const move = later - d.spot;
      if (move === 0) continue;
      const expected = adv.side === "CE" ? 1 : -1;
      moves.push(move);
      if (Math.sign(move) === expected) correct += 1;
    }
    return {
      label: `${mins}m`,
      mins,
      n: moves.length,
      avgMovePts: moves.length === 0 ? null : Math.round((moves.reduce((a, b) => a + b, 0) / moves.length) * 100) / 100,
      dirAccPct: moves.length === 0 ? null : Math.round((100 * correct) / moves.length),
    };
  });
  return { detections: detections.length, collected: windows.some((w) => w.n > 0), windows };
}

function pearson(x: number[], y: number[]): number {
  if (x.length < 2) return 0;
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  if (dx <= 0 || dy <= 0) return 0;
  return num / Math.sqrt(dx * dy);
}

function rel(a: number, b: number): number {
  if (!isFinite(a) || !isFinite(b) || b === 0) return 0;
  return (a - b) / b;
}

export interface MomentumRow {
  strike: number;
  ltp: number;
  delta: number;
  moneyness: "deep_ITM" | "ITM" | "ATM" | "OTM" | "deep_OTM";
  distPts: number;
  matchPct: number | null;
  corrPct: number | null;
  respPct: number | null;
  deltaEffPct: number | null;
  effPct: number | null;
  distPct: number | null;
  decayPct: number;
  partPct: number;
  realMovePct: number;
  score: number | null;
  rank: number | null;
  flags: ("best" | "low_prob" | "decay_trap" | "distorted")[];
}

export interface MomentumReport {
  status: "warming-up" | "low-signal" | "live";
  samples: number;
  moves: number;
  windowSec: number;
  spot: number | null;
  step: number;
  expiry: string;
  ce: MomentumRow[];
  pe: MomentumRow[];
  dashboard: {
    bestCE: { strike: number; scorePct: number; partPct: number } | null;
    bestPE: { strike: number; scorePct: number; partPct: number } | null;
    reactiveATM: { strike: number; respPct: number } | null;
    highProb: { strike: number; side: "CE" | "PE"; partPct: number; scorePct: number | null }[];
    decayTraps: { strike: number; side: "CE" | "PE"; decayPct: number; partPct: number }[];
    overpricedSlow: { strike: number; side: "CE" | "PE"; distPct: number; ltp: number }[];
    supplyZone: { strike: number; distPct: number } | null;
  };
  spotMatch: {
    ce: BestMatch | null;
    pe: BestMatch | null;
    advantage: MatchAdvantage | null;
  } | null;
  forward: ForwardSummary;
}

function deltaOf(dir: "call" | "put", S: number, K: number, T: number, v: number): number {
  if (S <= 0) return 0;
  const eps = 0.0001;
  const f = (s: number) => bsmPrice(dir, s, K, T, v);
  return (f(S * (1 + eps)) - f(S * (1 - eps))) / (2 * S * eps);
}

function thetaOf(dir: "call" | "put", S: number, K: number, T: number, v: number): number {
  if (T <= 0.0001) return 0;
  const dT = 1 / 365;
  const f = (t: number) => bsmPrice(dir, S, K, t, v);
  return Math.max(0, (f(T) - f(Math.max(T - dT, 0.0001))) / dT);
}

function timeToExpiryDays(expiry: string | null): number {
  if (!expiry) return 1;
  const t = (new Date(`${expiry}T03:30:00Z`).getTime() - Date.now()) / 86_400_000;
  return Math.max(t, 0.001);
}

export function analyzeMomentum(underlying: string, expiry: string | null): MomentumReport {
  const key = `${underlying.toUpperCase()}|${expiry ?? ""}`;
  const samples = buffers.get(key) ?? [];
  const detections = detectionLogs.get(key) ?? [];
  const step = strikeStep(underlying.toUpperCase());
  const iv = instrumentIv(underlying.toUpperCase());
  const spot = samples.length > 0 ? samples[samples.length - 1].spot : null;
  if (spot === null || !Number.isFinite(spot) || spot <= 0 || spot <= step) {
    return {
      status: "warming-up",
      samples: samples.length,
      moves: 0,
      windowSec: 0,
      spot: null,
      step,
      expiry: expiry ?? "",
      ce: [],
      pe: [],
      dashboard: {
        bestCE: null,
        bestPE: null,
        reactiveATM: null,
        highProb: [],
        decayTraps: [],
        overpricedSlow: [],
        supplyZone: null,
      },
      spotMatch: null,
      forward: computeForwardSummary(key),
    };
  }
  const days = timeToExpiryDays(expiry);
  const T = Math.max(days / 365, 0.001);
  const atm = spot ? Math.round(spot / step) * step : 0;

  const spotSeries = samples.map((s) => s.spot);
  let moves = 0;
  for (let i = 1; i < spotSeries.length; i++) {
    const pv = spotSeries[i - 1];
    if (pv > 0 && Math.abs(spotSeries[i] - pv) / pv >= MOVE_THRESHOLD) moves++;
  }
  const status: MomentumReport["status"] =
    samples.length < MIN_SAMPLES ? "warming-up" : moves < MIN_MOVES ? "low-signal" : "live";

  const build = (side: "ce" | "pe"): MomentumRow[] => {
    if (samples.length === 0) return [];
    const pxs = samples[samples.length - 1][side];

    const strikes = Array.from(pxs.keys()).sort((a, b) => b - a);
    const rows: MomentumRow[] = [];

    for (const strike of strikes) {
      const ltp = pxs.get(strike) ?? 0;
      const delta = deltaOf(side === "ce" ? "call" : "put", spot ?? 0, strike, T, iv);
      const distPts = spot ? Math.abs(strike - spot) : 0;

      const matches: number[] = [];
      const premPct: number[] = [];
      const refPct: number[] = [];
      const dEff: number[] = [];
      const dHits: number[] = [];
      const sizes: number[] = [];
      let bleedSum = 0;
      let bleedN = 0;

      for (let i = 1; i < samples.length; i++) {
        const pPrev = samples[i - 1][side].get(strike);
        const pNow = samples[i][side].get(strike);
        if (!pPrev || !pNow || pPrev <= 0) continue;
        const sPrev = spotSeries[i - 1];
        const sNow = spotSeries[i];
        const dS = sNow - sPrev;
        const dpPts = pNow - pPrev;
        const prem = rel(pNow, pPrev);
        const spotRef = side === "ce" ? rel(sNow, sPrev) : -rel(sNow, sPrev);
        const big = Math.abs(dS) / sPrev >= MOVE_THRESHOLD;

        if (big) {
          const pred = delta * dS;
          const denom = Math.abs(pred) + 0.05;
          matches.push(1 - Math.min(1, Math.abs(dpPts - pred) / denom));
          dEff.push(1 - Math.min(1, Math.abs(dpPts - pred) / denom));
          premPct.push(prem);
          refPct.push(spotRef);
          dHits.push((dpPts >= 0) === (spotRef >= 0) ? 1 : 0);
          sizes.push(Math.min(1, Math.abs(dpPts) / denom));
        } else {
          const favorable = side === "ce" ? dS >= 0 : dS <= 0;
          if ((favorable || Math.abs(dS) / sPrev < 1e-6) && prem < BLED_THRESHOLD) bleedSum += 1;
          if (favorable || Math.abs(dS) / sPrev < 1e-6) bleedN += 1;
        }
      }

      const empiricalBleed = bleedN > 0 ? bleedSum / bleedN : 0;
      const thetaPerDay = thetaOf(side === "ce" ? "call" : "put", spot ?? 0, strike, T, iv);
      const decayModel = ltp > 0 ? clamp((thetaPerDay / ltp) * days * 100, 0, 98) : 0;
      const decayPct = Math.round(clamp(0.55 * empiricalBleed * 100 + 0.45 * decayModel, 0, 99));

      const hasMoves = matches.length > 0;
      const matchPct = hasMoves ? Math.round(100 * trimmedMean(matches)) : null;
      const deltaEffPct = hasMoves ? Math.round(100 * trimmedMean(dEff)) : null;
      const corrRaw = hasMoves ? pearson(premPct, refPct) : 0;
      const corrPct = hasMoves ? Math.round(Math.abs(corrRaw) * 100) : null;
      const effPct = hasMoves ? Math.round(corrRaw * corrRaw * 100) : null;
      const distPct = hasMoves ? Math.max(0, 100 - effPct!) : null;
      const hitRate = dHits.length ? dHits.reduce((a, b) => a + b, 0) / dHits.length : 0;
      const respPct = hasMoves ? Math.round(100 * hitRate * clamp(trimmedMean(sizes), 0, 1)) : null;

      const sig = iv * Math.sqrt(Math.max(T, 0.0001));
      const d2 = spot ? (Math.log(spot / strike) + (0.07 - (iv * iv) / 2) * T) / Math.max(sig, 1e-6) : 0;
      const partPct = spot ? clamp((side === "ce" ? normCdf(d2) : normCdf(-d2)) * 100, 0, 99) : 50;
      const touchZ = spot && sig > 0 ? distPts / (iv * spot * Math.sqrt(Math.max(T, 0.0001))) : 999;
      const realMovePct = spot ? clamp(200 * (1 - normCdf(touchZ)), 0, 99) : 0;

      const flags: MomentumRow["flags"] = [];
      if (distPts > 6 * step && partPct < 15) flags.push("low_prob");
      if (decayPct >= 55 && partPct < 15) flags.push("decay_trap");
      if (distPct !== null && distPct >= 40) flags.push("distorted");

      let score: number | null = null;
      if (hasMoves && matchPct !== null && respPct !== null && corrPct !== null && deltaEffPct !== null && distPct !== null) {
        let s =
          0.3 * matchPct +
          0.2 * respPct +
          0.15 * corrPct +
          0.15 * deltaEffPct +
          0.1 * (100 - distPct) +
          0.1 * Math.min(100, partPct * 2);
        if (distPts > 4 * step) s *= 0.6;
        else if (distPts > 2 * step) s *= 0.8;
        score = Math.round(s);
      }

      rows.push({
        strike,
        ltp,
        delta,
        moneyness: label(distPts, step, strike, spot, side),
        distPts,
        matchPct,
        corrPct,
        respPct,
        deltaEffPct,
        effPct,
        distPct,
        decayPct,
        partPct: Math.round(partPct),
        realMovePct: Math.round(realMovePct),
        score,
        rank: null,
        flags,
      });
    }

    if (status === "live") {
      rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
      rows.forEach((r, i) => {
        r.rank = i + 1;
        if (r.score === rows[0]?.score) r.flags.push("best");
      });
    }
    return rows;
  };

  const ce = build("ce");
  const pe = build("pe");

  const bestCE = pickBest(ce);
  const bestPE = pickBest(pe);

  const reactiveATM =
    pickReactive(atm, step, ce) ?? pickReactive(atm, step, pe);

  const highProb: MomentumReport["dashboard"]["highProb"] = [...ce, ...pe]
    .filter((r) => r.partPct >= 25)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 3)
    .map((r) => ({ strike: r.strike, side: ce.includes(r) ? ("CE" as const) : ("PE" as const), partPct: r.partPct, scorePct: r.score }));

  const decayTraps: MomentumReport["dashboard"]["decayTraps"] = [...ce, ...pe]
    .filter((r) => r.flags.includes("decay_trap"))
    .map((r) => ({ strike: r.strike, side: ce.includes(r) ? ("CE" as const) : ("PE" as const), decayPct: r.decayPct, partPct: r.partPct }));

  const overpricedSlow: MomentumReport["dashboard"]["overpricedSlow"] = [...ce, ...pe]
    .filter((r) => r.flags.includes("distorted") && r.ltp >= medianLtp([...ce, ...pe]))
    .map((r) => ({ strike: r.strike, side: ce.includes(r) ? ("CE" as const) : ("PE" as const), distPct: r.distPct ?? 0, ltp: r.ltp }));

  const supplyZone = pickSupply(atm, step, ce);

  const lastDet = detections[detections.length - 1] ?? null;

  return {
    status,
    samples: samples.length,
    moves,
    windowSec: samples.length > 1 ? Math.round((samples[samples.length - 1].t - samples[0].t) / 1000) : 0,
    spot: spot ?? null,
    step,
    expiry: expiry ?? "",
    ce,
    pe,
    dashboard: {
      bestCE,
      bestPE,
      reactiveATM,
      highProb,
      decayTraps,
      overpricedSlow,
      supplyZone,
    },
    spotMatch: lastDet
      ? { ce: lastDet.ce, pe: lastDet.pe, advantage: advantageOf(lastDet.ce, lastDet.pe) }
      : null,
    forward: computeForwardSummary(key),
  };
}

function pickBest(rows: MomentumRow[]): { strike: number; scorePct: number; partPct: number } | null {
  let best: MomentumRow | null = null;
  for (const r of rows) if (r.score !== null && (best === null || r.score > (best.score ?? 0))) best = r;
  if (!best || best.score === null) return null;
  return { strike: best.strike, scorePct: best.score, partPct: best.partPct };
}

function pickReactive(atm: number, step: number, rows: MomentumRow[]): { strike: number; respPct: number } | null {
  const near = rows.filter((r) => Math.abs(r.strike - atm) <= step && r.respPct !== null);
  if (near.length === 0) return null;
  let best = near[0];
  for (const r of near) if ((r.respPct ?? 0) > (best.respPct ?? 0)) best = r;
  return { strike: best.strike, respPct: best.respPct ?? 0 };
}

function pickSupply(atm: number, step: number, ce: MomentumRow[]): { strike: number; distPct: number } | null {
  const zone = ce
    .filter((r) => r.strike >= atm && r.strike <= atm + 4 * step && r.distPct !== null)
    .sort((a, b) => (b.distPct ?? 0) - (a.distPct ?? 0));
  if (zone.length === 0) return null;
  return { strike: zone[0].strike, distPct: zone[0].distPct ?? 0 };
}

function medianLtp(rows: MomentumRow[]): number {
  const all = rows.map((r) => r.ltp).sort((a, b) => a - b);
  if (all.length === 0) return 0;
  const mid = Math.floor(all.length / 2);
  return all.length % 2 ? all[mid] : (all[mid - 1] + all[mid]) / 2;
}

function label(
  distPts: number,
  step: number,
  strike: number,
  spot: number | null,
  side: "ce" | "pe",
): MomentumRow["moneyness"] {
  if (distPts <= 1.5 * step) return "ATM";
  const itm = side === "ce" ? (spot ?? 0) > strike : (spot ?? 0) < strike;
  if (distPts <= 4 * step) return itm ? "ITM" : "OTM";
  return itm ? "deep_ITM" : "deep_OTM";
}

export function clearMomentumBuffers(): void {
  buffers.clear();
  spotHistories.clear();
  detectionLogs.clear();
}