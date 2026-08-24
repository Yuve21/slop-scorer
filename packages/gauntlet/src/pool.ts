/**
 * Loading the pool from the corpora that already exist.
 *
 * `CONTRIBUTING.md` in this repository says adding a negative is a bigger contribution than adding
 * a rule, and states the bar: named authorship, substantial pre-2022 history, an institution behind
 * it. Those artifacts are already here - sixteen repositories pinned by SHA in
 * `packages/detectors-code` and nine pages in `packages/detectors-web` - so the gauntlet draws from
 * them rather than inventing a fixture, and the discrimination table it produces is about the same
 * artifacts the detector is calibrated on. Two numbers about two different corpora would not be
 * comparable, and comparing them is the entire published claim.
 *
 * Both media carry both labels, and that is deliberate. If every generated member were a
 * repository, "which of these is not a repo" would be a different and much easier puzzle than the
 * one the prompt asks, and the rate would be a measurement of that easier puzzle.
 *
 * A member with an `unknown` label is SKIPPED, by name, in the returned list. A round needs a
 * correct answer, and there is no honest way to grade a guess against a label nobody can state.
 */

import type { CorpusCase } from "@slop/core";
import type { GauntletArtifactRow } from "@slop/db";
import { PRESENTATION_VERSION, type PoolArtifact, type PresentedCard, type PresentedPanel } from "./types.js";
import { redactionFor, type Redaction } from "./redact.js";

export interface PoolLoadResult {
  readonly rows: readonly GauntletArtifactRow[];
  /** Named, never silently dropped: a corpus that shrank quietly is a corpus nobody notices dying. */
  readonly skipped: readonly { readonly id: string; readonly reason: string }[];
}

export interface PoolLoadOptions<A> {
  readonly corpus: string;
  readonly cases: readonly CorpusCase<A>[];
  readonly present: (artifactId: string, artifact: A, redaction: Redaction) => PresentedCard;
  readonly addedAt: string;
}

export function poolRowsFromCorpus<A>(options: PoolLoadOptions<A>): PoolLoadResult {
  const rows: GauntletArtifactRow[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const entry of options.cases) {
    if (entry.label !== "human" && entry.label !== "generated") {
      skipped.push({ id: entry.id, reason: `label "${entry.label}" has no correct answer to grade against` });
      continue;
    }
    const redaction = redactionFor(entry);
    rows.push({
      artifactId: `${options.corpus}:${entry.id}`,
      corpus: options.corpus,
      label: entry.label,
      source: entry.source,
      provenance: entry.provenance,
      presentation: options.present(`${options.corpus}:${entry.id}`, entry.artifact, redaction),
      captureDate: entry.capturedAt.slice(0, 10),
      retiredAt: null,
      addedAt: options.addedAt,
    });
  }
  return { rows, skipped };
}

export class MalformedPresentationError extends Error {
  constructor(artifactId: string, detail: string) {
    super(
      `the stored presentation for ${artifactId} is not a card (${detail}). A round built from a ` +
        `half-parsed card would show a player an empty panel and count their answer anyway.`,
    );
    this.name = "MalformedPresentationError";
  }
}

/**
 * Read a stored presentation back, through a real guard.
 *
 * Same reasoning as `asRepoArtifact` in the code detector: a schema drift must fail HERE, loudly,
 * rather than downstream where a missing field reads as an absent tell - or in this case, as a card
 * with nothing on it that the player still has to choose between.
 */
export function asPresentedCard(artifactId: string, value: unknown): PresentedCard {
  if (typeof value !== "object" || value === null) throw new MalformedPresentationError(artifactId, "not an object");
  const v = value as Record<string, unknown>;
  if (v.medium !== "code" && v.medium !== "web") throw new MalformedPresentationError(artifactId, "unknown medium");
  if (typeof v.summary !== "string") throw new MalformedPresentationError(artifactId, "no summary");
  if (v.presentationVersion !== PRESENTATION_VERSION) {
    throw new MalformedPresentationError(
      artifactId,
      `presentation version ${String(v.presentationVersion)}, this build reads ${PRESENTATION_VERSION}`,
    );
  }
  if (!Array.isArray(v.panels)) throw new MalformedPresentationError(artifactId, "no panels");
  const panels: PresentedPanel[] = v.panels.map((p, i) => {
    const panel = p as Record<string, unknown>;
    if (typeof panel.heading !== "string" || !Array.isArray(panel.lines)) {
      throw new MalformedPresentationError(artifactId, `panel ${i} is malformed`);
    }
    return { heading: panel.heading, lines: panel.lines.map(String) };
  });
  return {
    artifactId,
    medium: v.medium,
    summary: v.summary,
    panels,
    presentationVersion: PRESENTATION_VERSION,
  };
}

export function toPoolArtifact(row: GauntletArtifactRow): PoolArtifact {
  return {
    artifactId: row.artifactId,
    corpus: row.corpus,
    label: row.label,
    card: asPresentedCard(row.artifactId, row.presentation),
  };
}
