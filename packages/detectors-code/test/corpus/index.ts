/**
 * The code corpus loader.
 *
 * Membership is read from `code-corpus.index.json`, which the capture script writes, so this
 * module cannot disagree with what is on disk. A list restated in a second place goes stale
 * in exactly one of them.
 *
 * The artifacts are stored as JSON rather than compiled into a TypeScript literal for two
 * reasons: they are the detector's own replay format, byte-for-byte what `scanRepo` produced,
 * and `npm run backtest` reads the same files from plain Node without a TypeScript step. One
 * corpus, two readers, no second copy.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CorpusCase } from "@slop/core";
import { asRepoArtifact } from "@slop/detectors-code";
import type { RepoArtifact } from "@slop/detectors-code";

export interface CodeCorpusEntry {
  readonly id: string;
  readonly label: "human" | "generated";
  readonly source: string;
  readonly provenance: string;
  readonly sha: string | null;
  readonly include: readonly string[];
  readonly capturedAt: string;
}

const here = (name: string): string => fileURLToPath(new URL(name, import.meta.url));

export const CODE_CORPUS_INDEX: readonly CodeCorpusEntry[] = JSON.parse(
  readFileSync(here("./code-corpus.index.json"), "utf8"),
) as CodeCorpusEntry[];

const load = (entry: CodeCorpusEntry): CorpusCase<RepoArtifact> => ({
  id: entry.id,
  label: entry.label,
  source: entry.source,
  provenance: entry.provenance,
  capturedAt: entry.capturedAt,
  // Through the real replay guard, so a schema drift fails here rather than scoring an
  // artifact whose missing fields read as absent tells.
  artifact: asRepoArtifact(JSON.parse(readFileSync(here(`./${entry.id}.artifact.json`), "utf8"))),
});

/** Every member, human and generated, in manifest order. */
export const CODE_CORPUS: readonly CorpusCase<RepoArtifact>[] = CODE_CORPUS_INDEX.map(load);

/** The ten repositories a person wrote. The tripwire asserts against these. */
export const CODE_NEGATIVE_CORPUS: readonly CorpusCase<RepoArtifact>[] = CODE_CORPUS.filter(
  (c) => c.label === "human",
);

/** The synthetic scaffold. Without it, a corpus of dead rules would pass the tripwire. */
export const CODE_GENERATED_CORPUS: readonly CorpusCase<RepoArtifact>[] = CODE_CORPUS.filter(
  (c) => c.label === "generated",
);
