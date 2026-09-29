import { getOptionChain } from "@/lib/market";
import { json, error } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const underlying = url.searchParams.get("underlying")?.toUpperCase();
  const expiry = url.searchParams.get("expiry");
  if (!underlying) return error("underlying is required");
  try {
    return json(await getOptionChain(underlying, expiry));
  } catch (e) {
    return error(e instanceof Error ? e.message : "Option chain unavailable", 502);
  }
}