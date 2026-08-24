/**
 * Watermarks: detect-if-present, NEVER infer-if-absent.
 *
 * Every watermark scheme worth naming here (SynthID, C2PA durable soft bindings, IPTC-linked
 * invisible marks) shares two properties that decide the shape of this module:
 *
 *  1. Detection requires the SCHEME OWNER'S detector. SynthID's is not public; a C2PA soft
 *     binding needs the matching binding algorithm. We can be told a result; we cannot
 *     compute one. So a probe here is TRI-STATE, and `not_checked` is the default.
 *  2. Absence proves nothing, and unusually strongly. Saberi et al. (ICLR 2024) prove an
 *     evasion/spoofing tradeoff that is fundamental rather than an engineering gap:
 *     diffusion purification drops watermark AUROC below chance-adjacent levels, and
 *     UnMarker (IEEE S&P 2025) is a universal attack needing no detector feedback. A
 *     screenshot removes most schemes for free. `not_detected` therefore never produces a
 *     finding, and the type below makes that structural rather than a matter of care.
 *
 * The inverse risk is real too: the same literature shows real images can be perturbed to
 * carry a mark. So a positive detection is evidence about the FILE carrying a mark, phrased
 * that way, and it is not proof about who made what.
 */

export type WatermarkScheme = "synthid" | "c2pa-soft-binding" | "iptc-invisible" | "provider-specific";

export type WatermarkOutcome =
  /** The scheme's detector ran and reported a mark. */
  | "present"
  /**
   * The scheme's detector ran and reported nothing. This produces NO finding. Not "probably
   * not generated", not counter-evidence, not a clean bill. Nothing.
   */
  | "not_detected"
  /** No detector for this scheme was available in this run. The default. */
  | "not_checked";

export interface WatermarkProbe {
  readonly scheme: WatermarkScheme;
  readonly outcome: WatermarkOutcome;
  /** Who ran the detector. Required for `present`: an unsourced positive is a rumour. */
  readonly detector: string | null;
  /** Where in the artifact, for a detector that reports a location. */
  readonly locator: string | null;
  /** The detector's own message, verbatim. */
  readonly note: string;
}

export const notChecked = (scheme: WatermarkScheme, why: string): WatermarkProbe => ({
  scheme,
  outcome: "not_checked",
  detector: null,
  locator: null,
  note: why,
});

/**
 * The default probe set for any artifact this build sees.
 *
 * All three are `not_checked` and each one says why in a sentence a user can read. That is
 * the honest state of the world for a build with no vendor detector wired in, and printing
 * it is better than the alternative, which is a report that silently looks like it checked.
 */
export const DEFAULT_WATERMARK_PROBES: readonly WatermarkProbe[] = [
  notChecked(
    "synthid",
    "SynthID detection is only available through Google's own tooling; this build has no detector for it, so no " +
      "conclusion was drawn either way.",
  ),
  notChecked(
    "c2pa-soft-binding",
    "A C2PA durable soft binding needs the matching binding algorithm and a manifest store lookup. Neither was " +
      "performed here.",
  ),
  notChecked(
    "provider-specific",
    "Several image and audio services apply their own invisible marks with private detectors. None was queried.",
  ),
];

/** Only a `present` probe from a named detector may produce a finding. Enforced, not asked. */
export function citableWatermarks(probes: readonly WatermarkProbe[]): readonly WatermarkProbe[] {
  return probes.filter((p) => p.outcome === "present" && !!p.detector && !!p.locator);
}

/**
 * The rebuttal that rides with any watermark statement, including silence.
 */
export const WATERMARK_ABSENCE_NOTE =
  "A watermark that is not detected is not a finding. Published attacks remove these marks without access to the " +
  "detector, an ordinary screenshot removes most of them by accident, and no mainstream scheme is applied by more " +
  "than a handful of producers in the first place.";
