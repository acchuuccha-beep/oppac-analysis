"use client";

import { useEffect, useMemo, useState } from "react";
import { compactIndian } from "@/lib/format";
import { legValue, type AnalyticsRow, type Metric, type Side } from "@/lib/oi-analytics";

// Fixed user-space coordinate system so type sizes stay predictable at every
// viewport. The SVG scales to its container width and keeps this aspect ratio.
// Narrow screens get a taller box so the plot area stays readable when the
// chart is only ~320px wide.
const W = 520;
const H_WIDE = 244;
const H_NARROW = 340;
const NARROW_QUERY = "(max-width: 640px)";

function useChartHeight(): number {
  const [h, setH] = useState(H_WIDE);
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const apply = () => setH(mq.matches ? H_NARROW : H_WIDE);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return h;
}

const PAD_L = 48;
const PAD_R = 10;
const PAD_T = 20;
const PAD_B = 32;

const PLOT_W = W - PAD_L - PAD_R;

const CE_COLOR = "var(--color-brand-600)";
const PE_COLOR = "var(--color-down)";
const GRID = "var(--color-line)";
const MUTED = "#94a3b8";

const AXIS_FS = 10;
const LABEL_FS = 10;
const CHAR_W = 5.6;

function strikeLabel(strike: number): string {
  return Math.round(strike).toLocaleString("en-IN");
}

function labelWidth(text: string, fs = LABEL_FS): number {
  return text.length * CHAR_W * (fs / LABEL_FS) + 6;
}

function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}

function axisTicks(max: number, count = 4): number[] {
  const out: number[] = [];
  for (let i = 1; i <= count; i++) out.push(Math.round((max / count) * i));
  return out;
}

/**
 * Chooses which strike labels to draw. Every strike keeps its data mark; only
 * the text is thinned. ATM always gets a label, its neighbours are added when
 * they physically fit, and no two labels are ever allowed to collide.
 */
export function chooseStrikeLabels(
  rows: AnalyticsRow[],
  slot: number,
  atmIndex: number,
): { indices: number[]; atmLabelled: boolean } {
  if (rows.length === 0) return { indices: [], atmLabelled: false };

  const widthAt = (i: number) => labelWidth(strikeLabel(rows[i].strike));
  const placed: { i: number; w: number }[] = [];
  const fits = (i: number, w: number) =>
    placed.every((p) => Math.abs(p.i - i) * slot >= (p.w + w) / 2 + 6);

  // ATM wins every contest; it is placed first and never dropped.
  const atmLabelled = atmIndex >= 0 && atmIndex < rows.length;
  if (atmLabelled) placed.push({ i: atmIndex, w: widthAt(atmIndex) });

  // Neighbours next, but only where the spacing genuinely allows them.
  for (const i of [atmIndex - 1, atmIndex + 1]) {
    if (i < 0 || i >= rows.length) continue;
    const w = widthAt(i);
    if (fits(i, w)) placed.push({ i, w });
  }

  const stride = Math.max(
    1,
    Math.ceil((widthAt(0) + 10) / Math.max(slot, 1)),
  );
  for (let i = 0; i < rows.length; i++) {
    if (i === atmIndex) continue;
    if (i % stride !== 0) continue;
    const w = widthAt(i);
    if (!fits(i, w)) continue;
    placed.push({ i, w });
  }

  placed.sort((a, b) => a.i - b.i);
  return { indices: placed.map((p) => p.i), atmLabelled };
}

interface MarkerProps {
  x: number;
  color: string;
  label: string;
  dashed: boolean;
  labelY: number;
  anchor: "start" | "middle" | "end";
  offset: number;
  testId: string;
  plotH: number;
}

/**
 * Vertical reference rule. The ATM label sits above the plot and the SPOT label
 * inside its top edge, so the two never collide even when spot is one step from
 * ATM.
 */
function Marker({ x, color, label, dashed, labelY, anchor, offset, testId, plotH }: MarkerProps) {
  const clamped = Math.min(Math.max(x, PAD_L), W - PAD_R);
  return (
    <g data-testid={testId}>
      <line
        x1={clamped}
        y1={PAD_T - 2}
        x2={clamped}
        y2={PAD_T + plotH}
        stroke={color}
        strokeWidth={dashed ? 1.1 : 1.3}
        strokeDasharray={dashed ? "4 3" : undefined}
        opacity={0.85}
      />
      <text
        x={clamped + offset}
        y={labelY}
        fontSize={AXIS_FS}
        fill={color}
        textAnchor={anchor}
        fontWeight={800}
        letterSpacing="0.04em"
      >
        {label}
      </text>
    </g>
  );
}

function Tooltip({ row, metric }: { row: AnalyticsRow; metric: Metric }) {
  const primary = metric === "oi" ? "OI" : "Volume";
  return (
    <title>
      {[
        `Strike ${strikeLabel(row.strike)}`,
        `CE OI ${compactIndian(row.ce.oi)}`,
        `PE OI ${compactIndian(row.pe.oi)}`,
        `CE Volume ${compactIndian(row.ce.volume)}`,
        `PE Volume ${compactIndian(row.pe.volume)}`,
        `CE LTP ${row.ce.ltp.toFixed(2)}`,
        `PE LTP ${row.pe.ltp.toFixed(2)}`,
        `CE Change in OI ${compactIndian(row.ce.change_oi)}`,
        `PE Change in OI ${compactIndian(row.pe.change_oi)}`,
        `peak ${primary}: CE ${compactIndian(legValue(row, "ce", metric))} · PE ${compactIndian(legValue(row, "pe", metric))}`,
      ].join("\n")}
    </title>
  );
}

function Frame({ max, metric, boxH, plotH }: { max: number; metric: Metric; boxH: number; plotH: number }) {
  return (
    <>
      <rect x={0} y={0} width={W} height={boxH} rx={4} fill="var(--color-surface)" />
      {axisTicks(max).map((t) => {
        const y = PAD_T + plotH - (t / max) * plotH;
        return (
          <g key={t}>
            <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke={GRID} strokeWidth={1} />
            <text x={PAD_L - 6} y={y + 3.4} fontSize={AXIS_FS} fill={MUTED} textAnchor="end">
              {compactIndian(t)}
            </text>
          </g>
        );
      })}
      <line x1={PAD_L} y1={PAD_T + plotH} x2={W - PAD_R} y2={PAD_T + plotH} stroke="#cbd5e1" strokeWidth={1} />
      <text x={PAD_L - 6} y={PAD_T - 2} fontSize={AXIS_FS} fill={MUTED} textAnchor="end" fontWeight={700}>
        {metric === "oi" ? "OI" : "VOL"}
      </text>
    </>
  );
}

function StrikeAxis({
  rows,
  xOf,
  slot,
  atmIndex,
  atm,
  labelY,
}: {
  rows: AnalyticsRow[];
  xOf: (strike: number) => number;
  slot: number;
  atmIndex: number;
  atm: number | null;
  labelY: number;
}) {
  const { indices } = useMemo(() => chooseStrikeLabels(rows, slot, atmIndex), [rows, slot, atmIndex]);
  return (
    <>
      {indices.map((i) => {
        const r = rows[i];
        const isAtm = atm !== null && r.strike === atm;
        return (
          <text
            key={r.strike}
            x={xOf(r.strike)}
            y={labelY}
            fontSize={LABEL_FS}
            fill={isAtm ? "var(--color-brand-700)" : MUTED}
            textAnchor="middle"
            fontWeight={isAtm ? 800 : 500}
          >
            {strikeLabel(r.strike)}
          </text>
        );
      })}
    </>
  );
}

interface PairChartProps {
  rows: AnalyticsRow[];
  atm: number | null;
  spot: number;
  metric: Metric;
  testId: string;
}

function useGeometry(rows: AnalyticsRow[], atm: number | null, spot: number, metric: Metric, boxH: number) {
  return useMemo(() => {
    const n = rows.length;
    const max = niceMax(
      Math.max(...rows.map((r) => Math.max(legValue(r, "ce", metric), legValue(r, "pe", metric))), 0),
    );
    const plotH = boxH - PAD_T - PAD_B;
    const span = n > 1 ? rows[n - 1].strike - rows[0].strike : 1;
    const slot = PLOT_W / Math.max(n, 1);
    const xOf = (strike: number) => PAD_L + ((strike - rows[0].strike) / Math.max(span, 1)) * PLOT_W;
    const yOf = (v: number) => PAD_T + plotH - (v / max) * plotH;
    const lo = rows[0]?.strike ?? 0;
    const hi = rows[n - 1]?.strike ?? 0;
    const atmIndex = atm === null ? -1 : rows.findIndex((r) => r.strike === atm);
    return { n, max, slot, plotH, boxH, xOf, yOf, lo, hi, atmIndex, showAtm: atmIndex >= 0, showSpot: spot >= lo && spot <= hi };
  }, [rows, atm, spot, metric, boxH]);
}

/** Mirrored CE/PE bars per strike, ATM band highlighted. */
export function BarPairChart({ rows, atm, spot, metric, testId }: PairChartProps) {
  const boxH = useChartHeight();
  const g = useGeometry(rows, atm, spot, metric, boxH);
  if (g.n === 0) return <EmptyChart label="No strikes in range" />;

  const barW = Math.min(9, Math.max(3, g.slot * 0.34));
  const gap = 1.5;
  const mid = PAD_T + g.plotH;
  const atmIdx = g.atmIndex;

  return (
    <svg
      viewBox={`0 0 ${W} ${boxH}`}
      className="block w-full"
      role="img"
      data-testid={testId}
      data-metric={metric}
      data-atm-index={atmIdx}
    >
      <Frame max={g.max} metric={metric} boxH={boxH} plotH={g.plotH} />
      {g.showAtm ? (
        <rect
          x={g.xOf(rows[atmIdx].strike) - g.slot / 2}
          y={PAD_T - 2}
          width={g.slot}
          height={g.plotH + 2}
          fill="var(--color-brand-600)"
          opacity={0.07}
        />
      ) : null}
      {rows.map((r) => {
        const cx = g.xOf(r.strike);
        const hCe = Math.max((legValue(r, "ce", metric) / g.max) * g.plotH, 1);
        const hPe = Math.max((legValue(r, "pe", metric) / g.max) * g.plotH, 1);
        return (
          <g key={r.strike} data-strike={r.strike}>
            <rect
              x={cx - barW - gap / 2}
              y={mid - hCe}
              width={barW}
              height={hCe}
              fill={CE_COLOR}
              rx={1.5}
              data-testid={`ce-${r.strike}`}
              data-value={legValue(r, "ce", metric)}
            />
            <rect
              x={cx + gap / 2}
              y={mid - hPe}
              width={barW}
              height={hPe}
              fill={PE_COLOR}
              rx={1.5}
              data-testid={`pe-${r.strike}`}
              data-value={legValue(r, "pe", metric)}
            />
            <rect
              x={cx - g.slot / 2}
              y={PAD_T - 2}
              width={g.slot}
              height={g.plotH + 2 + PAD_B - 6}
              fill="transparent"
            >
              <Tooltip row={r} metric={metric} />
            </rect>
          </g>
        );
      })}
      <StrikeAxis rows={rows} xOf={g.xOf} slot={g.slot} atmIndex={atmIdx} atm={atm} labelY={mid + 15} />
      {g.showAtm ? (
        <Marker
          x={g.xOf(rows[atmIdx].strike)}
          color="var(--color-brand-700)"
          label="ATM"
          dashed
          labelY={PAD_T - 6}
          anchor="middle"
          offset={0}
          testId="marker-ATM"
          plotH={g.plotH}
        />
      ) : null}
      {g.showSpot ? (
        <Marker
          x={g.xOf(spot)}
          color="var(--color-ink)"
          label="SPOT"
          dashed={false}
          labelY={PAD_T + 12}
          anchor="middle"
          offset={0}
          testId="marker-SPOT"
          plotH={g.plotH}
        />
      ) : null}
    </svg>
  );
}

/** Two polylines over the same strike axis. */
export function LinePairChart({ rows, atm, spot, metric, testId }: PairChartProps) {
  const boxH = useChartHeight();
  const g = useGeometry(rows, atm, spot, metric, boxH);
  if (g.n === 0) return <EmptyChart label="No strikes in range" />;

  const path = (side: Side) =>
    rows
      .map((r, i) => `${i === 0 ? "M" : "L"}${g.xOf(r.strike).toFixed(2)},${g.yOf(legValue(r, side, metric)).toFixed(2)}`)
      .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${boxH}`}
      className="block w-full"
      role="img"
      data-testid={testId}
      data-metric={metric}
      data-atm-index={g.atmIndex}
    >
      <Frame max={g.max} metric={metric} boxH={boxH} plotH={g.plotH} />
      {g.showAtm ? (
        <rect
          x={g.xOf(rows[g.atmIndex].strike) - g.slot / 2}
          y={PAD_T - 2}
          width={g.slot}
          height={g.plotH + 2}
          fill="var(--color-brand-600)"
          opacity={0.07}
        />
      ) : null}
      <path d={path("ce")} fill="none" stroke={CE_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <path d={path("pe")} fill="none" stroke={PE_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {rows.map((r) => (
        <g key={r.strike} data-strike={r.strike}>
          <circle cx={g.xOf(r.strike)} cy={g.yOf(legValue(r, "ce", metric))} r={2.4} fill="#fff" stroke={CE_COLOR} strokeWidth={1.6}
            data-testid={`ce-${r.strike}`} data-value={legValue(r, "ce", metric)} />
          <circle cx={g.xOf(r.strike)} cy={g.yOf(legValue(r, "pe", metric))} r={2.4} fill="#fff" stroke={PE_COLOR} strokeWidth={1.6}
            data-testid={`pe-${r.strike}`} data-value={legValue(r, "pe", metric)} />
          <rect x={g.xOf(r.strike) - g.slot / 2} y={PAD_T - 2} width={g.slot} height={g.plotH + 2 + PAD_B - 6} fill="transparent">
            <Tooltip row={r} metric={metric} />
          </rect>
        </g>
      ))}
      <StrikeAxis rows={rows} xOf={g.xOf} slot={g.slot} atmIndex={g.atmIndex} atm={atm} labelY={PAD_T + g.plotH + 15} />
      {g.showAtm ? (
        <Marker
          x={g.xOf(rows[g.atmIndex].strike)}
          color="var(--color-brand-700)"
          label="ATM"
          dashed
          labelY={PAD_T - 6}
          anchor="middle"
          offset={0}
          testId="marker-ATM"
          plotH={g.plotH}
        />
      ) : null}
      {g.showSpot ? (
        <Marker
          x={g.xOf(spot)}
          color="var(--color-ink)"
          label="SPOT"
          dashed={false}
          labelY={PAD_T + 12}
          anchor="middle"
          offset={0}
          testId="marker-SPOT"
          plotH={g.plotH}
        />
      ) : null}
    </svg>
  );
}

/**
 * Single-sided ranked bars for the concentration cards. Bars are scaled within
 * each side so relative size reads instantly; the exact figure sits alongside.
 */
export function RankBars({
  items,
  side,
  testId,
}: {
  items: { strike: number; value: number }[];
  side: Side;
  testId: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (items.length === 0) return <p className="text-[11px] text-slate-400">No data.</p>;
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      {items.map((it, i) => (
        <div key={it.strike} className="flex items-center gap-2.5" data-testid={`${testId}-row`} data-strike={it.strike} data-value={it.value}>
          <span className="tabular w-4 shrink-0 text-right text-[11px] font-bold text-slate-400">{i + 1}</span>
          <span className="tabular w-14 shrink-0 text-right text-[13px] font-extrabold text-ink">{strikeLabel(it.strike)}</span>
          <span className="relative h-4 flex-1 overflow-hidden rounded-sm bg-slate-100">
            <span
              className="absolute inset-y-0 left-0 rounded-sm"
              style={{
                width: `${Math.max(3, (it.value / max) * 100)}%`,
                background: side === "ce" ? CE_COLOR : PE_COLOR,
              }}
            />
          </span>
          <span className="tabular w-16 shrink-0 text-right text-[13px] font-bold text-slate-700">
            {compactIndian(it.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div
      className="flex h-56 items-center justify-center rounded-lg border border-line bg-surface text-[11px] text-slate-400"
      data-testid="chart-empty"
    >
      {label}
    </div>
  );
}