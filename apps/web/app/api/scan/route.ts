import { NextResponse } from "next/server";
import { capturedSelfScan, lastSelfScan, selfScan, SELF_SCAN_UA } from "@/lib/self-scan";

/**
 * The self-scan endpoint. This is the same code path an arbitrary URL would hit, pointed at
 * our own origin, and it is what the landing page's fold actually calls.
 *
 * GET  returns a reading and NEVER starts a run: the last live run in this process if there
 *      has been one, otherwise the artifact this deployment's build captured, scored by the
 *      shipped corpus. It always answers, and it always says which of the two it is, because
 *      "measured a moment ago" and "measured when this was built" are not the same claim.
 * POST runs a LIVE scan (or reuses one inside the freshness window; `?force=1` bypasses it).
 *      POST because it starts a real browser and does real work, so it is not a safe method
 *      and must not be prefetched by a link, a crawler or a browser's speculative fetch. On a
 *      runtime with no browser it answers with the detector's refusal, which the caller is
 *      expected to print rather than retry: this endpoint has no state that spins.
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
  const result = lastSelfScan() ?? (await capturedSelfScan());
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
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
