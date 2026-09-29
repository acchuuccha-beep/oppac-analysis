"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown } from "lucide-react";
import { inr, num2, shortDate } from "@/lib/format";
import { advantageLabel as advantageLabelText, advantageOf, computeSpotMatch } from "@/lib/spot-match";

interface StrikeRow {
  strike: number;
  ce: { ltp: number; oi: number; change_oi: number };
  pe: { ltp: number; oi: number; change_oi: number };
}

interface Chain {
  underlying: string;
  spot: number;
  expiry: string;
  expiries: string[];
  step: number;
  rows: StrikeRow[];
  synthetic?: boolean;
  source?: string;
  live?: boolean;
  delayed?: boolean;
  updatedAt?: number | null;
}

interface ScraperStatus {
  running: boolean;
  pid: number | null;
  flag: "on" | "off";
  lastSnapshotAgeMs: number | null;
  lastSnapshotAt: number | null;
}

export function OptionChainView({
  underlying,
  expiry,
  onExpiryChange,
}: {
  underlying: string;
  expiry: string | null;
  onExpiryChange: (expiry: string) => void;
}) {
  const [chain, setChain] = useState<Chain | null>(null);
  const [scraper, setScraper] = useState<ScraperStatus | null>(null);

  useEffect(() => {
    if (!chain?.expiry) return;
    onExpiryChange(chain.expiry);
  }, [chain?.expiry, onExpiryChange]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const r = await fetch("/api/nse-scraper", { cache: "no-store" });
        const d = await r.json();
        if (mounted) setScraper(d);
      } catch {
        /* noop */
      }
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const url = `/api/option-chain?underlying=${encodeURIComponent(underlying)}${expiry ? `&expiry=${expiry}` : ""}`;
        const r = await fetch(url, { cache: "no-store" });
        const d = await r.json();
        if (mounted) setChain(d);
      } catch {
        /* noop */
      }
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, [underlying, expiry]);

  const [showJump, setShowJump] = useState(false);

  const recomputeJump = useCallback(() => {
    const main = document.querySelector("main");
    const sep = document.getElementById("live-spot-line");
    if (!main || !sep) return;
    const mr = main.getBoundingClientRect();
    const sr = sep.getBoundingClientRect();
    const visible = sr.bottom > mr.top && sr.top < mr.bottom;
    const userAbove = sr.top >= mr.bottom;
    setShowJump(!visible && userAbove);
  }, []);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        recomputeJump();
      });
    };
    main.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    schedule();
    return () => {
      main.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [recomputeJump]);

  const jumpToLiveSpot = () => {
    const main = document.querySelector("main");
    const sep = document.getElementById("live-spot-line");
    if (!main || !sep) return;
    const mr = main.getBoundingClientRect();
    const sr = sep.getBoundingClientRect();
    const rowCenter = sr.top - mr.top + sr.height / 2;
    const target = main.scrollTop + rowCenter - mr.height / 2;
    main.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  };

  const toggleScraper = async () => {
    const action = scraper?.running ? "off" : "on";
    try {
      const r = await fetch("/api/nse-scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await r.json();
      setScraper(d);
    } catch {
      /* noop */
    }
  };

  // CE Calc = Strike + CE LTP ; PE Calc = Strike - PE LTP.
  // Diff = |Calc - spot|. Best match = smallest diff across the FULL dataset.
  const match = useMemo(
    () => (chain && chain.rows.length ? computeSpotMatch(chain.spot, chain.rows) : { ce: null, pe: null }),
    [chain],
  );

  if (!chain) return <div className="py-12 text-center text-sm text-slate-400">Loading option chain…</div>;

  const atm = chain.spot > 0 ? Math.round(chain.spot / chain.step) * chain.step : null;

  // Live spot separator position: rows are sorted descending, so the line
  // goes before the first row whose strike is BELOW the spot (i.e. the line
  // sits between the two strikes bracketing the actual spot).
  const firstStrikeBelow = chain.rows.findIndex((r) => r.strike < chain.spot);
  const splitIndex = firstStrikeBelow === -1 ? chain.rows.length : firstStrikeBelow;

  const advantageLabel = advantageLabelText(advantageOf(match.ce, match.pe));

  return (
    <div>
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-ink">
          {underlying} <span className="font-normal text-slate-400">·</span>{" "}
          <span className="tabular font-semibold text-brand-600">{inr(chain.spot, 2)}</span>
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
              chain.source === "nse"
                ? scraper?.running
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-amber-300 bg-amber-50 text-amber-700"
                : "border-slate-300 bg-slate-100 text-slate-500"
            }`}
          >
            {chain.source === "nse"
              ? scraper?.running
                ? "NSE Live"
                : `NSE last close${chain.updatedAt ? ` ${new Date(chain.updatedAt).toLocaleTimeString()}` : ""}`
              : "Synthetic"}
          </span>
          <button
            type="button"
            onClick={toggleScraper}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
              scraper?.running
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
            title={scraper?.running ? "Stop the NSE live 5s loop" : "Start the NSE live 5s loop"}
          >
            NSE loop: {scraper?.running ? "ON" : scraper ? "OFF" : "…"}
          </button>
          <span className="flex gap-1">
            {chain.expiries.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onExpiryChange(e)}
                className={`rounded px-2 py-1 text-xs font-semibold ${
                  chain.expiry === e ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {shortDate(e)}
              </button>
            ))}
          </span>
        </span>
      </div>

        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-slate-50/70 px-3 py-2 text-xs">
          <span className="font-bold text-ink">
            NIFTY SPOT: <span className="tabular font-extrabold text-brand-600">{inr(chain.spot, 2)}</span>
          </span>
          <span className="text-slate-300">|</span>
          {match.ce && match.pe ? (
            <>
              <span className="font-semibold text-emerald-700">
                BEST CE MATCH: <span className="tabular font-extrabold">{match.ce.strike}</span> CE · LTP{" "}
                <span className="tabular">{match.ce.ltp.toFixed(2)}</span> · Calc{" "}
                <span className="tabular">{match.ce.calc.toFixed(2)}</span> · Diff{" "}
                <span className="tabular font-extrabold">{match.ce.diff.toFixed(2)} pts</span>
              </span>
              <span className="text-slate-300">|</span>
              <span className="font-semibold text-amber-700">
                BEST PE MATCH: <span className="tabular font-extrabold">{match.pe.strike}</span> PE · LTP{" "}
                <span className="tabular">{match.pe.ltp.toFixed(2)}</span> · Calc{" "}
                <span className="tabular">{match.pe.calc.toFixed(2)}</span> · Diff{" "}
                <span className="tabular font-extrabold">{match.pe.diff.toFixed(2)} pts</span>
              </span>
              <span className="text-slate-300">|</span>
              <span className="font-semibold text-ink">
                MATCH ADVANTAGE: <span className="tabular font-extrabold">{advantageLabel}</span>
              </span>
            </>
          ) : null}
        </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2 text-right font-semibold">CE Calculation</th>
              <th className="px-3 py-2 text-right font-semibold">OI (CE)</th>
              <th className="px-3 py-2 text-right font-semibold">LTP</th>
              <th className="px-3 py-2 text-center font-semibold">Strike</th>
              <th className="px-3 py-2 text-left font-semibold">LTP</th>
              <th className="px-3 py-2 text-left font-semibold">OI (PE)</th>
              <th className="px-3 py-2 text-left font-semibold">PE Calculation</th>
            </tr>
          </thead>
          <tbody>
            {chain.rows.flatMap((r, i) => {
              const nodes = [];
              if (i === splitIndex) {
                nodes.push(
                  <tr key="spot-line" id="live-spot-line" className="relative">
                    <td colSpan={7} className="relative h-7 px-3">
                      <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-brand-500/70" />
                      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-brand-200 bg-brand-600 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white shadow-sm">
                        SPOT {inr(chain.spot, 2)}
                      </span>
                    </td>
                  </tr>,
                );
              }
              const isAtm = r.strike === atm;
              const ceCalc = r.strike + r.ce.ltp;
              const ceDiff = Math.abs(ceCalc - chain.spot);
              const peCalc = r.strike - r.pe.ltp;
              const peDiff = Math.abs(peCalc - chain.spot);
              const isBestCe = match.ce?.strike === r.strike;
              const isBestPe = match.pe?.strike === r.strike;
              nodes.push(
                <tr
                  key={r.strike}
                  className={`border-b border-line/50 ${
                    isAtm ? "bg-brand-50/60 hover:bg-brand-100/70" : "hover:bg-slate-50"
                  } ${isBestCe ? "border-l-2 border-l-emerald-500" : ""} ${
                    isBestPe ? "border-r-2 border-r-orange-400" : ""
                  }`}
                >
                  <td className={`px-3 py-1.5 text-right ${isBestCe ? "bg-emerald-100" : ""}`}>
                    <div className="tabular text-[10px] text-slate-400">Calc: {ceCalc.toFixed(2)}</div>
                    <div className="flex items-center justify-end gap-1">
                      {isBestCe && (
                        <span className="rounded-full bg-emerald-600 px-1.5 py-px text-[9px] font-bold text-white">
                          best
                        </span>
                      )}
                      <span
                        className={`tabular text-[13px] font-extrabold ${
                          isBestCe ? "text-emerald-700" : "text-slate-800"
                        }`}
                      >
                        Diff: {ceDiff.toFixed(2)} pts
                      </span>
                    </div>
                  </td>
                  <td className="tabular px-3 py-1.5 text-right text-slate-500">{num2.format(r.ce.oi)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold">
                    <div className="tabular text-up">{r.ce.ltp.toFixed(2)}</div>
                  </td>
                  <td className="tabular px-3 py-1.5 text-center font-bold text-blue-700">{r.strike}</td>
                  <td className="px-3 py-1.5 font-semibold">
                    <div className="tabular text-down">{r.pe.ltp.toFixed(2)}</div>
                  </td>
                  <td className="tabular px-3 py-1.5 text-left text-slate-500">{num2.format(r.pe.oi)}</td>
                  <td className={`px-3 py-1.5 text-right ${isBestPe ? "bg-orange-100" : ""}`}>
                    <div className="tabular text-[10px] text-slate-400">Calc: {peCalc.toFixed(2)}</div>
                    <div className="flex items-center justify-start gap-1">
                      <span
                        className={`tabular text-[13px] font-extrabold ${
                          isBestPe ? "text-orange-600" : "text-slate-800"
                        }`}
                      >
                        Diff: {peDiff.toFixed(2)} pts
                      </span>
                      {isBestPe && (
                        <span className="rounded-full bg-orange-500 px-1.5 py-px text-[9px] font-bold text-white">
                          best
                        </span>
                      )}
                    </div>
                  </td>
                </tr>,
              );
              return nodes;
            })}
          </tbody>
        </table>
        {chain.synthetic && (
          <p className="border-t border-line px-3 py-1.5 text-[11px] text-slate-400">
            Synthetic chain · prices simulated from Black-Scholes · spot {inr(chain.spot, 2)} · step {chain.step} · ATM
            row highlighted · follows live spot
          </p>
        )}
        {!chain.synthetic && !scraper?.running && (
          <p className="border-t border-line px-3 py-1.5 text-[11px] text-amber-600/80">
            Showing the last real NSE snapshot{chain.updatedAt ? ` (${new Date(chain.updatedAt).toLocaleString()})` : ""} ·
            the 5s live loop is off. Values are real NSE traded numbers, not synthetic.
          </p>
        )}
      </div>
      </div>

      {showJump && (
        <button
          type="button"
          onClick={jumpToLiveSpot}
          title="Jump to Live Spot"
          aria-label="Jump to Live Spot"
          className="fixed bottom-5 right-5 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-brand-300 bg-brand-600 text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <ArrowDown size={22} />
        </button>
      )}
    </div>
  );
}