import type { OptionChain } from "./provider";
import { buildSyntheticChain } from "../engine/chain";
import { recordChainSample } from "../momentum";
import { getNseChainRows, getNseExpiries, isNseFresh } from "./nse-live";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function getOptionChain(underlying: string, expiry: string | null): Promise<OptionChain> {
  const symbol = underlying.toUpperCase();

  // Try the live NSE cache first.
  const isoTarget = expiry ?? new Date().toISOString().slice(0, 10);
  const nseRows = getNseChainRows(symbol, isoTarget);
  if (nseRows) {
    const chain: OptionChain = {
      underlying: symbol,
      spot: round2(nseRows.spot),
      expiry: nseRows.isoExpiry,
      expiries: getNseExpiries(symbol),
      step: nseRows.rows.length > 1 ? Math.abs(nseRows.rows[0].strike - nseRows.rows[1].strike) : 50,
      synthetic: false,
      source: "nse",
      rows: nseRows.rows,
      live: isNseFresh(symbol),
      updatedAt: nseRows.updatedAt,
      delayed: !isNseFresh(symbol),
    };
    recordChainSample(chain);
    return chain;
  }

  // Fallback to the synthetic (math) chain.
  const chain = await buildSyntheticChain(symbol, expiry);
  recordChainSample(chain);
  return chain;
}
