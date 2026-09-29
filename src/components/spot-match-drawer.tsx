"use client";

import { useEffect, useState } from "react";
import { Menu, Target, X } from "lucide-react";
import { OptionMomentumPanel } from "./option-momentum-panel";

export function SpotMatchDrawer({ underlying, expiry }: { underlying: string; expiry: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Open Spot Match Validation"
        aria-expanded={open}
        title="Spot Match Validation"
        className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${
          open
            ? "border-brand-300 bg-brand-600 text-white"
            : "border-line bg-white text-ink hover:bg-slate-50"
        }`}
      >
        <Menu size={16} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 animate-[sm-fade_150ms_ease-out] bg-slate-950/30"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Spot Match Validation"
        className={`fixed inset-y-0 right-0 z-50 flex w-[min(420px,92vw)] max-w-[100vw] flex-col overflow-hidden border-l border-line bg-white shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "pointer-events-none translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line bg-white px-3.5 py-2.5">
          <span className="flex items-center gap-1.5 text-[13px] font-extrabold tracking-wide text-ink">
            <Target size={15} className="text-brand-600" />
            SPOT MATCH VALIDATION
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close Spot Match Validation"
            title="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line text-slate-500 transition hover:bg-slate-50 hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <OptionMomentumPanel underlying={underlying} expiry={expiry} hideTitle />
        </div>
      </div>
    </>
  );
}