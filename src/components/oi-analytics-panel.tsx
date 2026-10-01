"use client";

import { useMemo, useState } from "react";
import { compactIndian, inr, num2, shortDate } from "@/lib/format";
import {
  atmOf,
  atmSummary,
  changeOiTotals,
  concentrationZone,
  maxOf,
  maxPain,
  pcr,
  strikeWindow,
  topN,
  type AnalyticsRow,
} from "@/lib/oi-analytics";
import { advantageLabel as advantageLabelText, advantageOf, computeSpotMatch } from "@/lib/spot-match";
import { BarPairChart, LinePairChart, RankBars } from "./oi-charts";
import type { Chain } from "@/lib/use-chain";

const RADII = [10, 20, 0];

function Card({
  title,
  subtitle,
  children,
  testId,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className="rounded-xl border border-line bg-white p-3" data-testid={testId}>
      <header className="mb-2 flex items-baseline gap-2">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-ink">{title}</h3>
        {subtitle ? <span className="text-[10px] text-slate-400">{subtitle}</span> : null}
      </header>
      {children}
    </section>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-500">
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-sm bg-brand-600" /> CALL (CE)
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-sm bg-down" /> PUT (PE)
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-4 border-t border-dashed border-brand-700" /> ATM
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-4 border-t border-ink" /> SPOT
      </span>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-slate-50/60 px-2.5 py-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`tabular truncate text-[15px] font-extrabold ${tone ?? "text-ink"}`}>{value}</div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`tabular truncate text-[13px] font-extrabold ${tone ?? "text-ink"}`}>{value}</div>
    </div>
  );
}

export function OiAnalyticsPanel({ chain }: { chain: Chain }) {
  const [radius, setRadius] = useState(10);

  const atm = atmOf(chain.spot, chain.step);
  const all: AnalyticsRow[] = useMemo(() => chain.rows, [chain.rows]);
  const windowed: AnalyticsRow[] = useMemo(
    () => (atm === null ? all.slice(0, 1) : radius === 0 ? all : strikeWindow(all, atm, radius)),
    [all, atm, radius],
  );

  const ratio = pcr(all);
  const pain = maxPain(all);
  const atmRow = atm === null ? null : atmSummary(all, atm);
  const chg = changeOiTotals(windowed);
  const ceZone = atm === null ? null : concentrationZone(windowed, atm, "ce");
  const peZone = atm === null ? null : concentrationZone(windowed, atm, "pe");

  const topCeOi = topN(windowed, "ce", "oi", 3);
  const topPeOi = topN(windowed, "pe", "oi", 3);
  const topCeVol = topN(windowed, "ce", "volume", 3);
  const topPeVol = topN(windowed, "pe", "volume", 3);

  // Display only: the existing Spot Match math is untouched.
  const match = useMemo(
    () => (all.length ? computeSpotMatch(chain.spot, all) : { ce: null, pe: null }),
    [all, chain.spot],
  );
  const advLabel = advantageLabelText(advantageOf(match.ce, match.pe));

  const label = radius === 0 ? "Full chain" : `ATM ±${radius}`;
  const peakCeOi = maxOf(windowed, "ce", "oi");
  const peakPeOi = maxOf(windowed, "pe", "oi");
  const peakCeVol = maxOf(windowed, "ce", "volume");
  const peakPeVol = maxOf(windowed, "pe", "volume");

  return (
    <div className="flex flex-col gap-3" data-testid="oi-analytics">
      <div className="rounded-xl border border-line bg-white p-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
            <Stat label={`${chain.underlying} Spot`} value={inr(chain.spot, 2)} tone="text-brand-600" />
            <Stat label="ATM" value={atm === null ? "—" : String(atm)} />
            <Stat label="Expiry" value={shortDate(chain.expiry)} />
            <Stat label="PCR (OI)" value={ratio === null ? "—" : num2.format(ratio)} />
            <Stat label="Max Pain" value={pain === null ? "—" : String(pain)} />
            <Stat
              label="Change in OI"
              value={`CE ${compactIndian(chg.ce)} · PE ${compactIndian(chg.pe)}`}
              tone={chg.ce >= 0 ? "text-up" : "text-down"}
            />
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Strike range">
            {RADII.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRadius(r)}
                className={`rounded px-2 py-1 text-[11px] font-bold transition ${
                  radius === r ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {r === 0 ? "Full" : `±${r}`}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
          <Legend />
          <span className="text-[10px] text-slate-400" data-testid="window-label">
            {windowed.length} strikes · {label}
          </span>
        </div>
        {chain.synthetic && (
          <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700" data-testid="synthetic-note">
            Synthetic chain · values simulated, not real NSE trades.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="OI — Strike Wise" subtitle={label} testId="card-oi-bars">
          <BarPairChart rows={windowed} atm={atm} spot={chain.spot} metric="oi" testId="chart-oi-bars" />
        </Card>
        <Card title="Volume — Strike Wise" subtitle={label} testId="card-vol-bars">
          <BarPairChart rows={windowed} atm={atm} spot={chain.spot} metric="volume" testId="chart-vol-bars" />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="OI Comparison" subtitle={label} testId="card-oi-lines">
          <LinePairChart rows={windowed} atm={atm} spot={chain.spot} metric="oi" testId="chart-oi-lines" />
        </Card>
        <Card title="Volume Comparison" subtitle={label} testId="card-vol-lines">
          <LinePairChart rows={windowed} atm={atm} spot={chain.spot} metric="volume" testId="chart-vol-lines" />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="OI Concentration" subtitle={`top 3 · peak CE ${compactIndian(peakCeOi)} · peak PE ${compactIndian(peakPeOi)}`} testId="card-oi-conc">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-brand-600">Top CE OI</div>
              <RankBars items={topCeOi} side="ce" testId="rank-ce-oi" />
            </div>
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-down">Top PE OI</div>
              <RankBars items={topPeOi} side="pe" testId="rank-pe-oi" />
            </div>
          </div>
          <ZoneNote zone={ceZone} other={peZone} atm={atm} />
        </Card>
        <Card title="Volume Concentration" subtitle={`top 3 · peak CE ${compactIndian(peakCeVol)} · peak PE ${compactIndian(peakPeVol)}`} testId="card-vol-conc">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-brand-600">Top CE Volume</div>
              <RankBars items={topCeVol} side="ce" testId="rank-ce-vol" />
            </div>
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-down">Top PE Volume</div>
              <RankBars items={topPeVol} side="pe" testId="rank-pe-vol" />
            </div>
          </div>
        </Card>
      </div>

      <Card title="ATM Analysis" subtitle={atm === null ? "—" : `strike ${atm}`} testId="card-atm">
        {atmRow ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="ATM Strike" value={String(atmRow.strike)} tone="text-brand-600" />
            <Metric label="CE OI" value={compactIndian(atmRow.ceOi)} />
            <Metric label="PE OI" value={compactIndian(atmRow.peOi)} />
            <Metric label="CE Volume" value={compactIndian(atmRow.ceVolume)} />
            <Metric label="PE Volume" value={compactIndian(atmRow.peVolume)} />
            <Metric label="PCR (OI)" value={ratio === null ? "—" : num2.format(ratio)} />
          </div>
        ) : (
          <p className="text-[11px] text-slate-400">ATM strike is not present in this chain.</p>
        )}
      </Card>

      <Card title="Spot Match" subtitle="existing calculations, unchanged" testId="card-spot-match">
        {match.ce && match.pe ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5" data-testid="sm-ce">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Best CE Match</div>
              <div className="tabular text-[13px] font-extrabold text-ink">
                {match.ce.strike} CE · LTP {match.ce.ltp.toFixed(2)}
              </div>
              <div className="tabular text-[11px] text-slate-500">Calc {match.ce.calc.toFixed(2)} · Diff {match.ce.diff.toFixed(2)} pts</div>
            </div>
            <div className="rounded-lg border border-orange-200 bg-orange-50/60 p-2.5" data-testid="sm-pe">
              <div className="text-[10px] font-bold uppercase tracking-wider text-orange-700">Best PE Match</div>
              <div className="tabular text-[13px] font-extrabold text-ink">
                {match.pe.strike} PE · LTP {match.pe.ltp.toFixed(2)}
              </div>
              <div className="tabular text-[11px] text-slate-500">Calc {match.pe.calc.toFixed(2)} · Diff {match.pe.diff.toFixed(2)} pts</div>
            </div>
            <div className="rounded-lg border border-line bg-slate-50 p-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Match Advantage</div>
              <div className="text-[13px] font-extrabold text-ink" data-testid="sm-advantage">
                {advLabel}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400">No spot match available.</p>
        )}
      </Card>
    </div>
  );
}

function ZoneNote({ zone, other, atm }: { zone: ReturnType<typeof concentrationZone>; other: ReturnType<typeof concentrationZone>; atm: number | null }) {
  if (!zone || atm === null) return null;
  return (
    <p className="mt-2.5 border-t border-line pt-2 text-[10px] text-slate-500" data-testid="oi-zone-note">
      Within ATM ±5 steps ({zone.lo}–{zone.hi}), call OI holds <span className="font-bold text-brand-600">{zone.sharePct}%</span> of call OI
      {other ? (
        <>
          {" "}and put OI holds <span className="font-bold text-down">{other.sharePct}%</span> of put OI
        </>
      ) : null}
      .
    </p>
  );
}