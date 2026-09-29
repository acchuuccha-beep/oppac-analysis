import { NextResponse } from "next/server";

export function json(data: unknown, status = 200, headers?: Record<string, string>): NextResponse {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

export function error(message: string, status = 400): NextResponse {
  return json({ message, code: status }, status);
}

export function numField(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(String(v));
  return isFinite(n) ? n : undefined;
}

export function strField(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

export function parseBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  return req.json().catch(() => ({} as T));
}

export function intQuery(search: URLSearchParams, key: string, def: number): number {
  const n = Number(search.get(key));
  return isFinite(n) ? n : def;
}