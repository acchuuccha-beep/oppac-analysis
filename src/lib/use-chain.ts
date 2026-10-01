"use client";

import { useEffect, useState } from "react";

export interface ChainStrikeRow {
  strike: number;
  ce: { ltp: number; oi: number; change_oi: number; volume: number };
  pe: { ltp: number; oi: number; change_oi: number; volume: number };
}

export interface Chain {
  underlying: string;
  spot: number;
  expiry: string;
  expiries: string[];
  step: number;
  rows: ChainStrikeRow[];
  synthetic?: boolean;
  source?: string;
  live?: boolean;
  delayed?: boolean;
  updatedAt?: number | null;
}

export interface ScraperStatus {
  running: boolean;
  pid: number | null;
  flag: "on" | "off";
  lastSnapshotAgeMs: number | null;
  lastSnapshotAt: number | null;
}

// Single source of truth for the chain payload: the table and the analytics
// dashboard both render from this, so they can never disagree.
export function useChain(underlying: string, expiry: string | null) {
  const [chain, setChain] = useState<Chain | null>(null);
  const [scraper, setScraper] = useState<ScraperStatus | null>(null);

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

  return { chain, scraper };
}