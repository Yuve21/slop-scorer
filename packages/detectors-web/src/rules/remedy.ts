/**
 * Remediation builders for the web corpus, and the constraint that shapes all of them.
 *
 * THIS MODALITY READS A RENDERED PAGE, NOT A REPOSITORY. That is the methodological line the
 * whole detector lives on, and it has a direct consequence for fixes: we can say exactly what
 * is wrong, on which selector, with which computed value, and we cannot say which file
 * declared it. So no web rule proposes a file edit. The strongest thing a UI finding can
 * carry is a `ui_change`: selector, property, the value read off the page, and the value
 * proposed, with the location of the declaration left to the agent that holds the source.
 *
 * A `ui_change` is only produced where the observation FULLY DETERMINES the replacement. In
 * practice that is a small set: remove a vendor tag, stop an animation, set the canonical to
 * the URL we just fetched, drop a trailing arrow from a label, loosen tracking to the value
 * the rule's own threshold names. Everything else, including every rule whose fix is "write
 * a better sentence" or "choose a different typeface", is a `manual` with the selector on it.
 * Inventing a page title, an alt text or a brand palette and shipping it as a patch would be
 * generating exactly the kind of filler this corpus exists to detect.
 */

import type { BlastRadius, Evidence, ManualRemediation, Remediation, UiChangeRemediation } from "@slop/core";

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

export const manualEach = (
  evidence: readonly Evidence[],
  build: (e: Evidence) => Omit<ManualSpec, "locator">,
): readonly Remediation[] => evidence.map((e) => manual({ locator: e.locator, ...build(e) }));

export const manualOnce = (evidence: readonly Evidence[], spec: Omit<ManualSpec, "addresses">): readonly Remediation[] => [
  manual({ ...spec, addresses: evidence.map((e) => e.locator) }),
];

export interface UiChangeSpec {
  readonly selector: string;
  readonly property: string;
  readonly before: string;
  readonly after: string;
  readonly summary: string;
  readonly doNotApplyIf: string;
  readonly sourceHint: string;
  readonly addresses: readonly string[];
  readonly blastRadius?: BlastRadius;
}

export const uiChange = (spec: UiChangeSpec): UiChangeRemediation => ({
  kind: "ui_change",
  selector: spec.selector,
  property: spec.property,
  before: spec.before,
  after: spec.after,
  sourceHint: spec.sourceHint,
  summary: spec.summary,
  doNotApplyIf: spec.doNotApplyIf,
  blastRadius: spec.blastRadius ?? "file",
  addresses: spec.addresses,
  rebuttal: REBUTTAL_FILLED_BY_ATTACH,
});

/** Strip the trailing arrow glyph from a call-to-action label. Fully determined by the text. */
export const withoutTrailingArrow = (label: string): string => label.replace(/\s*(→|->|›|»)\s*$/, "").trim();
