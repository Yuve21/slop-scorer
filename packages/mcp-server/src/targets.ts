/**
 * Targets: the two things this server can be pointed at, and the report each one produces.
 *
 * Split out of `server.ts` so the scan tools and the fix tools run the SAME code path against
 * the same arguments. `propose_fixes` and `verify_fix` re-derive a report rather than being
 * handed one, and they must not be able to drift from what `scan_codebase` would have said
 * about the same target. One function each, imported by both.
 *
 * Re-deriving rather than caching the findings is also what makes the loop honest. The engine
 * is a pure function of (observations, corpus), so a second scan of an unchanged target
 * returns the same findings, and a second scan of a CHANGED target returns the truth about
 * the change rather than a memory of the state before it.
 */

import { buildReport, bucketSize, notAssessed, observationFrom } from "@slop/core";
import type { CorpusObservation, DetectorResult, Report, ShapeMarker } from "@slop/core";
import { CODE_CONFIG, CODE_RULES, codeDetector } from "@slop/detectors-code";
import { PlaywrightUnavailableError, WEB_RULES, webDetector } from "@slop/detectors-web";
import { observationSinkFromEnv, recordBestEffort } from "./observations.js";

/**
 * The corpus training loop, stage 1. See `docs/agents/HQ.md`, "Training the corpus".
 *
 * Every scan can produce one candidate observation: what fired, what was evaluated and did NOT
 * fire, the probe denominators, and a coarse shape digest. It is written to a local file and it
 * never leaves the machine. It is OFF unless the user sets SLOP_OBSERVATIONS_DIR themselves.
 *
 * The rule ids are the corpus's own, and passing them in is what lets the leak guard in
 * `@slop/core` tell one of our ids from a string of unknown provenance.
 */
const KNOWN_RULE_IDS: ReadonlySet<string> = new Set([...WEB_RULES.map((r) => r.id), ...CODE_RULES.map((r) => r.id)]);

/**
 * Recording is best-effort and must never change what a scan returns. A caller gets its Report
 * whatever happens here, which is why this returns void and swallows nothing else.
 */
async function observe(results: readonly DetectorResult[], report: Report, shape: CorpusObservation["shape"]): Promise<void> {
  const sink = observationSinkFromEnv(process.env, KNOWN_RULE_IDS);
  if (!sink) return;
  await recordBestEffort(sink, observationFrom({ results, report, shape, knownRuleIds: KNOWN_RULE_IDS, now: new Date() }));
}

/**
 * The shape digest, derived only from what the report already tells us about ITS OWN read.
 *
 * Note what is NOT here: the target path, the URL, the hostname, any file name, any dependency
 * name. The digest is built from probe denominators and coverage, which are counts, and from a
 * closed marker vocabulary. Building it from the artifact directly would put a path one careless
 * line away from the file on disk.
 */
function shapeOf(report: Report, markers: readonly ShapeMarker[]): CorpusObservation["shape"] {
  const scanned = report.coverage.probes.reduce((n, p) => n + (p.denominator ?? 0), 0);
  return { sizeBucket: bucketSize(scanned), extensions: [], markers };
}

export interface CodeTarget {
  readonly path: string;
  readonly include?: readonly string[];
  readonly readHistory?: boolean;
  readonly maxFiles?: number;
}

export interface UiTarget {
  readonly url?: string;
  readonly port?: number;
  readonly viewportWidth?: number;
  readonly viewportHeight?: number;
}

/**
 * Turn a port or a URL into a URL.
 *
 * A bare port is accepted because that is what an agent has during a dev loop, and forcing it
 * to build the URL is friction at exactly the moment the tool is most useful.
 */
export function resolveTarget(input: UiTarget): string {
  if (input.url) {
    return /^https?:\/\//i.test(input.url) ? input.url : `https://${input.url}`;
  }
  if (input.port) return `http://localhost:${input.port}/`;
  throw new Error("This tool needs either a url or a localhost port.");
}

/**
 * The key a baseline is remembered under. Same target, same key, across all four tools.
 *
 * EVERY OPTION THAT CHANGES WHAT GETS READ IS IN THE KEY, and that is a security property
 * rather than a tidiness one. `verify_fix` compares this run's findings to the run held under
 * this key, so any argument that narrows the scan while leaving the key alone is a way to make
 * findings disappear without changing a line of code.
 *
 * `include` was already here. `maxFiles` was NOT: scanning with the default and then verifying
 * with `maxFiles: 1` hit the same key, compared a one-file walk against a whole-repository
 * reading, and reported every finding in the repository as no longer present. `readHistory`
 * has the same shape for the commit-history family.
 */
export const codeTargetKey = (t: CodeTarget): string =>
  [
    "code",
    t.path.replace(/[\\/]+$/, ""),
    (t.include ?? []).join("|"),
    `history=${t.readHistory === false ? "off" : "on"}`,
    `maxFiles=${t.maxFiles ?? "default"}`,
  ].join(":");

export const uiTargetKey = (t: UiTarget): string => `ui:${resolveTarget(t)}`;

export async function codeReport(t: CodeTarget): Promise<Report> {
  const detectorResult = await codeDetector.analyze(
    { kind: "repo", path: t.path },
    {
      options: {
        ...(t.include ? { include: t.include } : {}),
        ...(t.readHistory === undefined ? {} : { readHistory: t.readHistory }),
        ...(t.maxFiles ? { maxFiles: t.maxFiles } : {}),
      },
    },
  );
  const report = buildReport([detectorResult], { config: CODE_CONFIG });
  await observe([detectorResult], report, shapeOf(report, t.readHistory === false ? [] : ["has-git-history"]));
  return report;
}

/** Render and scan a page. Returns `not_assessed` rather than throwing if playwright is absent. */
export async function uiReport(t: UiTarget): Promise<Report> {
  const target = resolveTarget(t);
  try {
    const detectorResult = await webDetector.analyze(
      { kind: "url", url: target },
      { options: { viewport: { width: t.viewportWidth ?? 390, height: t.viewportHeight ?? 844 } } },
    );
    const report = buildReport([detectorResult]);
    await observe([detectorResult], report, shapeOf(report, ["renders-client-side"]));
    return report;
  } catch (error) {
    if (error instanceof PlaywrightUnavailableError) {
      // NOT an error result and NOT a low score. "We could not render it" and "we rendered it
      // and it was clean" produce the same empty finding list and opposite meanings.
      return notAssessed(
        "detector_unavailable",
        "playwright is not installed, so the page was never rendered. This server will not substitute a server-HTML read for a rendered one: a fetch-only read produces confident findings about a document nobody sees. Run `npx playwright install chromium`.",
      );
    }
    throw error;
  }
}
