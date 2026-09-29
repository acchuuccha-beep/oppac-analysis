import { getScraperStatus, startScraper, stopScraper } from "@/lib/nse-scraper-control";
import { json, error, parseBody, strField } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return json(getScraperStatus());
}

export async function POST(req: Request) {
  const body = await parseBody(req);
  const action = strField(body.action);
  if (action === "on") {
    return json({ ok: true, ...startScraper() });
  }
  if (action === "off") {
    return json({ ok: true, ...stopScraper() });
  }
  return error("action must be 'on' or 'off'", 400);
}
