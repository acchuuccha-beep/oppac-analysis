"use client";

import { useCallback, useSyncExternalStore } from "react";

const STEPS = [
  {
    title: "Start it",
    body: "Double-click start.bat. It installs what it needs, builds, and opens this page automatically.",
  },
  {
    title: "Keep it fresh",
    body: "Double-click update.bat any time. It pulls the newest code from GitHub and restarts the app for you.",
  },
  {
    title: "Turn it off",
    body: "Double-click stop.bat to stop the server and the live NSE scraper.",
  },
];

const CHANGE_EVENT = "oppac-welcome-dismissed";

export function WelcomeBanner({ build }: { build: string }) {
  const key = `oppac-welcome-${build}`;

  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener("storage", onChange);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  }, []);

  const getSnapshot = useCallback(
    () => window.localStorage.getItem(key) === "1",
    [key],
  );
  const getServerSnapshot = useCallback(() => false, []);

  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const dismiss = () => {
    window.localStorage.setItem(key, "1");
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  if (dismissed) return null;

  return (
    <section className="mb-3 rounded-xl border border-brand-200 bg-brand-50/60 p-4">
      <div className="mb-2 flex items-start gap-2">
        <div>
          <h2 className="text-sm font-bold text-ink">Welcome to OPPAC Analysis</h2>
          <p className="text-xs text-slate-500">
            Option chain + Spot Match for NIFTY / BANKNIFTY. Data is pulled live from NSE.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">
            {build}
          </span>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full border border-line bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500 transition hover:bg-slate-100"
          >
            Got it
          </button>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.title} className="rounded-lg border border-line bg-white p-3">
            <div className="text-xs font-bold text-ink">{s.title}</div>
            <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{s.body}</div>
          </div>
        ))}
      </div>
    </section>
  );
}