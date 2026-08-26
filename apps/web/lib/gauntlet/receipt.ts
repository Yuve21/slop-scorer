import "server-only";

import type { Report } from "@slop/core";
import CORPUS from "@/lib/corpus.json";
import type { Reproduction } from "@/lib/reproduction";
import { toScanView } from "@/lib/view";
import type { ScanView } from "@/lib/view";
import { poolEntry } from "./store";

/**
 * A real receipt for one corpus artifact.
 *
 * The reveal at the end of a round says what our detector made of each card; this is the
 * whole reading behind that sentence, rendered through the same `ReceiptView` a sample
 * receipt uses, off the same `toScanView` projection. Nothing here re-scores anything: the
 * report was produced by `scripts/build-gauntlet-pool.mjs` running the shipped detector over
 * the frozen artifact, and `elapsedMs` is the measured duration of that run.
 *
 * THESE PAGES ARE `noindex`, and that is a legal call rather than an SEO one. Most of this
 * corpus is somebody else's public work, pinned by SHA or by capture date. Our own research
 * says a report about a stranger's artifact should not be indexed by default, and the sitemap
 * enumerates only artifacts that are ours. A reader who has just answered a round can read
 * every one of these; a search engine is not invited to publish them.
 */

export interface GauntletReceipt {
  readonly id: string;
  readonly artifactId: string;
  readonly artifact: string;
  readonly headline: string;
  readonly claim: string;
  readonly view: ScanView;
  readonly reproduction: Reproduction;
}

/**
 * Rule membership, from the generated manifest rather than from the detector packages.
 *
 * Importing `@slop/detectors-code` here to count its rules pulls its repository SCANNER into the
 * web bundle, and the scanner reads files off a path it computes at runtime, which makes the
 * bundler trace the whole project into the serverless output. `lib/corpus.json` is the same two
 * lists with none of that, and `test/corpus-manifest.test.ts` re-derives it from the packages so
 * it cannot drift.
 */
const corpora = CORPUS as unknown as Record<string, { readonly corpusVersion: string; readonly ruleIds: readonly string[] }>;

const RULE_IDS: Record<string, readonly string[]> = {
  code: corpora.code?.ruleIds ?? [],
  web: corpora.web?.ruleIds ?? [],
};

const CORPUS_SIZE: Record<string, number> = {
  code: RULE_IDS.code!.length,
  web: RULE_IDS.web!.length,
};

/**
 * The headline, chosen by the report's own status.
 *
 * A receipt's largest object is a measured duration when there is one to state. Here the only
 * honest duration is how long OUR detector took, so that is what it says — and on an
 * abstaining report the headline is the abstention, because animating or enlarging a number
 * that was withheld would be the opposite of the point.
 */
function headlineFor(report: Report, elapsedMs: number): string {
  if (report.status !== "assessed") return "We did not score this one.";
  return `${elapsedMs.toFixed(1)} milliseconds`;
}

export function gauntletReceipt(corpus: string, name: string): GauntletReceipt | null {
  const artifactId = `${corpus}:${name}`;
  const entry = poolEntry(artifactId);
  if (entry === null) return null;
  const evaluated = RULE_IDS[corpus] ?? [];
  const report = entry.report;

  return {
    id: artifactId,
    artifactId,
    artifact:
      `a ${corpus === "code" ? "repository" : "page"} in our published corpus, labelled ` +
      `${entry.label} on this basis: ${entry.provenance}`,
    headline: headlineFor(report, entry.elapsedMs),
    claim:
      report.status === "assessed"
        ? `That is how long this detector took to read the frozen capture of ${entry.source} and produce every line below. ` +
          `The label on this artifact is not our conclusion: it is a stated fact about where the artifact came from, and the detector was never told it.`
        : `This detector could not assess the frozen capture of ${entry.source}, and it withholds the score rather than reporting a low one. ` +
          `The label on this artifact is a stated fact about where it came from, not a conclusion this reading reached.`,
    view: toScanView(report, {
      target: `frozen corpus capture ${artifactId}, taken ${entry.captureDate}`,
      ranAt: report.generatedAt,
      elapsedMs: entry.elapsedMs,
      evaluated,
      corpusSize: CORPUS_SIZE[corpus] ?? evaluated.length,
    }),
    reproduction: {
      state: "not_configured",
      modality: corpus === "code" ? "repository" : "web page",
      reason:
        "No reproduction pipeline is wired for corpus artifacts in this build, and we would not run " +
        "one over somebody else's work to make a point on our own site.",
    },
  };
}
