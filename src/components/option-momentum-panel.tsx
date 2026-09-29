"use client";

import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { inr } from "@/lib/format";

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
    ce: { strike: number; ltp: number; calc: number; diff: number } | null;
    pe: { strike: number; ltp: number; calc: number; diff: number } | null;
    advantage: { side: "CE" | "PE" | "tied"; pts: number } | null;
  } | null;
  forward: {
    detections: number;
    collected: boolean;
    windows: { label: string; mins: number; n: number; avgMovePts: number | null; dirAccPct: number | null }[];
  };
}

const NEAR_ATM_STEPS = 5;

const STATUS_CHIP: Record<MomentumReport["status"] | "collecting", { label: string; cls: string }> = {
  "warming-up": { label: "Warming up", cls: "bg-amber-100 text-amber-700" },
  "low-signal": { label: "Waiting for moves", cls: "bg-sky-100 text-sky-700" },
  live: { label: "Live", cls: "bg-up-bg text-up" },
  collecting: { label: "Collecting data", cls: "bg-sky-100 text-sky-700" },
};

function matchTone(v: number | null): string {
  if (v === null || !isFinite(v)) return "";
  if (v >= 70) return "bg-up-bg text-up";
  if (v >= 40) return "bg-amber-100 text-amber-700";
  return "bg-down-bg text-down";
}

function signed(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
}

function qualityOf(diff: number): { label: string; cls: string } {
  if (diff < 5) return { label: "Very close", cls: "bg-up-bg text-up" };
  if (diff < 10) return { label: "Close", cls: "bg-amber-100 text-amber-700" };
  if (diff < 20) return { label: "Moderate", cls: "bg-orange-100 text-orange-600" };
  return { label: "Weak", cls: "bg-down-bg text-down" };
}

function MatchBlock({
  label,
  m,
  chipCls,
  textCls,
}: {
  label: "CE" | "PE";
  m: { strike: number; ltp: number; calc: number; diff: number } | null;
  chipCls: string;
  textCls: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-line p-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Best {label}</span>
        {m && (
          <span className={`rounded-full px-1.5 py-px text-[9px] font-bold text-white ${chipCls}`}>best</span>
        )}
      </div>
      {m ? (
        <div className="mt-1">
          <div className="tabular text-lg font-extrabold text-ink">
            {m.strike} {label}
          </div>
          <div className="mt-0.5 grid grid-cols-2 gap-x-2 text-[10px] text-slate-500">
            <span>
              LTP <span className="tabular font-semibold text-slate-700">{m.ltp.toFixed(2)}</span>
            </span>
            <span>
              Calc <span className="tabular font-semibold text-slate-700">{m.calc.toFixed(2)}</span>
            </span>
          </div>
          <div className={`tabular mt-1 text-[13px] font-extrabold ${textCls}`}>Diff {m.diff.toFixed(2)} pts</div>
        </div>
      ) : (
        <div className="py-2 text-center text-[11px] text-slate-400">—</div>
      )}
    </div>
  );
}

export function OptionMomentumPanel({
  underlying,
  expiry,
  hideTitle = false,
}: {
  underlying: string;
  expiry: string;
  hideTitle?: boolean;
}) {
  const [report, setReport] = useState<MomentumReport | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const r = await fetch(
          `/api/option-momentum?underlying=${encodeURIComponent(underlying)}&expiry=${encodeURIComponent(expiry)}`,
          { cache: "no-store" },
        );
        const d = (await r.json()) as MomentumReport;
        if (mounted) setReport(d);
      } catch {
        /* keep last value */
      }
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, [underlying, expiry]);

  const chipKey: keyof typeof STATUS_CHIP =
    report?.status === "live" ? (report.forward.collected ? "live" : "collecting") : report?.status ?? "warming-up";
  const statusChip = report ? STATUS_CHIP[chipKey] : null;

  const advText = report?.spotMatch?.advantage
    ? report.spotMatch.advantage.side === "tied"
      ? "Balanced (tied)"
      : `${report.spotMatch.advantage.side} → ${report.spotMatch.advantage.pts.toFixed(2)} pts closer`
    : "";

  const qualityChips: { side: string; label: string; cls: string }[] = [];
  if (report?.spotMatch) {
    if (report.spotMatch.ce) {
      const q = qualityOf(report.spotMatch.ce.diff);
      qualityChips.push({ side: "CE", label: q.label, cls: q.cls });
    }
    if (report.spotMatch.pe) {
      const q = qualityOf(report.spotMatch.pe.diff);
      qualityChips.push({ side: "PE", label: q.label, cls: q.cls });
    }
  }

  const atmStrike = report?.spot ? Math.round(report.spot / report.step) * report.step : null;
  const bestCeStrike = report?.spotMatch?.ce?.strike ?? null;
  const bestPeStrike = report?.spotMatch?.pe?.strike ?? null;

  const nearByStrike = new Map<number, { ce?: MomentumRow; pe?: MomentumRow }>();
  if (report) {
    for (const r of report.ce) {
      if (Math.abs(r.distPts) / report.step <= NEAR_ATM_STEPS)
        nearByStrike.set(r.strike, { ...nearByStrike.get(r.strike), ce: r });
    }
    for (const r of report.pe) {
      if (Math.abs(r.distPts) / report.step <= NEAR_ATM_STEPS)
        nearByStrike.set(r.strike, { ...nearByStrike.get(r.strike), pe: r });
    }
  }
  const nearRows = [...nearByStrike.keys()].sort((a, b) => b - a);

  return (
    <div className="@container w-full min-w-0 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3.5 py-2">
        <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
          {!hideTitle && (
            <>
              <Target size={14} className="text-brand-600" />
              SPOT MATCH VALIDATION
            </>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          {statusChip && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusChip.cls}`}>{statusChip.label}</span>
          )}
          {report && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
              {report.forward.detections} detections
            </span>
          )}
        </div>
      </div>

      {!report ? (
        <div className="py-8 text-center text-xs text-slate-400">Loading…</div>
      ) : (
        <div className="space-y-2.5 p-3.5">
          <p className="text-[10px] leading-relaxed text-slate-500">
            Live forward-test of CE/PE spot-match behavior — does NIFTY move toward the side whose calculated spot is
            closest?
          </p>

          {report.status === "warming-up" && (
            <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
              {report.samples === 0
                ? `Waiting for a valid ${underlying} price from the feed…`
                : `Recording samples (${report.samples}/12)… numbers fill once ${underlying} starts moving.`}
            </p>
          )}
          {report.status === "low-signal" && (
            <p className="rounded-md bg-sky-50 px-2 py-1.5 text-[11px] text-sky-700">
              Live · {report.moves} registered moves. Match % fills as {underlying} ticks &gt;0.03% between checks.
            </p>
          )}

          <div className="flex items-center justify-between rounded-lg border border-line bg-slate-50/70 px-3 py-1.5">
            <span className="text-[11px] font-bold text-ink">NIFTY SPOT</span>
            <span className="tabular text-base font-extrabold text-brand-600">{report.spot ? inr(report.spot, 2) : "—"}</span>
          </div>

          <div className="grid grid-cols-1 gap-2 @[340px]:grid-cols-2">
            <MatchBlock label="CE" m={report.spotMatch?.ce ?? null} chipCls="bg-emerald-600" textCls="text-emerald-700" />
            <MatchBlock label="PE" m={report.spotMatch?.pe ?? null} chipCls="bg-orange-500" textCls="text-orange-600" />
          </div>

          {qualityChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line px-2 py-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Match quality</span>
              <span className="flex flex-wrap gap-1.5">
                {qualityChips.map((q) => (
                  <span key={q.side} className={`rounded-full px-1.5 py-px text-[9px] font-bold ${q.cls}`}>
                    {q.side} {q.label}
                  </span>
                ))}
              </span>
              <span className="w-full text-[9px] text-slate-400">
                provisional · &lt;5 very close · 5–10 close · 10–20 moderate · 20+ weak
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg border border-line px-2 py-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Match advantage</span>
            <span className="tabular min-w-0 text-right text-[12px] font-extrabold text-ink">
              {advText || "—"}
            </span>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Forward validation</span>
              {!report.forward.collected && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_CHIP.collecting.cls}`}>
                  COLLECTING DATA
                </span>
              )}
            </div>
            <div className="overflow-hidden rounded-lg border border-line">
              <table className="w-full text-[11px] tabular">
                <thead>
                  <tr className="border-b border-line bg-slate-50 text-[9px] uppercase tracking-wide text-slate-400">
                    <th className="px-2 py-1 text-left font-semibold">Window</th>
                    <th className="px-2 py-1 text-right font-semibold">n</th>
                    <th className="px-2 py-1 text-right font-semibold">Avg Δ</th>
                    <th className="px-2 py-1 text-right font-semibold">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {report.forward.windows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-2 py-2 text-center text-slate-400">
                        no data yet
                      </td>
                    </tr>
                  ) : (
                    report.forward.windows.map((w) => (
                      <tr key={w.label} className="border-b border-line/40">
                        <td className="px-2 py-1 font-bold text-ink">{w.label}</td>
                        <td className="px-2 py-1 text-right text-slate-500">{w.n > 0 ? w.n : "—"}</td>
                        <td
                          className={`tabular px-2 py-1 text-right font-extrabold ${
                            w.n > 0 ? (w.avgMovePts! >= 0 ? "text-up" : "text-down") : "text-slate-400"
                          }`}
                        >
                          {w.n > 0 ? `${signed(w.avgMovePts!)} pts` : "collecting…"}
                        </td>
                        <td
                          className={`tabular px-2 py-1 text-right font-extrabold ${
                            w.n > 0 ? "text-ink" : "text-slate-400"
                          }`}
                        >
                          {w.n > 0 ? `${w.dirAccPct}%` : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
              After each best-match, the next NIFTY move is compared to the predicted direction (PE closer → down, CE
              closer → up). Ties &amp; flat moves excluded. Directional share, not a verdict — fills once enough time
              elapses.
            </p>
          </div>

          <div className="border-t border-line pt-2">
            <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
              CE vs PE strike match · ATM ±{NEAR_ATM_STEPS}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2 @[360px]:grid-cols-2">
            <div className="min-w-0">
              <div className="mb-1 text-[10px] font-extrabold text-emerald-700">CALL (CE)</div>
              <div className="overflow-hidden rounded-md border border-line">
                <table className="w-full text-[10px] tabular">
                  <thead>
                    <tr className="border-b border-line bg-slate-50 text-[8px] uppercase tracking-wide text-slate-400">
                      <th className="py-0.5 pl-1 pr-1 text-left font-semibold">Strike</th>
                      <th className="pr-1 pl-1 text-right font-semibold">Match %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nearRows.map((k) => {
                      const r = nearByStrike.get(k)?.ce;
                      const isAtm = atmStrike !== null && k === atmStrike;
                      const isBest = bestCeStrike !== null && k === bestCeStrike;
                      return (
                        <tr key={k} className={`border-b border-line/40 ${isAtm ? "bg-brand-50/60" : ""}`}>
                          <td className="py-0.5 pl-1 pr-1 font-bold text-ink">
                            {isAtm ? <span className="text-brand-600">◀ {k}</span> : k}
                          </td>
                          <td
                            className={`px-1 py-0.5 text-right font-bold ${matchTone(r?.matchPct ?? null)} ${
                              isBest ? "bg-emerald-100" : ""
                            }`}
                          >
                            {r && r.matchPct !== null && isFinite(r.matchPct) ? `${r.matchPct}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="min-w-0">
              <div className="mb-1 text-[10px] font-extrabold text-orange-600">PUT (PE)</div>
              <div className="overflow-hidden rounded-md border border-line">
                <table className="w-full text-[10px] tabular">
                  <thead>
                    <tr className="border-b border-line bg-slate-50 text-[8px] uppercase tracking-wide text-slate-400">
                      <th className="py-0.5 pl-1 pr-1 text-left font-semibold">Strike</th>
                      <th className="pr-1 pl-1 text-right font-semibold">Match %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nearRows.map((k) => {
                      const r = nearByStrike.get(k)?.pe;
                      const isAtm = atmStrike !== null && k === atmStrike;
                      const isBest = bestPeStrike !== null && k === bestPeStrike;
                      return (
                        <tr key={k} className={`border-b border-line/40 ${isAtm ? "bg-brand-50/60" : ""}`}>
                          <td className="py-0.5 pl-1 pr-1 font-bold text-ink">
                            {isAtm ? <span className="text-brand-600">◀ {k}</span> : k}
                          </td>
                          <td
                            className={`px-1 py-0.5 text-right font-bold ${matchTone(r?.matchPct ?? null)} ${
                              isBest ? "bg-orange-100" : ""
                            }`}
                          >
                            {r && r.matchPct !== null && isFinite(r.matchPct) ? `${r.matchPct}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <p className="text-[10px] leading-relaxed text-slate-400">
            Match % = how much of NIFTY&apos;s move each strike&apos;s price tracked. NIFTY +0.5%, 24200 CE +0.48% → 96%.
            100 = tracked fully, 0 = didn&apos;t move in step (or moved opposite). Needs live NIFTY ticks.
          </p>
        </div>
      )}
    </div>
  );
}