"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

const SEEN_KEY = "oppac_welcome_seen";
const CHANGE_EVENT = "oppac-welcome-seen-changed";

const LINES = ["READ THE MARKET.", "UNDERSTAND THE FLOW.", "ANALYZE THE POSITIONING."];

const TYPE_MS = 40;
const LINE_HOLD_MS = 420;
const START_DELAY_MS = 400;
const RETURNING_MS = 1000;
const FADE_MS = 450;

const STRIKES = [22600, 22550, 22500, 22450, 22400, 22350, 22300, 22250];
const TICKS = ["+148.25", "-92.60", "+61.40", "-37.85", "+12.05", "-58.30", "+84.15", "-14.70"];

const TOTAL_CHARS = LINES.reduce((n, l) => n + l.length, 0);

function subscribeSeen(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function getSeenSnapshot() {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function WelcomeScreen() {
  const seen = useSyncExternalStore(subscribeSeen, getSeenSnapshot, () => false);

  const [reduced, setReduced] = useState(false);
  const [typed, setTyped] = useState(0);
  const [enterReady, setEnterReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const leavingRef = useRef(false);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    setMounted(true);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const markSeen = useCallback(() => {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* storage unavailable */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const finish = useCallback(() => {
    setLeaving(true);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setMounted(false), FADE_MS);
  }, []);

  const enter = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    markSeen();
    finish();
  }, [finish, markSeen]);

  const skip = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    markSeen();
    setTyped(TOTAL_CHARS);
    setEnterReady(true);
    finish();
  }, [finish, markSeen]);

  useEffect(() => {
    if (!mounted || leavingRef.current) return;

    if (reduced || seen) {
      setTyped(TOTAL_CHARS);
      setEnterReady(true);
      const t = window.setTimeout(() => {
        if (!leavingRef.current) {
          leavingRef.current = true;
          markSeen();
          finish();
        }
      }, reduced ? 0 : RETURNING_MS);
      return () => window.clearTimeout(t);
    }

    // Index of the character that ends each line (excluding the last), so the
    // reveal can dwell on a line boundary without stacking nested timers.
    const boundaries = LINES.slice(0, -1).reduce<Set<number>>((set, line, i) => {
      const prior = LINES.slice(0, i).reduce((n, l) => n + l.length, 0);
      set.add(prior + line.length);
      return set;
    }, new Set());

    let count = 0;
    let timer = 0;

    timer = window.setTimeout(function reveal() {
      count += 1;
      setTyped(count);
      if (count >= TOTAL_CHARS) {
        setEnterReady(true);
        return;
      }
      timer = window.setTimeout(reveal, boundaries.has(count) ? LINE_HOLD_MS : TYPE_MS);
    }, START_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [mounted, reduced, seen, finish, markSeen]);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        enter();
      } else if (e.key === "Escape") {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, enter, skip]);

  const rendered = useMemo(() => {
    let consumed = 0;
    return LINES.map((line) => {
      const start = consumed;
      consumed += line.length;
      const visible = Math.max(0, Math.min(line.length, typed - start));
      return {
        line,
        visible,
        complete: typed >= consumed,
        started: visible > 0,
      };
    });
  }, [typed]);

  const allDone = typed >= TOTAL_CHARS;

  if (!mounted) return null;

  return (
    <div
      data-testid="welcome-screen"
      data-leaving={leaving ? "1" : "0"}
      className={`fixed inset-0 z-[60] overflow-hidden bg-white transition-opacity duration-500 ${
        leaving ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="welcome-grid absolute inset-0" />
        <div className="absolute inset-x-0 bottom-[18%] flex h-[34vh] items-end justify-center gap-1.5 px-6 opacity-[0.14]">
          {STRIKES.map((s, i) => (
            <div key={`${s}-${i}`} className="flex w-8 shrink-0 flex-col items-center gap-1 sm:w-12">
              <div
                className="w-full rounded-[1px] bg-brand-600"
                style={{ height: `${20 + ((i * 37) % 30)}%` }}
              />
              <div className="h-px w-full bg-ink/50" />
              <span className="tabular text-[9px] text-slate-500">{s}</span>
            </div>
          ))}
        </div>
        <div className="absolute inset-0">
          {TICKS.map((t, i) => (
            <span
              key={t}
              className="tabular absolute text-[10px] text-slate-500"
              style={{
                left: `${5 + i * 12}%`,
                top: `${12 + ((i * 53) % 66)}%`,
                opacity: 0.45,
              }}
            >
              {t}
            </span>
          ))}
        </div>
        <div className="absolute inset-0">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="absolute h-1 w-1 rounded-full bg-brand-500"
              style={{
                left: `${10 + i * 19}%`,
                top: `${18 + ((i * 41) % 58)}%`,
                opacity: 0.3,
                animation: `sm-drift ${9 + i * 2}s ease-in-out ${i * 0.7}s infinite alternate`,
              }}
            />
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-white/80 via-white/50 to-white" />
      </div>

      <div className="relative flex h-full flex-col items-center justify-center overflow-y-auto px-5 py-16 text-center">
        <div className="w-full max-w-[720px]">
          {rendered.map((l, idx) => {
            if (!l.started && !l.complete) return null;
            return (
              <div
                key={l.line}
                data-testid="welcome-line"
                className="mb-1.5 flex min-h-[1.5rem] items-baseline justify-center gap-0.5"
              >
                {l.line.slice(0, l.visible).split("").map((ch, i) => (
                  <span
                    key={`${idx}-${i}`}
                    className={`tabular sm-anim inline-block text-[13px] font-bold tracking-[0.16em] text-slate-500 sm:text-[15px] ${
                      ch === "." ? "text-brand-600" : ""
                    }`}
                    style={{ animationDelay: `${Math.min(i * 6, 100)}ms` }}
                  >
                    {ch === " " ? "\u00A0" : ch}
                  </span>
                ))}
                {l.complete && (
                  <span className="sm-caret ml-1 inline-block h-3.5 w-[2px] bg-brand-500 align-middle" />
                )}
              </div>
            );
          })}
        </div>

        <div
          className={`sm-anim mt-7 transition-all duration-700 ${
            allDone ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
          }`}
        >
          <h1 className="text-4xl font-black tracking-[0.3em] text-ink sm:text-5xl">OPPAC</h1>
          <p className="mt-2 text-[10px] font-semibold tracking-[0.2em] text-brand-700 sm:text-xs">
            OPTIONAL POSITION &amp; PRICE ANALYSIS
          </p>
          <p className="mt-5 text-[11px] font-semibold tracking-[0.14em] text-slate-500 sm:text-sm">
            OPTION CHAIN • MARKET STRUCTURE • POSITIONING
          </p>
          <p className="mt-1.5 text-[11px] italic tracking-wide text-slate-400 sm:text-xs">
            MARKET INTELLIGENCE, IN ONE VIEW.
          </p>

          <div
            className={`mt-8 transition-all duration-500 ${
              enterReady ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
            }`}
          >
            <button
              type="button"
              data-testid="welcome-enter"
              onClick={enter}
              className="sm-glow rounded-full bg-brand-600 px-7 py-3 text-xs font-bold tracking-[0.2em] text-white transition hover:scale-105 hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 sm:px-8 sm:text-sm"
            >
              ENTER OPPAC →
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        data-testid="welcome-skip"
        onClick={skip}
        className="absolute bottom-4 right-4 rounded-full border border-line bg-white/85 px-3 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:scale-105 hover:border-brand-300 hover:text-brand-700 sm:bottom-6 sm:right-6"
      >
        Skip →
      </button>
    </div>
  );
}