import { analyzeMomentum } from "@/lib/momentum";
import { isFnoIndex, STRIKE_STEPS } from "@/lib/engine/options";
import { json, error } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const underlying = url.searchParams.get("underlying")?.toUpperCase() ?? "";
  const expiry = url.searchParams.get("expiry");
  if (!underlying) return error("underlying is required");
  try {
    if (!isFnoIndex(underlying) && !(underlying in STRIKE_STEPS)) {
      return error("no option chain for this symbol", 422);
    }
    return json(analyzeMomentum(underlying, expiry));
  } catch (e) {
    return error(e instanceof Error ? e.message : "Momentum analysis unavailable", 502);
  }
}