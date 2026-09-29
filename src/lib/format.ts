export const inr0 = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export const inr2 = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const num2 = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function inr(n: number, digits = 0): string {
  return (digits === 2 ? inr2 : inr0).format(n);
}

export function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${num2.format(n)}%`;
}

export function pnl(n: number, digits = 0): string {
  return `${n >= 0 ? "+" : "−"}${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: digits })}`;
}

export function pnlClass(n: number): string {
  if (n > 0) return "text-up";
  if (n < 0) return "text-down";
  return "text-slate-500";
}

export function isoSafe(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}