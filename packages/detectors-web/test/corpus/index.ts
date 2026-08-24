/**
 * The GENERATED web corpus loader.
 *
 * The counterpart to `packages/detectors-code/test/corpus/index.ts`, and it exists for the
 * reason `src/fixtures/negatives.ts` states in its own header: the five human pages are
 * hand-transcribed from a measured audit and there was deliberately no generated set, because
 * "a synthetic positive set written by us would measure our imagination rather than any
 * generator". These four are the other side of that, and none of them was written here. Each
 * one is a live public page whose own markup names the tool that built it, read out of a real
 * browser by `probeUrl` and frozen to disk by `scripts/capture-web-corpus.mjs`.
 *
 * WHY THE ARTIFACTS ARE ON DISK RATHER THAN IN A TYPESCRIPT LITERAL. Same two reasons as the
 * code corpus: the JSON is the detector's own replay format, byte-for-byte what the probe
 * produced, and `npm run backtest` reads the same files from plain Node with no TypeScript
 * step. One corpus, two readers, no second copy.
 *
 * WHY THE TEST SUITE NEVER TOUCHES THE NETWORK. A test that fetches a stranger's site is a
 * test that fails when they redeploy, and worse, a published rate that changes when they do.
 * The capture is pinned by `capturedAt` and replayed; re-capturing is an explicit command with
 * a reviewable diff.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CorpusCase } from "@slop/core";
import { asWebArtifact } from "@slop/detectors-web";
import type { WebArtifact } from "@slop/detectors-web";

export interface WebCorpusEntry {
  readonly id: string;
  readonly label: "generated";
  /** "real" = somebody else published it. There is no synthetic member in this file. */
  readonly origin: "real";
  readonly source: string;
  /** The exact self-declaration the label rests on, so it is checkable without reading prose. */
  readonly declaration: string;
  readonly provenance: string;
  readonly capturedAt: string;
}

const here = (name: string): string => fileURLToPath(new URL(name, import.meta.url));

export const WEB_GENERATED_INDEX: readonly WebCorpusEntry[] = JSON.parse(
  readFileSync(here("./web-corpus.index.json"), "utf8"),
) as WebCorpusEntry[];

const load = (entry: WebCorpusEntry): CorpusCase<WebArtifact> => ({
  id: entry.id,
  label: entry.label,
  source: entry.source,
  provenance: entry.provenance,
  capturedAt: entry.capturedAt,
  // Through the real replay guard, so a schema drift fails here rather than scoring a page
  // whose missing fields read as absent tells.
  artifact: asWebArtifact(JSON.parse(readFileSync(here(`./${entry.id}.artifact.json`), "utf8"))),
});

/** Four pages a generator made, and that say so in their own markup. */
export const WEB_GENERATED_CORPUS: readonly CorpusCase<WebArtifact>[] = WEB_GENERATED_INDEX.map(load);
