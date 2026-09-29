# OPPAC Analysis

Standalone NIFTY / BANKNIFTY **Option Chain + Spot Match** board, extracted from
the OPPAC paper-trading app. No accounts, no orders, no AI chat — just the two
side-by-side panels and the NSE live-loop toggle.

## Run (Windows)

- **Get the code (first time):** `git clone https://github.com/acchuuccha-beep/oppac-analysis.git` then `cd oppac-analysis`
- **Run:** double-click `start.bat` (first run installs deps + builds), then open:
  - This laptop: http://localhost:3001
  - Phone on same Wi-Fi: http://\<your-ip\>:3001
- **Update:** when you're told a new version is ready, double-click `update.bat` (pulls the latest code, reinstalls/rebuilds if needed, restarts the app). Owner pushes updates with `push.bat`.
- **Stop:** double-click `stop.bat` to stop the server (port 3001) and the NSE scraper.

## What it does

- **Left panel** — option chain table (CE/PE OI + LTP, ATM row highlighted,
  expiry switcher) with the **NSE loop: ON/OFF** toggle. The loop is a headless
  Chrome scraper (`scripts/nse-scraper.mjs`) that polls nseindia.com every 5s
  and writes `data/nse-chain.json`. When the loop is off you still see the last
  real NSE snapshot (up to 24h old) or, with no snapshot at all, a synthetic
  Black-Scholes chain driven by the live Yahoo spot (`^NSEI` / `^NSEBANK`).
- **Right panel** — **Spot Match %**: how much each strike's premium tracked the
  index move, computed from a rolling ~60s sample buffer. Shows
  "Warming up (n/12)" until enough samples exist.

NIFTY / BANKNIFTY switch is the toggle at the top of the page.

## Notes

- **Do not run this and the main OPPAC app's NSE loop at the same time** —
  that would be two Chrome sessions hammering nseindia.com every 5 seconds.
- All runtime state lives in `./data/` (`nse-chain.json`, `nse-live.flag`,
  `nse-scraper.pid`, `nse-scraper.log`). Delete the folder any time; it is
  rebuilt on demand. `data/` is git-ignored.
- Set `OPPAC_DATA_DIR` to relocate the data directory (advanced).
- Requires Node.js and Chrome or Edge (the scraper tries Chrome, falls back to
  Edge). Yahoo Finance is only needed for the synthetic fallback and spot.

## Develop

```
npm install
npm run dev      # http://localhost:3001
npm run lint
npm run build
```
