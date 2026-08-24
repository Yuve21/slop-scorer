import "server-only";

import { buildReport, notAssessed } from "@slop/core";
import type { AbstentionReason, DetectorResult, Report } from "@slop/core";
import {
  PlaywrightUnavailableError,
  RULE_DESCRIPTORS,
  WEB_DETECTOR_ID,
  webDetector,
} from "@slop/detectors-web";
import capture from "./self-scan-capture.json";
import { siteUrl } from "./site";
import { toScanView } from "./view";
import type { ScanView } from "./view";

/**
 * The self-scan.
 *
 * This is the same code path the MCP server's `scan_ui` tool runs (`webDetector` over the
 * corpus, then `buildReport`), pointed at our own origin. It is not a fixture and not a
 * cached screenshot of a result, and there is no filter between what the detector returned
 * and what the fold renders. If a deploy regresses a check, the landing page says so.
 *
 * WHERE THE BROWSER RUNS, AND WHY IT IS NOT HERE
 *
 * A scan means rendering the page in a real browser. The serverless runtime this app is
 * deployed to has no browser binaries, and the detector refuses (correctly) to substitute a
 * read of the server HTML for a read of the rendered page. For a while the fold asked for a
 * live scan on every visit, got that refusal, and sat in a loading state forever: a headline
 * promising a scan over a spinner that never resolved.
 *
 * So the render happens in the BUILD container, where a browser can be installed, against
 * the deployment that is live at that moment (`scripts/capture-self-scan.mjs`). What ships is
 * the ARTIFACT: every measurement the corpus reads, frozen. Scoring happens here, on the
 * request, because `webDetector` is replayable, so the fold is a stored observation re-scored
 * by the shipped corpus rather than a stored verdict. A corpus change moves the fold on the
 * next deploy with no re-capture.
 *
 * WHAT THE PAGE MUST THEREFORE SAY. The reading is as old as the build and the page prints
 * `capturedAt`, the commit and the target, instead of the "nothing is cached" line this file
 * used to justify. A live scan is still available anywhere a browser exists (local dev, the
 * MCP server, `POST /api/scan?force=1`), and when it runs the fold says so.
 *
 * THE OTHER TWO THINGS THIS FILE HAS TO GET RIGHT
 *
 * 1. RECURSION. The scanning browser carries a marked user agent (`SELF_SCAN_UA`); the API
 *    route refuses to start a run for a request carrying it, and no page render starts one.
 * 2. SINGLE FLIGHT. Two visitors arriving together must not launch two chromiums. The
 *    in-flight promise is shared, so the second caller waits on the first one's run.
 */

export const SELF_SCAN_UA =
  "Mozilla/5.0 (compatible; SlopScorerSelfScan/0.1; +https://slopscorer.com/method)";

/** How long a completed LIVE run may be reused before the next request runs a new one. */
export const FRESHNESS_MS = 60_000;

/** Where the reading in the fold came from. Printed; never inferred by the reader. */
export type ScanOrigin = "build-capture" | "live";

export interface SelfScan {
  readonly view: ScanView;
  readonly origin: ScanOrigin;
  /** The commit the capture was taken at. Null for a live run, which needs no provenance. */
  readonly commit: string | null;
  /** True when this call rendered the page rather than reusing an earlier reading. */
  readonly fresh: boolean;
}

interface Cell {
  value: ScanView | null;
  inFlight: Promise<ScanView> | null;
}

/**
 * Process-level state for LIVE runs. A freshness window, not a durable cache: a cold process
 * runs a scan, and nothing here is persisted or shared between instances.
 */
const cell: Cell = { value: null, inFlight: null };

const CORPUS_SIZE = RULE_DESCRIPTORS.length;

/** The record `scripts/capture-self-scan.mjs` writes. Its failure case is a first-class field. */
interface CaptureRecord {
  readonly schema: number;
  readonly capturedAt: string;
  readonly commit: string | null;
  readonly target: string | null;
  readonly elapsedMs: number;
  readonly artifact: unknown;
  readonly unavailable: { readonly code: string; readonly detail: string } | null;
}

const record = capture as CaptureRecord;

/**
 * The host to print for a reading. A capture that failed can carry a target nobody could
 * fetch, and `new URL` on it would throw while rendering the landing page: a broken self-scan
 * must degrade to a sentence, never to a 500.
 */
export function scanHost(target: string): string {
  try {
    return new URL(target).host;
  } catch {
    return target || "this deployment";
  }
}

/**
 * The capture script may only report two kinds of failure, and `notAssessed` only accepts a
 * subset of the codes anyway. Anything else is narrowed to `detector_unavailable` here rather
 * than cast, so a new code in the script cannot smuggle an unhandled state into the fold.
 */
type NotAssessedCode = Extract<AbstentionReason["code"], "detector_unavailable" | "cannot_fetch">;
const abstentionCode = (code: string): NotAssessedCode =>
  code === "cannot_fetch" ? "cannot_fetch" : "detector_unavailable";

async function scoreCapture(): Promise<SelfScan> {
  const target = record.target ?? siteUrl();
  let report: Report;
  let evaluated: readonly string[] = [];

  if (record.artifact) {
    try {
      const result = await webDetector.analyze({
        kind: "artifact",
        detectorId: WEB_DETECTOR_ID,
        artifact: record.artifact,
      });
      evaluated = result.rulesEvaluated;
      report = buildReport([result]);
    } catch (error) {
      // A capture this build cannot score is a defect in us, and it is reported as one
      // rather than swallowed into an empty card.
      report = notAssessed(
        "detector_unavailable",
        `This build shipped a capture of ${target} that it could not score: ${
          error instanceof Error ? error.message : String(error)
        }. The capture and the corpus that reads it are out of step, which is our bug, not a reading of the page.`,
      );
    }
  } else {
    report = notAssessed(
      abstentionCode(record.unavailable?.code ?? "detector_unavailable"),
      record.unavailable?.detail ??
        "This build did not record a render of our own page, so there is nothing here to report. We would rather show you that than the last run that happened to look good.",
    );
  }

  return {
    view: toScanView(report, {
      target,
      ranAt: record.capturedAt,
      elapsedMs: record.elapsedMs,
      evaluated,
      corpusSize: CORPUS_SIZE,
    }),
    origin: "build-capture",
    commit: record.commit,
    fresh: false,
  };
}

/**
 * The reading the fold renders on the server: always complete, always terminal, and never a
 * spinner. Memoised per process because scoring a stored artifact is pure.
 */
let captured: Promise<SelfScan> | null = null;
export function capturedSelfScan(): Promise<SelfScan> {
  captured ??= scoreCapture();
  return captured;
}

async function runLive(target: string): Promise<ScanView> {
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
        "There is no browser on this server, so no live render happened just now. We will not substitute a read of the server HTML for a read of the rendered page: that is the methodological line this product is built on. The reading in the fold is the one this deployment's build took, and it says when.",
      );
    } else {
      report = notAssessed(
        "detector_unavailable",
        `The live scan of our own page did not finish: ${
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
 * The last completed LIVE run in this process, if there is one. NEVER starts a run, which is
 * what makes it safe to call while server-rendering the page the scan targets.
 */
export function lastSelfScan(): SelfScan | null {
  return cell.value ? { view: cell.value, origin: "live", commit: null, fresh: false } : null;
}

export function isStale(view: ScanView | null, now: number = Date.now()): boolean {
  if (!view) return true;
  return now - Date.parse(view.ranAt) > FRESHNESS_MS;
}

/**
 * Run a LIVE scan, or reuse one inside the freshness window. Concurrent callers share a run.
 * On a runtime with no browser this returns an abstention, which the fold prints as one.
 */
export async function selfScan(options: { readonly force?: boolean } = {}): Promise<SelfScan> {
  const target = siteUrl();
  if (!options.force && cell.value && !isStale(cell.value) && cell.value.target === target) {
    return { view: cell.value, origin: "live", commit: null, fresh: false };
  }
  if (cell.inFlight) return { view: await cell.inFlight, origin: "live", commit: null, fresh: true };

  const promise = runLive(target)
    .then((view) => {
      cell.value = view;
      return view;
    })
    .finally(() => {
      cell.inFlight = null;
    });
  cell.inFlight = promise;
  return { view: await promise, origin: "live", commit: null, fresh: true };
}
