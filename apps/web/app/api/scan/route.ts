import { NextResponse } from "next/server";
import { lastSelfScan, selfScan, SELF_SCAN_UA } from "@/lib/self-scan";

/**
 * The self-scan endpoint. This is the same code path an arbitrary URL would hit, pointed at
 * our own origin, and it is what the landing page's fold actually calls.
 *
 * GET  returns the last completed run in this process, and NEVER starts one. Cheap, safe to
 *      call from anywhere, returns 204 when this process has not run a scan yet.
 * POST runs a scan (or reuses one inside the freshness window; `?force=1` bypasses it).
 *      POST because it starts a real browser and does real work, so it is not a safe method
 *      and must not be prefetched by a link, a crawler or a browser's speculative fetch.
 *
 * THE RECURSION GUARD IS THE IMPORTANT PART OF THIS FILE. A scan renders our own page in a
 * real browser. If that render could start another scan, one visitor would fork-bomb the
 * server. The scanning browser carries a marked user agent and this route refuses it.
 */

export const dynamic = "force-dynamic";
// A real browser render is measured in seconds, not milliseconds.
export const maxDuration = 60;

const isSelfScanner = (request: Request): boolean =>
  (request.headers.get("user-agent") ?? "").includes("SlopScorerSelfScan");

export async function GET() {
  const last = lastSelfScan();
  if (!last) return new NextResponse(null, { status: 204 });
  return NextResponse.json(last, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (isSelfScanner(request)) {
    return NextResponse.json(
      {
        refused: "self_scan_recursion",
        detail: `This request carries the self-scan user agent (${SELF_SCAN_UA}), which means it came from our own scanning browser. Starting a scan here would scan the page that is scanning us.`,
      },
      { status: 409 },
    );
  }
  const force = new URL(request.url).searchParams.get("force") === "1";
  const result = await selfScan({ force });
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
