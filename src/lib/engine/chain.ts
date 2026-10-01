import type { OptionChain, StrikeRow } from "../market/provider";
import { getQuote } from "../market/quote";
import { bsmPrice, instrumentIv, nextFridays, strikesFor, strikeStep } from "./options";

function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function buildSyntheticChain(underlying: string, expiry: string | null): Promise<OptionChain> {
  const spot = Math.max((await getQuote(underlying)).ltp, 1);
  const expiries = nextFridays(underlying, 3).map(isoDay);
  const selected = expiry && expiries.includes(expiry) ? expiry : expiries[0];
  const step = strikeStep(underlying);
  const strikes = strikesFor(underlying, spot);

  const now = Date.now();
  const t = Math.max((new Date(`${selected}T03:30:00Z`).getTime() - now) / 86_400_000, 0) / 365 + 0.001;
  const v = instrumentIv(underlying);

  const rows: StrikeRow[] = strikes
    .slice()
    .sort((a, b) => b - a)
    .map((strike, idx) => {
      const dist = Math.abs(strike - spot);
      const cePrice = Math.max(bsmPrice("call", spot, strike, t, v), 0);
      const pePrice = Math.max(bsmPrice("put", spot, strike, t, v), 0);
      const baseOi = Math.round(40000 + dist * 8);
      const oiSeed = ((idx * 7919) % 97) / 1000;
      const peSeed = 1 - oiSeed;
      const ceOi = Math.round(baseOi * (0.9 + 0.2 * oiSeed));
      const peOi = Math.round(baseOi * (0.9 + 0.2 * peSeed));
      return {
        strike,
        ce: {
          ltp: Math.round(cePrice * 100) / 100,
          oi: ceOi,
          change_oi: Math.round((oiSeed - 0.5) * 800),
          volume: Math.round(ceOi * (0.3 + 1.4 * oiSeed)),
        },
        pe: {
          ltp: Math.round(pePrice * 100) / 100,
          oi: peOi,
          change_oi: Math.round((0.5 - oiSeed) * 800),
          volume: Math.round(peOi * (0.3 + 1.4 * peSeed)),
        },
      };
    });

  return {
    underlying: underlying.toUpperCase(),
    spot: Math.round(spot * 100) / 100,
    expiry: selected,
    expiries,
    step,
    synthetic: true,
    source: "sim",
    rows,
  };
}