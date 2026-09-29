import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = process.env.OPPAC_DATA_DIR ?? join(process.cwd(), "data");
const PID_FILE = join(DATA_DIR, "nse-scraper.pid");
const FLAG_FILE = join(DATA_DIR, "nse-live.flag");
const SCRIPT = join(process.cwd(), "scripts", "nse-scraper.mjs");

function readPid(): number | null {
  try {
    const pid = parseInt(String(readFileSync(PID_FILE, "utf8")).trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getFlag(): "on" | "off" {
  try {
    return String(readFileSync(FLAG_FILE, "utf8")).trim() === "off" ? "off" : "on";
  } catch {
    return "on";
  }
}

function setFlag(v: "on" | "off") {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(FLAG_FILE, v, "utf8");
  } catch {
    /* ignore */
  }
}

export function getScraperStatus() {
  const pid = readPid();
  const running = pid !== null && processAlive(pid);
  const flag = getFlag();
  let lastSnapshotAt: number | null = null;
  try {
    const raw = JSON.parse(readFileSync(join(DATA_DIR, "nse-chain.json"), "utf8"));
    const first = Object.values(raw)[0] as { updatedAt?: number } | undefined;
    lastSnapshotAt = first?.updatedAt ?? null;
  } catch {
    lastSnapshotAt = null;
  }
  return {
    running,
    pid: running ? pid : null,
    flag,
    script: SCRIPT,
    lastSnapshotAt,
    lastSnapshotAgeMs: lastSnapshotAt ? Date.now() - lastSnapshotAt : null,
  };
}

export function startScraper() {
  setFlag("on");
  // Already running?
  const pid = readPid();
  if (pid !== null && processAlive(pid)) {
    return getScraperStatus();
  }
  // Clear stale pid file.
  try {
    if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
  } catch {
    /* ignore */
  }
  try {
    const child = spawn(process.execPath, [SCRIPT], {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  } catch {
    /* ignore */
  }
  return getScraperStatus();
}

export function stopScraper() {
  setFlag("off");
  const pid = readPid();
  if (pid !== null) {
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
      } else {
        process.kill(pid, "SIGTERM");
      }
    } catch {
      /* ignore */
    }
    // A force-kill (taskkill /F) prevents the child's own exit handler from
    // removing its pid file, so clear it here to avoid a stale PID.
    try {
      if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
    } catch {
      /* ignore */
    }
  }
  return getScraperStatus();
}
