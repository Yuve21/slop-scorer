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
  /**
   * Where the artifact came from, and it is a separate axis from the label on purpose.
   *
   * "real" = a public artifact somebody else made and published, pinned by SHA. "synthetic" =
   * we wrote it. Both can be labelled `generated`, and conflating them would be the quiet
   * dishonesty this repository is built to avoid: a sensitivity floor measured against our own
   * fixture is a statement about our imagination, and a rate measured against a stranger's
   * real build is a statement about the world. The tests below assert different things of
   * each, and neither number is presented as the other.
   */
  readonly origin: "real" | "synthetic";
  readonly source: string;
  /** For generated members: the exact file and words the generator signed itself with. */
  readonly declaration?: string;
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

/** Everything labelled generated, ours and the world's. */
export const CODE_GENERATED_CORPUS: readonly CorpusCase<RepoArtifact>[] = CODE_CORPUS.filter(
  (c) => c.label === "generated",
);

const idsWithOrigin = (origin: "real" | "synthetic"): ReadonlySet<string> =>
  new Set(CODE_CORPUS_INDEX.filter((e) => e.label === "generated" && e.origin === origin).map((e) => e.id));

/**
 * The two synthetic specimens. Without them, a corpus of dead rules would pass the tripwire,
 * so these carry the SENSITIVITY FLOOR and nothing else: they are written by us, they are
 * written to trip things, and no claim about the world is derived from their scores.
 */
export const CODE_SYNTHETIC_CORPUS: readonly CorpusCase<RepoArtifact>[] = CODE_CORPUS.filter((c) =>
  idsWithOrigin("synthetic").has(c.id),
);

/**
 * Four public repositories a generator wrote and signed. These carry the opposite duty: they
 * are what the detector actually meets, so what is pinned about them is their MEASURED
 * behaviour, including the two the engine declines to score.
 */
export const CODE_GENERATED_REAL_CORPUS: readonly CorpusCase<RepoArtifact>[] = CODE_CORPUS.filter((c) =>
  idsWithOrigin("real").has(c.id),
);
