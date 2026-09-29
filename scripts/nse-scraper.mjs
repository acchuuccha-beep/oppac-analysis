/**
 * Standalone NSE option-chain scraper.
 * Runs as a separate background process (started by start.bat) so the playwright
 * browser never lives inside the Next.js server process, which would terminate it.
 *
 * Polls NSE every 5s and writes a fresh chain snapshot to:
 *   <data dir>/nse-chain.json
 * The Next.js app (src/lib/market/nse-live.ts) reads that file.
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.OPPAC_DATA_DIR ?? join(ROOT, "data");
const OUT = join(dataDir, "nse-chain.json");
const PID_FILE = join(dataDir, "nse-scraper.pid");
const NSE_INDEXES = ["NIFTY", "BANKNIFTY"];
const POLL_MS = 5000;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseNseDate(d) {
  const p = String(d).split("-");
  if (p.length !== 3) return "";
  const dd = p[0].trim().padStart(2, "0");
  const mm = String(MONTHS.indexOf(p[1]) + 1).padStart(2, "0");
  const yyyy = p[2].trim();
  if (mm === "00" || !dd || !yyyy) return "";
  return `${yyyy}-${mm}-${dd}`;
}

function toNseDate(iso) {
  const p = iso.split("-");
  if (p.length !== 3) return "";
  const mm = MONTHS[parseInt(p[1], 10) - 1];
  if (!mm) return "";
  return `${p[2].padStart(2, "0")}-${mm}-${p[0]}`;
}

async function fetchJson(page, url) {
  return page.evaluate(async (u) => {
    const res = await fetch(u, {
      headers: { Accept: "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest" },
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Non-JSON response");
    }
  }, url);
}

async function pollSymbol(page, symbol) {
  try {
    const contract = await fetchJson(page, `https://www.nseindia.com/api/option-chain-contract-info?symbol=${symbol}`);
    const isoExpiries = Array.isArray(contract?.expiryDates) ? contract.expiryDates.map(parseNseDate).filter(Boolean) : [];
    if (isoExpiries.length === 0) return null;

    const rowsByIso = {};
    let spot = 0;

    for (const iso of isoExpiries.slice(0, 3)) {
      const url = `https://www.nseindia.com/api/option-chain-v3?type=Indices&symbol=${symbol}&expiry=${toNseDate(iso)}`;
      const data = await fetchJson(page, url);
      const records = data?.records;
      if (!records?.data) continue;

      spot = records.underlyingValue ?? spot;
      const strikeMap = rowsByIso[iso] ?? {};
      for (const row of records.data) {
        const strike = Number(row.strikePrice);
        if (!Number.isFinite(strike)) continue;
        const pick = (o) =>
          o
            ? {
                ltp: o.lastPrice ?? 0,
                bid: o.buyPrice1 ?? o.bidprice ?? null,
                ask: o.sellPrice1 ?? o.askprice ?? o.askPrice ?? null,
                iv: o.impliedVolatility ?? 0,
                oi: o.openInterest ?? 0,
                change_oi: o.changeinOpenInterest ?? 0,
                volume: o.totalTradedVolume ?? 0,
                has: true,
              }
            : null;
        strikeMap[strike] = { ce: pick(row.CE), pe: pick(row.PE) };
      }
      rowsByIso[iso] = strikeMap;
    }

    if (Object.keys(rowsByIso).length === 0) return null;
    return { symbol, spot, isoExpiries, rowsByIso, updatedAt: Date.now() };
  } catch (e) {
    console.error(`[nse-scraper] poll ${symbol} failed:`, e.message);
    return null;
  }
}

async function pollAll(page) {
  const snapshots = {};
  for (const symbol of NSE_INDEXES) {
    const snap = await pollSymbol(page, symbol);
    if (snap) snapshots[symbol] = snap;
  }
  if (Object.keys(snapshots).length > 0) {
    try {
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(OUT, JSON.stringify(snapshots));
      console.log(`[nse-scraper] wrote ${Object.keys(snapshots).length} chains -> ${OUT}`);
    } catch (e) {
      console.error(`[nse-scraper] write failed:`, e.message);
    }
  }
}

async function main() {
  console.log(`[nse-scraper] starting, OUT=${OUT}`);
  try {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(PID_FILE, String(process.pid));
  } catch (e) {
    console.error("[nse-scraper] could not write pid file:", e.message);
  }
  const cleanup = () => {
    try {
      if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
    } catch {}
  };
  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
  } catch (e) {
    console.error("[nse-scraper] could not launch Chrome, trying Edge:", e.message);
    browser = await chromium.launch({ channel: "msedge", headless: true });
  }
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();
  await page.goto("https://www.nseindia.com/option-chain", { waitUntil: "domcontentloaded", timeout: 40000 });
  console.log("[nse-scraper] loaded option-chain, page title:", await page.title().catch(() => "?"));
  await new Promise((r) => setTimeout(r, 5000));

  await pollAll(page);
  setInterval(() => pollAll(page), POLL_MS);

  process.on("SIGINT", async () => {
    try {
      await browser.close();
    } catch {}
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    try {
      await browser.close();
    } catch {}
    cleanup();
    process.exit(0);
  });
  process.on("exit", cleanup);
}

main().catch((e) => {
  console.error("[nse-scraper] FATAL", e);
  process.exit(1);
});
