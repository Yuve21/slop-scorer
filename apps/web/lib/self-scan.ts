import "server-only";

import { buildReport, notAssessed } from "@slop/core";
import type { DetectorResult, Report } from "@slop/core";
import { PlaywrightUnavailableError, RULE_DESCRIPTORS, webDetector } from "@slop/detectors-web";
import { siteUrl } from "./site";
import { toScanView } from "./view";
import type { ScanView } from "./view";

/**
 * The self-scan.
 *
 * This is the same code path the MCP server's `scan_ui` tool runs (`webDetector.analyze`
 * on a URL, then `buildReport`), pointed at our own origin. It is not a fixture and not a
 * cached screenshot, and there is no filter between what the detector returned and what
 * the fold renders. If a deploy regresses a check, the landing page says so, in public.
 *
 * THREE THINGS THIS FILE HAS TO GET RIGHT
 *
 * 1. RECURSION. The scan renders our own page in a real browser. If that render started
 *    another scan we would fork-bomb ourselves. The browser is given a marked user agent
 *    (`SELF_SCAN_UA`); the API route refuses to start a run for a request carrying it, and
 *    the page never starts one during server rendering.
 *
 * 2. SINGLE FLIGHT. Two visitors arriving together must not launch two chromiums. The
 *    in-flight promise is shared, so the second caller waits on the first one's run.
 *
 * 3. HONEST AGE. Every result carries `ranAt` and the UI prints the age rather than
 *    implying permanent freshness. A run costs several seconds of a real browser, so a
 *    short freshness window is a genuine constraint; the page states the number instead of
 *    hiding it, and `force` (the "run it again" control) bypasses the window entirely.
 */

export const SELF_SCAN_UA =
  "Mozilla/5.0 (compatible; SlopScorerSelfScan/0.1; +https://slopscorer.com/method)";

/** How long a completed run may be reused before the next request runs a new one. */
export const FRESHNESS_MS = 60_000;

export interface SelfScan {
  readonly view: ScanView;
  /** True when this call rendered the page rather than reusing the run before it. */
  readonly fresh: boolean;
}

interface Cell {
  value: ScanView | null;
  inFlight: Promise<ScanView> | null;
}

/**
 * Process-level state. It is a freshness window, not a durable cache: a cold process runs
 * a scan, and nothing here is persisted or shared between instances.
 */
const cell: Cell = { value: null, inFlight: null };

const CORPUS_SIZE = RULE_DESCRIPTORS.length;

async function run(target: string): Promise<ScanView> {
  const startedAt = Date.now();
  let report: Report;
  let evaluated: readonly string[] = [];
  try {
    const result: DetectorResult = await webDetector.analyze(
      { kind: "url", url: target },
      {
        options: {
          viewport: { width: 1440, height: 900 },
          userAgent: SELF_SCAN_UA,
          timeoutMs: 45_000,
        },
      },
    );
    evaluated = result.rulesEvaluated;
    report = buildReport([result]);
  } catch (error) {
    if (error instanceof PlaywrightUnavailableError) {
      report = notAssessed(
        "detector_unavailable",
        "Playwright is not installed on this server, so our own page was never rendered. We will not substitute a read of the server HTML for a read of the rendered page. That is the methodological line this product is built on, and breaking it here to keep the landing page looking busy would be the least defensible thing on the site.",
      );
    } else {
      report = notAssessed(
        "detector_unavailable",
        `The scan of our own page did not finish: ${
          error instanceof Error ? error.message : String(error)
        }. We are showing that, rather than the last run that happened to look good.`,
      );
    }
  }
  return toScanView(report, {
    target,
    ranAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    evaluated,
    corpusSize: CORPUS_SIZE,
  });
}

/**
 * The last completed run in this process, if there is one. NEVER starts a run, which is
 * what makes it safe to call while server-rendering the page the scan targets.
 */
export function lastSelfScan(): SelfScan | null {
  return cell.value ? { view: cell.value, fresh: false } : null;
}

export function isStale(view: ScanView | null, now: number = Date.now()): boolean {
  if (!view) return true;
  return now - Date.parse(view.ranAt) > FRESHNESS_MS;
}

/** Run a scan, or reuse one inside the freshness window. Concurrent callers share a run. */
export async function selfScan(options: { readonly force?: boolean } = {}): Promise<SelfScan> {
  const target = siteUrl();
  if (!options.force && cell.value && !isStale(cell.value) && cell.value.target === target) {
    return { view: cell.value, fresh: false };
  }
  if (cell.inFlight) return { view: await cell.inFlight, fresh: true };

  const promise = run(target)
    .then((view) => {
      cell.value = view;
      return view;
    })
    .finally(() => {
      cell.inFlight = null;
    });
  cell.inFlight = promise;
  return { view: await promise, fresh: true };
}
