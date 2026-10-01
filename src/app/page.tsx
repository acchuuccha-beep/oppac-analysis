"use client";

import { useState } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { OptionChainView } from "@/components/option-chain-view";
import { OiAnalyticsPanel } from "@/components/oi-analytics-panel";
import { SpotMatchDrawer } from "@/components/spot-match-drawer";
import { WelcomeScreen } from "@/components/welcome-screen";
import { useChain } from "@/lib/use-chain";

const SYMBOLS = ["NIFTY", "BANKNIFTY"] as const;

type Tab = "chain" | "analytics";

// Bump this whenever you push an update your friends should see land.
const BUILD = "v0.4.0 - 01 Oct 2026";

export default function AnalysisPage() {
  const [symbol, setSymbol] = useState<string>("NIFTY");
  const [expiry, setExpiry] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("chain");

  // Hoisted so the chain is fetched once and both tabs render the identical
  // payload. Switching tabs never refetches, so table and charts cannot diverge.
  const { chain, scraper } = useChain(symbol, expiry);

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="text-base font-bold text-ink">OPPAC Analysis</h1>
        <span className="flex gap-1">
          {SYMBOLS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSymbol(s)}
              className={`rounded px-3 py-1 text-xs font-bold transition ${
                symbol === s
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {s}
            </button>
          ))}
        </span>
        <span className="ml-auto flex items-center gap-3">
          <span className="text-[10px] tabular-nums text-slate-400">build {BUILD}</span>
          <SpotMatchDrawer underlying={symbol} expiry={expiry ?? ""} />
        </span>
      </div>

      <div className="mb-3 flex gap-1 border-b border-line" role="tablist" aria-label="View">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "chain"}
          onClick={() => setTab("chain")}
          data-testid="tab-chain"
          className={`flex items-center gap-1.5 rounded-t-lg border border-b-0 px-3 py-1.5 text-xs font-bold transition ${
            tab === "chain" ? "border-line bg-white text-ink" : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <Table2 size={14} /> Option Chain
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "analytics"}
          onClick={() => setTab("analytics")}
          data-testid="tab-analytics"
          className={`flex items-center gap-1.5 rounded-t-lg border border-b-0 px-3 py-1.5 text-xs font-bold transition ${
            tab === "analytics" ? "border-line bg-white text-ink" : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <BarChart3 size={14} /> OI &amp; Volume Analytics
        </button>
      </div>

      {tab === "chain" ? (
        <div className="rounded-xl border border-line bg-white p-3">
          <OptionChainView
            underlying={symbol}
            onExpiryChange={setExpiry}
            chain={chain}
            scraper={scraper}
          />
        </div>
      ) : null}

      {tab === "analytics" && chain ? <OiAnalyticsPanel chain={chain} /> : null}
      {tab === "analytics" && !chain ? (
        <div className="py-12 text-center text-sm text-slate-400">Loading option chain…</div>
      ) : null}

      <WelcomeScreen />
    </div>
  );
}