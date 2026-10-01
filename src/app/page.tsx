"use client";

import { useState } from "react";
import { OptionChainView } from "@/components/option-chain-view";
import { SpotMatchDrawer } from "@/components/spot-match-drawer";
import { WelcomeScreen } from "@/components/welcome-screen";

const SYMBOLS = ["NIFTY", "BANKNIFTY"] as const;

// Bump this whenever you push an update your friends should see land.
const BUILD = "v0.3.0 - 01 Oct 2026";

export default function AnalysisPage() {
  const [symbol, setSymbol] = useState<string>("NIFTY");
  const [expiry, setExpiry] = useState<string | null>(null);

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

      <div className="rounded-xl border border-line bg-white p-3">
        <OptionChainView underlying={symbol} expiry={expiry} onExpiryChange={setExpiry} />
      </div>

      <WelcomeScreen />
    </div>
  );
}