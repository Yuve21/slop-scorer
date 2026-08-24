/**
 * Remediation builders for the code corpus.
 *
 * Thin, deliberately. The interesting decision is not how a patch is constructed, it is
 * WHICH findings get one, and that decision is made next to each rule in its own family
 * file, where the person changing the rule will see it.
 *
 * The line this corpus holds: a rule proposes an applicable patch only when the artifact
 * records enough to make the edit unambiguous, which in practice means the record holds the
 * RAW LINE. A comment body is stored without its marker and a block comment is stored
 * against the line its first delimiter is on, so "delete the comment on line 12" cannot be
 * expressed as a line deletion without risking cutting a block open. Those become `manual`
 * with the exact locator, which is worth more than a patch that is right most of the time.
 */

import type { BlastRadius, Evidence, ManualRemediation, Remediation } from "@slop/core";

/** The rebuttal is injected by `attachRemedies` from the rule's own false-positive note. */
const REBUTTAL_FILLED_BY_ATTACH = "";

export interface ManualSpec {
  readonly locator: string;
  readonly summary: string;
  readonly guidance: string;
  readonly doNotApplyIf: string;
  readonly addresses?: readonly string[];
  readonly blastRadius?: BlastRadius;
}

export const manual = (spec: ManualSpec): ManualRemediation => ({
  kind: "manual",
  locator: spec.locator,
  summary: spec.summary,
  guidance: spec.guidance,
  doNotApplyIf: spec.doNotApplyIf,
  blastRadius: spec.blastRadius ?? "file",
  addresses: spec.addresses ?? [spec.locator],
  rebuttal: REBUTTAL_FILLED_BY_ATTACH,
});

/** One manual remediation per citation. The default for anything a person has to decide. */
export const manualEach = (
  evidence: readonly Evidence[],
  build: (e: Evidence) => Omit<ManualSpec, "locator">,
): readonly Remediation[] => evidence.map((e) => manual({ locator: e.locator, ...build(e) }));

/** One manual remediation for the whole finding, for rules whose evidence is a measurement. */
export const manualOnce = (evidence: readonly Evidence[], spec: Omit<ManualSpec, "addresses">): readonly Remediation[] => [
  manual({ ...spec, addresses: evidence.map((e) => e.locator) }),
];

/** `path:line` back to its two halves. Evidence in this corpus writes locators that way. */
export const lineOf = (locator: string): { readonly path: string; readonly line: number } | null => {
  const at = locator.lastIndexOf(":");
  if (at <= 0) return null;
  const line = Number(locator.slice(at + 1));
  if (!Number.isInteger(line) || line < 1) return null;
  return { path: locator.slice(0, at), line };
};

/**
 * The sentence attached to every "there is no edit here" remediation.
 *
 * Shape observations (function length, file length, commit rhythm) are in the corpus because
 * they move a score, not because they name something to change. Saying so out loud is the
 * honest end of the loop: an agent that is told to skip three findings has learned something
 * a list of prevention hints would not have told it.
 */
export const NOTHING_TO_APPLY =
  "No edit follows from this finding. It is a distribution measured across the repository, capped so that it cannot carry a verdict on its own, and reshaping code to move it would be optimising for the detector rather than for the reader.";
